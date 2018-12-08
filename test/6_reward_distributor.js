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
var filesize_to_token_ex = 200 * 1024 * 1024 * 1024; // 1token = 200GB
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

  describe("RewardDistributor ipfs metadata and encrypting IPFS test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;
    let default_init_balance = new BigNumber(0);
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

      let before_balance = (await erc20_contract.balanceOf.call(registry_contract.address));
      default_init_balance = before_balance;
      logging('registry contract ' + registry_contract.address + ' has init balance ' + default_init_balance);
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract=' + registry_contract.address + ' has init token balance ' + t0);
      assert.equal(t0, default_init_balance.toNumber(), 'registry_contract ' + registry_contract.address +
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
      // TODO: this is a week randomness and small domain to brute force attack. Expand it.
      let c_rand = Math.floor(l_rand / 13);
      logging("contract expect random number " + c_rand);

      let realKey = potential_key + c_rand; // predictable combination for FULL key
      logging("generated encryption key = " + realKey);
      assert.equal(realKey, 'abcd1234ABCD12348', 'generating random number has changed, encryption is not backward compatible!');
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
      + '"encrypted": ' + '"' + encryptedIPFSHash + '"'
      + '}';
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      logging('normalized_json=' + normalized_testMetadata);
      let normalize_ipfsMetadata = "QmVuzUF8bsKtb9khL3mEnhkedH2buYveJCgnzzCJjvcsAo";

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, potential_key, key2ndIdx, l_rand, encryptedIPFSHash, 41, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, Math.floor(expect_reward.toNumber()), "expected reward should be 190921127");
      let reg_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry contract now has remaining balance ' + reg_balance);
      let new_default_init_balance = (default_init_balance.sub(expect_reward));
      assert.equal(reg_balance,
                   new_default_init_balance.toNumber(),
                   'registry contract should have the remaining tokens ' + new_default_init_balance);
      default_init_balance = new_default_init_balance;
      logging('the calculated remaining balance should be the same as ' + new_default_init_balance);
    }); // end test case

    it('should be able to register metadata and a 1G file by another user', async function() {
      let notOwner = publicKeys[7]; // uploading 1G
      // This returns a perfect integer without floating points, no need for Math.floor
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
      let c_rand = Math.floor(l_rand / 13);
      logging("contract expect random number " + c_rand);

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
      + '"encrypted": ' + '"' + encryptedIPFSHash + '"'
      + '}';
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      logging('normalized_json=' + normalized_testMetadata);
      let normalize_ipfsMetadata = "QmWqRJZghQftthJDVqJFNvB5ScatZFTp259sTAVesquLWv";

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[7]=" + notOwner + " is " + notOwnerBalanceBefore);
      // potential_key = first half of the key
      // key2ndIdx= points to the 2nd half of the key
      // encryptedIPFSHash = index 
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, potential_key, key2ndIdx, l_rand, encryptedIPFSHash, 1073741824, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[7]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, expect_reward, "expected reward should be 5000000000000000");
      let reg_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      let new_default_init_balance = (default_init_balance.sub(expect_reward));
      assert.equal(reg_balance,
                   new_default_init_balance.toNumber(),
                   'registry contract should have the remaining tokens ' + new_default_init_balance);
      default_init_balance = new_default_init_balance;
      logging('registry contract has remaining balance ' + reg_balance);
      logging('the calculated remaining balance should be the same as ' + new_default_init_balance);
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
      assert.equal(uploaderBalance, 190921127, "expected existing balance to be 190921127");

      let purchaserBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("existing balance for " + purchaser + " is " + purchaserBalance);
      assert.equal(purchaserBalance, 5000000000000000, "expected existing balance to be 5000000000000000");

      let decrypt_results = (await registry_contract.decryptIPFS(normalize_ipfsMetadata, {from: purchaser}))
      logging('register encrypted IPFS status = ' + JSON.stringify(decrypt_results.logs));
      let results = (await registry_contract.fetchKeyForIPFS({from: purchaser}))
      logging('fetching decrypted 1st_partial_key=' + results[0] + " 2nd_partial_key=" + results[1] + " encryptedHash=" + results[2] + " cost=" + results[3]);
      let realKey = results[0] + '' + results[1]; // predictable combination for FULL key
      logging('AES encryption key is = ' + realKey);
      let decryptIPFSHash = crypto_js.AES.decrypt(results[2], realKey).toString(crypto_js.enc.Utf8);
      assert.equal(decryptIPFSHash, "QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd", "Expecting the real IPFS decrypted hash to be QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd");
      assert.equal(results[3].toNumber(), 190921127, "The cost to purchase encryptedIdx c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be should be 190921127");

      let uploaderNewBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("new balance for uploader = " + uploader + " is " + uploaderNewBalance);
      assert.equal(uploaderNewBalance, (uploaderBalance + results[3].toNumber()), "expected new balance should be 381842254");

      let purchaserNewBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("new balance for purchaser = " + purchaser + " is " + purchaserNewBalance);
      assert.equal(purchaserNewBalance, (purchaserBalance - results[3].toNumber()), "expected remaining balance should be 4999999809078873");

    }); // end test case

    it('should NOT be able to set reward exchange rate before it is delegated', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      // Should trigger a revert
      await tryCatch(registry_contract.setRewardExchangeRate(100 * 1024 * 1024 * 1024) , errTypes.revert);
      let ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      logging("Trading contract current exchange rate is " + ex_rate);
      assert(ex_rate, filesize_to_token_ex, "exchange rate shall not change before delegation occurs!");
      (await registry_contract.delegateExchangerAddress(rewardexchanger));
      filesize_to_token_ex = 100 * 1024 * 1024 * 1024;
      let shall_pass_result = (await registry_contract.setRewardExchangeRate(filesize_to_token_ex, {from: rewardexchanger}));
      logging(shall_pass_result);
      let new_ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      assert(new_ex_rate, filesize_to_token_ex, "exchange rate shall not change before delegation occurs!");
      logging("Trading contract new exchange rate is " + new_ex_rate);
      let prev_ex_rate = filesize_to_token_ex;
      filesize_to_token_ex = 200 * 1024 * 1024 * 1024;
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

  describe("RewardDistributor filesize exchange rate update and parallel access for encrypted IPFS test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;
    let default_init_balance = new BigNumber(0);
    let rewardexchanger = publicKeys[4]; // the wallet that can modify the exchange rate
    let new_filesize_token_ex = 100 * 1024 * 1024 * 1024; // 100GB / token

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

      let before_balance = (await erc20_contract.balanceOf.call(registry_contract.address));
      default_init_balance = before_balance;
      logging('registry contract ' + registry_contract.address + ' has init balance ' + default_init_balance);
      (await registry_contract.delegateExchangerAddress(rewardexchanger));
      let shall_pass_result = (await registry_contract.setRewardExchangeRate(new_filesize_token_ex, {from: rewardexchanger}));
      logging(shall_pass_result);
      let new_ex_rate = (await registry_contract.defaultRewardFileSize.call()).toNumber();
      assert(new_ex_rate, new_filesize_token_ex, "exchange rate shall not change before delegation occurs!");
      logging("Reward contract new filesize exchange rate is " + new_ex_rate);
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract=' + registry_contract.address + ' has init token balance ' + t0);
      assert.equal(t0, default_init_balance.toNumber(), 'registry_contract ' + registry_contract.address +
        ' contract should still have ' + default_init_balance + ' tokens');
    });

    it('ERC20 contract should have pre-registered the correct reward contract address before serving', async function() {
      let erc20_reg_reward_address = (await erc20_contract.reward_contract.call()).toString();
      logging('ERC20 contract registered reward contract address = ' + erc20_reg_reward_address);
      assert.equal(erc20_reg_reward_address, registry_contract.address, "erc20 contract should have registry_contract address" + 
        erc20_reg_reward_address);
    });

    it('should be able to get reward based on new file size exchange rate register by any user', async function() {
      let notOwner = publicKeys[6];
      let test_file_fsize = 52;
      let expect_reward = (new BigNumber(test_file_fsize).mul(eth_to_wei)).div(new_filesize_token_ex);
      // The content for the IPFS hash is 'This is the next big big big big thing for testing.' 
      // excluding the single quote in the file.
      // The encryption here we use is a simple 1-way hash with SHA256SUM which derives:
      // b3376010d7cf4505b22bd6c32253e879f2c676c323ef8b482f45524629d71574
      let realIPFSHash = "QmWWkGqjgrw3uu6A6swLiYoBcrmwpGonWrWfueB8HNqbWk";
      let potential_key = "xyz1234XYZ1234"; // replace genRandomKey() with static password for predictable test
      let l_rand = 113; // replace getRandomInt(113, 997) with predictable result for test
      let ipfssha256 = sha256coder(realIPFSHash);
      assert.equal(ipfssha256, 'b3376010d7cf4505b22bd6c32253e879f2c676c323ef8b482f45524629d71574', 'sha256 lib not compatible, expecting sha256 b3376010d7cf4505b22bd6c32253e879f2c676c323ef8b482f45524629d71574 but got ' + ipfssha256);
      // TODO: What is the chances of collision here?
      let key2ndIdx = shuffleString(l_rand + ipfssha256 + sha256coder(potential_key));
      // TODO: this is a week randomness and small domain to brute force attack. Expand it.
      let c_rand = Math.floor(l_rand / 13);
      logging("contract expect random number " + c_rand);

      let realKey = potential_key + c_rand; // predictable combination for FULL key
      logging("generated encryption key = " + realKey);
      assert.equal(realKey, 'xyz1234XYZ12348', 'generating random number has changed, encryption is not backward compatible!');
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
      + '"filesize": ' + test_file_fsize + ','
      + '"encrypted": ' + '"' + encryptedIPFSHash + '"'
      + '}';
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      logging('normalized_json=' + normalized_testMetadata);
      let normalize_ipfsMetadata = "QmanimbVzjsNZRn2Gd41oFa3GksVb8DQ3kYKyCJncWyZir";

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, potential_key, key2ndIdx, l_rand, encryptedIPFSHash, test_file_fsize, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, notOwnerBalanceBefore + Math.floor(expect_reward.toNumber()), "expected reward should be 866129992");
      let reg_balance = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry contract now has remaining balance ' + reg_balance);
      let new_default_init_balance = (default_init_balance.sub(expect_reward));
      assert.equal(reg_balance,
                   new_default_init_balance.toNumber(),
                   'registry contract should have the remaining tokens ' + new_default_init_balance);
      default_init_balance = new_default_init_balance;
      logging('the calculated remaining balance should be the same as ' + new_default_init_balance);
    }); // end test case

    /**
     * The original registerar should obtain additional tokens when the other user purchase it.
     */
    it('should be able to buy and retrieve the IPFS hash after updating exchange rate by any user with tokens', async function() {
      let uploader = publicKeys[6];
      let purchaser = publicKeys[7];
      let normalize_ipfsMetadata = "QmanimbVzjsNZRn2Gd41oFa3GksVb8DQ3kYKyCJncWyZir";

      let uploaderBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("existing balance for " + uploader + " is " + uploaderBalance);
      let purchaserBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("existing balance for " + purchaser + " is " + purchaserBalance);
      /**
       * These are sanity checks since we are inherting the balance from previous test cases
       * If these amount no longer match, that means you have made a change in previous test cases
       * that broke the tracking of total token rewarded and spent for these accounts.
       */
      assert.equal(uploaderBalance, 866129992 , "expected existing balance to be 866129992");
      assert.equal(purchaserBalance, 4999999809078873, "expected existing balance to be 4999999809078873");

      let decrypt_results = (await registry_contract.decryptIPFS(normalize_ipfsMetadata, {from: purchaser}))
      logging('register encrypted IPFS status = ' + JSON.stringify(decrypt_results.logs));
      let results = (await registry_contract.fetchKeyForIPFS({from: purchaser}))
      logging('fetching decrypted 1st_partial_key=' + results[0] + " 2nd_partial_key=" + results[1] + " encryptedHash=" + results[2] + " cost=" + results[3]);
      let realKey = results[0] + '' + results[1]; // predictable combination for FULL key
      logging('AES encryption key is = ' + realKey);
      let decryptIPFSHash = crypto_js.AES.decrypt(results[2], realKey).toString(crypto_js.enc.Utf8);
      assert.equal(decryptIPFSHash, "QmWWkGqjgrw3uu6A6swLiYoBcrmwpGonWrWfueB8HNqbWk", "Expecting the real IPFS decrypted hash to be QmWWkGqjgrw3uu6A6swLiYoBcrmwpGonWrWfueB8HNqbWk");
      assert.equal(results[3].toNumber(), 484287738, "The cost to purchase encryptedIdx b3376010d7cf4505b22bd6c32253e879f2c676c323ef8b482f45524629d71574 should be 484287738");

      let uploaderNewBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("new balance for uploader = " + uploader + " is " + uploaderNewBalance);
      assert.equal(uploaderNewBalance, (uploaderBalance + results[3].toNumber()), "expected new balance should be 1350417730");

      let purchaserNewBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("new balance for purchaser = " + purchaser + " is " + purchaserNewBalance);
      assert.equal(purchaserNewBalance, (purchaserBalance - results[3].toNumber()), "expected remaining balance should be 4999999324791135");
    }); // end test case

    /* jshint ignore:end */
  }); // end of describe

}); // end of contract
