/*jshint esversion: 6*/
const BigNumber = web3.BigNumber;
const privateKeys = require('./truffle-keys').private;
const publicKeys = require('./truffle-keys').public;
const EthereumTx = require('ethereumjs-tx');
var init_erc20_tok = require("./3_init_TBD_erc20.js");
var storage_registry = artifacts.require("./RewardDistributor.sol");
var sha256coder = require('js-sha256').sha256;
var crypto_js = require("crypto-js");

var proof_of_stake_balance = 100;
var decimals = 18;
var filesize_to_token_ex = 200 * 1000 * 1000 * 1000; // 1token = 200GB
/* jshint ignore:start */
var eth_to_wei = new BigNumber(10**decimals);
/* jshint ignore:end */
var defaultTotalSupply = new BigNumber(1000000000).mul(eth_to_wei); // 1billion * 10**18
var pre_fund_amount = new BigNumber(1000000).mul(eth_to_wei); // 1M init token for trading
// fund traing and reward contract 1M each
var contractCreatorRemainBalance = defaultTotalSupply.minus(pre_fund_amount.times(2)); // account[0]

/***********************
 * FUNCTION DEFINITION *
 ***********************/
function logging(msg) {
  // Define a CSS to format the text
  console.log('\x1b[47m\x1b[30m[RR]>>> ' + msg + '\x1b[0m');
}

function loggingEvent(details) {
  // Define a CSS to format the text
  console.log('\x1b[46m\x1b[30m[RR]>>> [Event][' + details.event + ']' + JSON.stringify(details.args) + '\x1b[0m');
}

function printData(data) {
  var str = '';
  for (var k in data) {
      if (typeof data[k] == 'object') str += k + printData(data[k]) + ' ';
      else str += k + ' => ' + data[k] + '\n';
  }
  return str;
}

function rawTransaction(
  senderPublicKey,
  senderPrivateKey,
  contractAddress,
  data,
  value
) {
  return new Promise((resolve, reject) => {

    let key = new Buffer(senderPrivateKey, 'hex');
    // required to keep track of tx#
    let nonce = web3.toHex(web3.eth.getTransactionCount(senderPublicKey));

    let gasPrice = web3.eth.gasPrice;
    let gasPriceHex = web3.toHex(web3.eth.estimateGas({
      from: contractAddress
    }));
    let gasLimitHex = web3.toHex(5500000);

    let rawTx = {
        nonce: nonce,
        gasPrice: gasPriceHex,
        gasLimit: gasLimitHex,
        data: data,
        to: contractAddress,
        value: web3.toHex(value)
    };
    console.log('tx data includes: ' + printData(rawTx));
    let tx = new EthereumTx(rawTx);
    tx.sign(key);

    let stx = '0x' + tx.serialize().toString('hex');

    web3.eth.sendRawTransaction(stx, (err, hash) => {
      if (err) {
        reject(err);
      } else {
        resolve(hash);
      }
    });
  });
} // end function

// This is only for test, do NOT use this anywhere else. A dummy PRNG.
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// This is only for test and prototype, do NOT use this anywhere else. A dummy random-length key generator.
function genRandomKey() {
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let keylen = getRandomInt(128, 1024);
  for (var i = 0; i < keylen; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function shuffleString(str) {
  var tmp, current, top = str.length;

  if(top) while(--top) {
      current = Math.floor(Math.random() * (top + 1));
      tmp = str[current];
      str[current] = str[top];
      str[top] = tmp;
  }

  return str;
}
/***************************
 * END FUNCTION DEFINITION *
 ***************************/
 
 // accounts[0] = deployer (ERC20 token owner). It pre-funds 2 contracts.
 // accounts[1] = registry_contract (pre-fund with 1M token from accounts[0])
contract('RewardDistributor', function(accounts) {
  describe("RewardDistributor contract creation and inspection before testing", function() {
    let erc20tok = null;
    /* jshint ignore:start */
    it("should have the shared context", async function() {
      context = await init_erc20_tok.run(accounts);
      erc20tok = context.erc20tokInstance;
      assert(erc20tok !== undefined, 'has been assigned with ERC20 contract instance');
    });

    it('contract deployer accounts[0]=' + accounts[0] + " should have init balance of " + contractCreatorRemainBalance + " TBD tokens by default", async function() {
      let registry_instance = null;

      registry_instance = await storage_registry.deployed(erc20tok.address, true, proof_of_stake_balance, {from: accounts[1]});
      let balance = (await erc20tok.balanceOf.call(accounts[0])).toNumber();
      assert.equal(balance.valueOf(),
                   contractCreatorRemainBalance,
                   contractCreatorRemainBalance + " wasn't in the first account " + accounts[0]);
      console.log('RewardDistributor deployed with address ' +
                  registry_instance.address +
                  ' trading erc20 token address ' +
                  erc20tok.address);
      let erc20_addr = (await registry_instance.currentTokenContract.call());
      assert.equal(erc20_addr,
                  erc20tok.address,
                  'RewardDistributor contract should hold ERC20 contract address ' + erc20tok.address);
    });
  });

  describe("RewardDistributor exchanging token with Ether test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      registry_contract = (await storage_registry.deployed(erc20_contract.address, true, proof_of_stake_balance, {from: accounts[1]}));
      web3Contract = web3.eth.contract(registry_contract.abi).at(registry_contract.address);
      owner = web3Contract._eth.coinbase;
      logging('ERC20 Token Contract Address=' + erc20_contract.address);
      logging('RewardDistributor Contract Address=' + registry_contract.address);
      logging('accounts[0]=' + accounts[0]);
      logging('owner=' + owner + ' publicKeys[0]=' + publicKeys[0]);
      logging('other=' + accounts[1] + ' publicKeys[1]=' + publicKeys[1]);
      let other = publicKeys[1];
  
      // Verifying that you have specified the right key for testing in ganache-cli
      if (publicKeys[0] !== owner || publicKeys[1] !== other) {
        throw new Error('Use `truffle develop` and store the keys in ./test/truffle-keys.js' +
        ', and make sure you specify these keys in ganache-cli');
      }
  
      // Tracks all events for later verification, count may be sufficient?
      registry_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
        }
      });

      // Init balance verification
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('accounts[0]=' + accounts[0] + ' has start token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has start token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has start token balance ' + t0);
      assert.equal(e0, 0, 'erc20 contract should have 0 balance');
      assert.equal(a0, contractCreatorRemainBalance, 'accounts[0]=' + accounts[0] + ' should have balance ' + contractCreatorRemainBalance);
      assert.equal(t0, pre_fund_amount, 'registry contract=' + registry_contract.address + ' has init balance ' + pre_fund_amount.times(2));
    });

    it('should NOT be able to exchangeToken for non-owner', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      let notOwner = publicKeys[5];
      let notOwnerPrivateKey = privateKeys[5];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let before_balance = web3.eth.getBalance(registry_contract.address).toNumber();
      logging('publicKeys[5]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has init Ether balance ' + before_balance);

      let value = 1; // 1 eth = 1 * 10 ** 18 wei. This needs to align with the contract

      let data = "";

      let result = await tryCatch(
        rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        registry_contract.address,
        data,
        value
      ), errTypes.revert);

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      let after_balance = web3.eth.getBalance(registry_contract.address).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has new token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has new token balance ' + t0);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has new Ether balance ' + after_balance);
      assert.strictEqual(before_balance, after_balance);
    });

    it('should have the same init balance after revert', async function() {
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has new token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has new token balance ' + t0);
      assert.equal(a0, contractCreatorRemainBalance, 'accounts[0] should have remaining balance ' + contractCreatorRemainBalance);
      assert.equal(e0, 0, 'erc20 token balance should remain 0');
      assert.equal(t0, pre_fund_amount.toNumber(), 'registry contract should have token balance ' + pre_fund_amount);
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("RewardDistributor registering IPFS test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;
    let ipfs_test_string = 'QmYrPebEaSZxmRqduAuJE5Wry8WYVM9hDtRiUqYkGcB86S';
    let ipfs_test_filesize = 1599;
    let spent_ether = 0; // no eth should be exchanged in this contract
    let default_init_balance = pre_fund_amount;
    /* jshint ignore:start */
    let expected_balance = (new BigNumber(ipfs_test_filesize).mul(eth_to_wei)).div(filesize_to_token_ex);
    /* jshint ignore:end */

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      registry_contract = (await storage_registry.deployed(erc20_contract.address, true, proof_of_stake_balance, {from: accounts[1]}));
      web3Contract = web3.eth.contract(registry_contract.abi).at(registry_contract.address);
      owner = web3Contract._eth.coinbase;
      logging('ERC20 Token Contract Address=' + erc20_contract.address);
      logging('RewardDistributor Contract Address=' + registry_contract.address);
      assert.equal(owner, publicKeys[0], 'accounts[0] and publicKeys[0] wallet mismatch!');
      assert.equal(accounts[1], publicKeys[1], 'accounts[1] and publicKeys[1] wallet mismatch!');
      let other = publicKeys[1];
  
      // Verifying that you have specified the right key for testing in ganache-cli
      if (publicKeys[0] !== owner || publicKeys[1] !== other) {
        throw new Error('Use `truffle develop` and store the keys in ./test/truffle-keys.js' +
        ', and make sure you specify these keys in ganache-cli');
      }

      let pre_fund_completed = (await erc20_contract.transfer(registry_contract.address, pre_fund_amount.toNumber(), {from: accounts[0]}));
      logging('pre-funding registry_contract ' + registry_contract.address + ' with additional tokens ' + pre_fund_amount);
      // Update default balance after new transfer
      default_init_balance = default_init_balance.add(pre_fund_amount);

      // Tracks all events for later verification, count may be sufficient?
      registry_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
        }
      });

      let reg_init_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      assert.equal(reg_init_balance, default_init_balance.toNumber(), 'registry contract should have balance ' + default_init_balance);
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      assert.equal(t0, default_init_balance.toNumber(), "registry_contract " + registry_contract.address +
        " contract should still have remaining " + default_init_balance + " tokens in accounts[1]=" + accounts[1]);
    });

    it('should be able to register IPFS hash for non-owner', async function() {
      let notOwner = publicKeys[5];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let before_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract.address=' + registry_contract.address + ' has start token balance ' + before_balance);
      logging('publicKeys[5]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      assert.equal(notOwnerBalanceBefore, 0, 'publicKeys[5]=' + notOwner + ' should have 0 token');
      let reg_wallet_eth_before = new BigNumber(web3.eth.getBalance(registry_contract.address).toNumber());

      let eth_value = new BigNumber(1).mul(eth_to_wei); // 1 eth = 1 * 10 ** 18 wei. This needs to align with the contract
      let reg_successful = (await registry_contract.registerIPFS(ipfs_test_string, ipfs_test_filesize, {value: eth_value, from: notOwner}))
      logging('register IPFS status = ' + reg_successful.toString());

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      let reg_wallet_eth_after = new BigNumber(web3.eth.getBalance(registry_contract.address).toNumber());
      
      assert.strictEqual(reg_wallet_eth_before.add(eth_value).toNumber(), reg_wallet_eth_after.toNumber(), 'registry contract wallet should receive additional Eth ' + eth_value);
      assert.strictEqual(notOwnerBalanceAfter, expected_balance.toNumber(), 'it should get ' + expected_balance + ' tokens for file size ' + ipfs_test_filesize);
      assert.strictEqual(t0, before_balance - expected_balance.toNumber(), 'registry contract token should have remaining balance ' + (before_balance - expected_balance.toNumber()));
    });

    it('should be able to fetch the IPFS hash by their wallet', async function() {
      let notOwner = publicKeys[5];
      let queried_ipfs = (await registry_contract.queryIPFSList(notOwner, {from: notOwner})).toString();
      logging('fetched IPFS hash = ' + queried_ipfs);
      assert.equal(queried_ipfs, ipfs_test_string, 'it should get ipfs hash ' + ipfs_test_string);

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging('publicKeys[5]=' + notOwner + ' has token balance ' + notOwnerBalanceBefore);
      t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      assert.equal(t0, default_init_balance.sub(expected_balance).toNumber(), 'registry contract token should remain unchanged with balance ' + default_init_balance.sub(expected_balance));
      assert.equal(notOwnerBalanceBefore, expected_balance, 'publicKeys[5]=' + notOwner + ' token balance should remain the same');
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("RewardDistributor ipfs metadata and encrypting IPFS test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;
    let default_init_balance = 0;
    let rewardexchanger = publicKeys[4]; // the wallet that can modify the exchange rate

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      registry_contract = (await storage_registry.deployed(erc20_contract.address, true, proof_of_stake_balance, {from: accounts[0]}));
      web3Contract = web3.eth.contract(registry_contract.abi).at(registry_contract.address);
      owner = web3Contract._eth.coinbase;
      logging('ERC20 Token Contract Address=' + erc20_contract.address);
      logging('RewardDistributor Contract Address=' + registry_contract.address);
      logging('accounts[0]=' + accounts[0]);
      logging('owner=' + owner + ' publicKeys[0]=' + publicKeys[0]);
      logging('other=' + accounts[1] + ' publicKeys[1]=' + publicKeys[1]);
      let other = publicKeys[1];
  
      // Verifying that you have specified the right key for testing in ganache-cli
      if (publicKeys[0] !== owner || publicKeys[1] !== other) {
        throw new Error('Use `truffle develop` and store the keys in ./test/truffle-keys.js' +
        ', and make sure you specify these keys in ganache-cli');
      }
  
      // Tracks all events for later verification, count may be sufficient?
      registry_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
          loggingEvent(details);
        }
      });

      erc20_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
          loggingEvent(details);
        }
      });

      (await erc20_contract.register_rewardcontract(registry_contract.address));

      let before_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      default_init_balance = before_balance;
      logging('registry contract ' + registry_contract.address + ' has init balance ' + default_init_balance);
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract=' + registry_contract.address + ' has init token balance ' + t0);
      assert.equal(t0, default_init_balance, 'registry_contract ' + registry_contract.address +
        ' contract should still have ' + default_init_balance + ' tokens');
    });

    it('ERC20 contract should have pre-registered the correct reward contract address before serving', async function() {
      let erc20_reg_reward_address = (await erc20_contract.reward_contract.call()).toString();
      logging('ERC20 contract registered reward contract address = ' + erc20_reg_reward_address);
      assert.equal(erc20_reg_reward_address, registry_contract.address, "erc20 contract should have registry_contract address" + 
        erc20_reg_reward_address);
    });

    it('should be able to register metadata and an encrypted hash by any user', async function() {
      let notOwner = publicKeys[6];
      let expect_reward = (new BigNumber(41).mul(eth_to_wei)).div(filesize_to_token_ex);
      // The content for the IPFS hash is 'This is the content for testing.' excluding the single quote in the file.
      // The encryption here we use is a simple 1-way hash with SHA256SUM which derives:
      // c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be
      let realIPFSHash = "QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd";
      let potential_key = "abcd1234ABCD1234"; // replace genRandomKey() with static password for predictable test
      let l_rand = 113; // replace getRandomInt(113, 997) with predictable result for test
      let ipfssha256 = sha256coder(realIPFSHash);
      assert.equal(ipfssha256, 'c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be', 'sha256 lib not compatible, expecting sha256 c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be but got ' + ipfssha256);
      // TODO: What is the chances of collision here?
      let key2ndIdx = shuffleString(l_rand + ipfssha256 + sha256coder(potential_key));
      logging("shuffled idx = " + key2ndIdx);
      // Example: shuffle/encrypt real key to disguise
      let c_gen = (await registry_contract.generateLocalRand(key2ndIdx, l_rand, {from: notOwner}));
      logging("contract generate random number " + JSON.stringify(c_gen));
      let c_rand = (await registry_contract.getLocalRand.call(key2ndIdx, {from: notOwner})).toNumber();
      logging("contract return random number " + c_rand);

      let realKey = potential_key + c_rand; // predictable combination for FULL key
      logging("generated encryption key = " + realKey);
      let encryptedIPFSHash = crypto_js.AES.encrypt(realIPFSHash, realKey).toString();
      logging("ipfs encrypted to " + encryptedIPFSHash);
      // Decrypt test
      let decryptIPFSHash = crypto_js.AES.decrypt(encryptedIPFSHash, realKey);
      var originalText = decryptIPFSHash.toString(crypto_js.enc.Utf8);
      logging("ipfs decrypted to " + originalText);
      assert.equal(realIPFSHash, originalText, "aes encrypt and decrypt with same key error!");
      // Metadata generated for above content in our test case is the following
      let testMetadata = '{'
      + '"description": ' + '"whatever you want to put here",'
      + '"filesize": ' + '41,'
      + '"encrypted": ' + '"' + ipfssha256 + '"'
      + '}';
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      logging('normalized_json=' + normalized_testMetadata);
      let normalize_ipfsMetadata = "QmVuzUF8bsKtb9khL3mEnhkedH2buYveJCgnzzCJjvcsAo";

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, potential_key, key2ndIdx, encryptedIPFSHash, 41, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, expect_reward, "expected reward should be 205000000");
      logging('registry contract should have the same remaining balance ' + default_init_balance);
      let reg_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      assert.equal(reg_balance, default_init_balance, 'registry contract should not lose any tokens');
    }); // end test case
 

    it('should be able to register metadata and a 1G file by another user', async function() {
      let notOwner = publicKeys[7]; // uploading 1G
      let expect_reward = (new BigNumber(1073741824).mul(eth_to_wei)).div(filesize_to_token_ex);
      // a 1073741824 bytes file with all 0 in it.
      let realIPFSHash = "QmdiETTY5fiwTkJeERbWAbPKtzcyjzMEJTJJosrqo2qKNm";
      let potential_key = "xyzXY1234"; // replace genRandomKey() with static password for predictable test
      let l_rand = 997; // replace getRandomInt(113, 997) with predictable result for test
      let ipfssha256 = sha256coder(realIPFSHash);
      assert.equal(ipfssha256, '92b73a3c06a93b0a5f8d0974efcae2d414015979f577679ae48f71ddf5ac2d33', 'sha256 lib not compatible, expecting sha256 92b73a3c06a93b0a5f8d0974efcae2d414015979f577679ae48f71ddf5ac2d33 but got ' + ipfssha256);
      // TODO: What is the chances of collision here?
      let key2ndIdx = shuffleString(l_rand + ipfssha256 + sha256coder(potential_key));
      logging("shuffled idx = " + key2ndIdx);
      // Example: shuffle/encrypt real key to disguise
      let c_gen = (await registry_contract.generateLocalRand(key2ndIdx, l_rand, {from: notOwner}));
      logging("contract generate random number " + JSON.stringify(c_gen));
      let c_rand = (await registry_contract.getLocalRand.call(key2ndIdx, {from: notOwner})).toNumber();
      logging("contract return random number " + c_rand);

      let realKey = potential_key + c_rand; // predictable combination for FULL key
      logging("generated encryption key = " + realKey);
      let encryptedIPFSHash = crypto_js.AES.encrypt(realIPFSHash, realKey).toString();
      logging("ipfs encrypted to " + encryptedIPFSHash);
      // Decrypt test
      let decryptIPFSHash = crypto_js.AES.decrypt(encryptedIPFSHash, realKey);
      var originalText = decryptIPFSHash.toString(crypto_js.enc.Utf8);
      logging("ipfs decrypted to " + originalText);
      assert.equal(realIPFSHash, originalText, "aes encrypt and decrypt with same key error!");
      // Metadata generated for above content in our test case is the following
      let testMetadata = '{'
      + '"description": ' + '"an 1G file",'
      + '"filesize": ' + '1073741824,'
      + '"encrypted": ' + '"' + ipfssha256 + '"'
      + '}';
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      logging('normalized_json=' + normalized_testMetadata);
      let normalize_ipfsMetadata = "QmWqRJZghQftthJDVqJFNvB5ScatZFTp259sTAVesquLWv";

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[7]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, potential_key, key2ndIdx, encryptedIPFSHash, 1073741824, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[7]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, expect_reward, "expected reward should be 5368709120000000");
    }); // end test case

    /**
     * The original registerar should obtain additional tokens when the other user purchase it.
     */
    it('should be able to buy and retrieve the IPFS hash by any user with tokens', async function() {
      let uploader = publicKeys[6];
      let purchaser = publicKeys[7];
      let normalize_ipfsMetadata = "QmVuzUF8bsKtb9khL3mEnhkedH2buYveJCgnzzCJjvcsAo";

      let uploaderBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("existing balance for " + uploader + " is " + uploaderBalance);
      assert.equal(uploaderBalance, 205000000, "expected existing balance to be 205000000");

      let purchaserBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("existing balance for " + purchaser + " is " + purchaserBalance);
      // assert.equal(purchaserBalance, 5368709120000000, "expected existing balance to be 5368709120000000");

      let results = (await registry_contract.decryptIPFS.call(normalize_ipfsMetadata, {from: purchaser}))
      logging('fetching decrypted IPFS hash pkey = ' + results[0]);
      logging('fetching decrypted IPFS hash rkey = ' + results[1]);
      logging('fetching decrypted IPFS hash encryptedIpfs = ' + results[2]);
      logging('fetching decrypted IPFS hash cost = ' + results[3]);
      assert.equal(results[0], "abcd1234ABCD1234", "Expecting the pkey to be abcd1234ABCD1234");
      assert.equal(results[1], 8, "Expecting the remote random number to be 8");
      assert.equal(results[3], 205000000, "Expecting the minimal cost to be 205000000");

      let uploaderNewBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("new balance for " + uploader + " is " + uploaderNewBalance);
      // assert.equal(uploaderNewBalance, 330000000, "expected new balance should be 330000000");

      let purchaserNewBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("new balance for " + purchaser + " is " + purchaserNewBalance);
      // assert.equal(purchaserNewBalance, 5368708955000000, "expected remaining balance should be 5368708955000000");

    }); // end test case

    it('should NOT be able to set reward exchange rate before it is delegated', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      // Should trigger a revert
      await tryCatch(registry_contract.setRewardExchangeRate(100 * 1000 * 1000 * 1000) , errTypes.revert);
      let ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      logging("Trading contract current exchange rate is " + ex_rate);
      assert(ex_rate, filesize_to_token_ex, "exchange rate shall not change before delegation occurs!");
      (await registry_contract.delegateExchangerAddress(rewardexchanger));
      filesize_to_token_ex = 100 * 1000 * 1000 * 1000;
      let shall_pass_result = (await registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: rewardexchanger}));
      logging(shall_pass_result);
      let new_ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      assert(new_ex_rate, filesize_to_token_ex, "exchange rate shall not change before delegation occurs!");
      logging("Trading contract new exchange rate is " + new_ex_rate);
      let prev_ex_rate = filesize_to_token_ex;
      filesize_to_token_ex = 200 * 1000 * 1000 * 1000;
      // This should fail, even it is triggered from the contract owner or any other non-dedicated wallet
      await tryCatch(registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: accounts[3]}) , errTypes.revert);
      await tryCatch(registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: accounts[2]}) , errTypes.revert);
      await tryCatch(registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: accounts[0]}) , errTypes.revert);
      new_ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      assert(new_ex_rate, prev_ex_rate, "exchange rate shall not change if it was triggered by the contract owner!");
      shall_pass_result = (await registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: rewardexchanger}));
      logging(shall_pass_result);
      new_ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      assert(new_ex_rate, filesize_to_token_ex, "exchange rate shall not change before delegation occurs!");
    });
    /* jshint ignore:end */
  }); // end of describe

}); // end of contract
