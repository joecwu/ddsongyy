/*jshint esversion: 6*/
const privateKeys = require('./truffle-keys').private;
const publicKeys = require('./truffle-keys').public;
const EthereumTx = require('ethereumjs-tx');
var init_erc20_tok = require("./3_init_TBD_erc20.js");
var storage_registry = artifacts.require("./RewardDistributor.sol");
var sha256coder = require('js-sha256').sha256;

var proof_of_stake_balance = 100;
var decimals = 18;
/* jshint ignore:start */
var eth_to_tok_exchangeRate = 200; // 1 eth = 200 BMD
var filesize_to_token_ex = 200 * 1000 * 1000 * 1000; // 1token = 200GB
var defaultTotalSupply = 1000000000 * 10**decimals; // 1billion * 10**18
var pre_fund_amount = defaultTotalSupply / 2; // just use half of the token balance, leave 50% left in erc20 contract
/* jshint ignore:end */
// var initAllocationForEscrow = 500000000000000000000000000; // 500m * 10**18
var initAllocationForEscrow = 0; // creator gets all
var contractCreatorRemainBalance = (defaultTotalSupply - initAllocationForEscrow); // account[0]


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
/***************************
 * END FUNCTION DEFINITION *
 ***************************/
 
contract('RewardDistributor', function(accounts) {
  describe("RewardDistributor contract creation and inspection before testing", function() {
    let erc20tok = null;
    /* jshint ignore:start */
    it("should have the shared context", async function() {
      context = await init_erc20_tok.run(accounts);
      erc20tok = context.erc20tokInstance;
      assert(erc20tok !== undefined, 'has been assigned with ERC20 contract instance');
    });

    it(accounts[0] + " should have init balance of " + (defaultTotalSupply - initAllocationForEscrow) + " TBD tokens by default", async function() {
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
        }
      });
    });


    it('should NOT be able to exchangeToken for non-owner', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      let notOwner = publicKeys[5];
      let notOwnerPrivateKey = privateKeys[5];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      // PRE-FUND this Trading Contract with ALL Tokens from accounts[0]
      let pre_fund_completed = (await erc20_contract.transfer(registry_contract.address, pre_fund_amount, {from: accounts[0]}));
      logging('Pre-funding registry_contract ' + registry_contract.address + ' with init token balance ' + pre_fund_amount);
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      let before_balance = web3.eth.getBalance(registry_contract.address).toNumber();
      logging('accounts[0]=' + accounts[0] + ' has start token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has start token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has start token balance ' + t0);
      logging('publicKeys[5]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has init Ether balance ' + before_balance);
      // assert.equal(t0, pre_fund_amount, "trader contract should be pre-funded with " + pre_fund_amount + " tokens from accounts[0]=" + accounts[0]);

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

      // assert.equal(notOwnerBalanceAfter, 10000, 'it should get 10000 tokens for 1 eth');
      // assert.equal(t0, 499990000, 'trader contract token should subtract 10000');
      assert.strictEqual(before_balance, after_balance);
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
    /* jshint ignore:start */
    let tokens_exchanged = eth_to_tok_exchangeRate * spent_ether * 10 ** 18;
    let expected_balance = tokens_exchanged + ((ipfs_test_filesize * 10 ** 18) / filesize_to_token_ex);
    /* jshint ignore:end */

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

      // NOT NECESSARY. It is already pre-funded from previous test case
      // let pre_fund_completed = (await erc20_contract.transfer(registry_contract.address, 5000000000, {from: accounts[0]}));
      // logging('Pre-funding registry_contract ' + registry_contract.address + ' with init token balance 5000000000');

      // Tracks all events for later verification, count may be sufficient?
      registry_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
        }
      });
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract=' + registry_contract.address + ' has init token balance ' + t0);
      assert.equal(t0, pre_fund_amount - tokens_exchanged, "registry_contract " + registry_contract.address +
        " contract should still have remaining " + (pre_fund_amount - tokens_exchanged) + " tokens from accounts[0]=" + accounts[0]);
    });

    it('should be able to register IPFS hash for non-owner', async function() {
      let notOwner = publicKeys[5];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('accounts[0]=' + accounts[0] + ' has start token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has start token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has start token balance ' + t0);
      logging('publicKeys[5]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has init Ether balance ' + web3.eth.getBalance(registry_contract.address));

      let eth_value = 1; // 1 eth = 1 * 10 ** 18 wei. This needs to align with the contract
      let reg_successful = (await registry_contract.registerIPFS(ipfs_test_string, ipfs_test_filesize, {value: eth_value * 10 ** 18, from: notOwner}))
      logging('register IPFS status = ' + reg_successful.toString());

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has new token balance ' + e0);
      logging('registry_contract.address=' + registry_contract.address + ' has new token balance ' + t0);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has new Ether balance ' + web3.eth.getBalance(registry_contract.address));

      assert.equal(notOwnerBalanceAfter, expected_balance, 'it should get ' + expected_balance + ' tokens for 1 eth');
      assert.equal(t0, pre_fund_amount - expected_balance, 'registry contract token should have remaining balance ' + (pre_fund_amount - expected_balance));
    });

    it('should be able to fetch the IPFS hash by their wallet', async function() {
      let notOwner = publicKeys[5];
      let queried_ipfs = (await registry_contract.queryIPFSList(notOwner, {from: notOwner})).toString();
      logging('fetched IPFS hash = ' + queried_ipfs);
      assert.equal(queried_ipfs, ipfs_test_string, 'it should get ipfs hash ' + ipfs_test_string);

      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging('publicKeys[5]=' + notOwner + ' has token balance ' + notOwnerBalanceBefore);
      t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      assert.equal(t0, pre_fund_amount - expected_balance, 'registry contract token should remain unchanged with balance ' + (pre_fund_amount - expected_balance));
      assert.equal(notOwnerBalanceBefore, expected_balance, 'publicKeys[5]=' + notOwner + ' token balance should remain the same');
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("RewardDistributor ipfs metadata and encrypting IPFS test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let registry_contract = null;

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
    });

    it('should have pre-funded tokens before serving registry', async function() {
      let t0 = (await erc20_contract.balanceOf.call(registry_contract.address)).toNumber();
      logging('registry_contract=' + registry_contract.address + ' has init token balance ' + t0);
      assert.equal(t0, pre_fund_amount, "registry_contract " + registry_contract.address +
        " contract should still have " + pre_fund_amount + "tokens from accounts[0]=" + accounts[0]);
    });

    it('ERC20 contract should have pre-registered the correct reward contract address before serving', async function() {
      let erc20_reg_reward_address = (await erc20_contract.reward_contract.call()).toString();
      logging('ERC20 contract registered reward contract address = ' + erc20_reg_reward_address);
      assert.equal(erc20_reg_reward_address, registry_contract.address, "erc20 contract should have registry_contract address" + 
        erc20_reg_reward_address);
    });

    it('should be able to register metadata and an encrypted hash by any user', async function() {
      let notOwner = publicKeys[6];
      // The content for the IPFS hash is 'This is the content for testing.' excluding the single quote in the file.
      // The encryption here we use is a simple 1-way hash with SHA256SUM which derives:
      // c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be
      let testIPFSData = "QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd";
      // Metadata generated for above content in our test case is the following
      let testMetadata = `{
        "description": "whatever you want to put here",
        "filesize": 41,
        "encrypted": "c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be"
      }`;
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      let normalize_ipfsMetadata = "QmcN63TtxckH6gpjfScuVdJNxPcSni56KVzaywDfRwaR1j";
      let encryptedIdx = sha256coder(testIPFSData);
      let expect_reward = (41 * 10**decimals) / filesize_to_token_ex;
      logging('normalized_json=' + normalized_testMetadata);

      assert.equal(encryptedIdx, 'c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be', 'sha256 lib not compatible, expecting sha256 c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be but got ' + encryptedIdx);
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, encryptedIdx, testIPFSData, 41, {from: notOwner}))
      logging('register encrypted IPFS status = ' + JSON.stringify(reg_successful.logs));
      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("new balance for publicKeys[6]=" + notOwner + " is " + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, expect_reward, "expected reward should be 205000000");
    }); // end test case

    it('should be able to register metadata and a 1G file by another user', async function() {
      let notOwner = publicKeys[7]; // uploading 1G
      let expect_reward = (1073741824 * 10**decimals) / filesize_to_token_ex;
      // a 1073741824 bytes file with all 0 in it.
      // SHA256 = 49bc20df15e412a64472421e13fe86ff1c5165e18b2afccf160d4dc19fe68a14
      let testIPFSData = "QmdiETTY5fiwTkJeERbWAbPKtzcyjzMEJTJJosrqo2qKNm";
      // Metadata generated for above content in our test case is the following
      let testMetadata = `{
        "description": "an 1G file",
        "filesize": 1073741824,
        "encrypted": "92b73a3c06a93b0a5f8d0974efcae2d414015979f577679ae48f71ddf5ac2d33"
      }`;
      let normalized_testMetadata = JSON.stringify(JSON.parse(testMetadata));
      let normalize_ipfsMetadata = "QmWqRJZghQftthJDVqJFNvB5ScatZFTp259sTAVesquLWv";
      let encryptedIdx = sha256coder(testIPFSData);
      logging('normalized_json=' + normalized_testMetadata);

      assert.equal(encryptedIdx, '92b73a3c06a93b0a5f8d0974efcae2d414015979f577679ae48f71ddf5ac2d33', 'sha256 lib not compatible, expecting sha256 92b73a3c06a93b0a5f8d0974efcae2d414015979f577679ae48f71ddf5ac2d33 but got ' + encryptedIdx);
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      logging("current balance for publicKeys[7]=" + notOwner + " is " + notOwnerBalanceBefore);
      let reg_successful = (await registry_contract.encryptIPFS(normalize_ipfsMetadata, encryptedIdx, testIPFSData, 1073741824, {from: notOwner}))
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
      let normalize_ipfsMetadata = "QmcN63TtxckH6gpjfScuVdJNxPcSni56KVzaywDfRwaR1j";
      let encryptedIdx = "c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be";

      let uploaderBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("existing balance for " + uploader + " is " + uploaderBalance);
      assert.equal(uploaderBalance, 205000000, "expected existing balance to be 205000000");

      let purchaserBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("existing balance for " + purchaser + " is " + purchaserBalance);
      assert.equal(purchaserBalance, 5368709120000000, "expected existing balance to be 5368709120000000");

      let results = (await registry_contract.decryptIPFS.call(encryptedIdx, normalize_ipfsMetadata, {from: purchaser}))
      logging('fetching decrypted IPFS hash = ' + results[0] + " and token cost = " + results[1]);
      assert.equal(results[0], "QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd", "Expecting the real IPFS decrupted hash to be QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd");
      assert.equal(results[1], 205000000, "The cost to purchase encryptedIdx c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be should be 205000000");

      let uploaderNewBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("new balance for " + uploader + " is " + uploaderNewBalance);
      // assert.equal(uploaderNewBalance, 330000000, "expected new balance should be 330000000");

      let purchaserNewBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("new balance for " + purchaser + " is " + purchaserNewBalance);
      // assert.equal(purchaserNewBalance, 5368708955000000, "expected remaining balance should be 5368708955000000");

    }); // end test case

    /**
     * The purchaser should be able to use equivalant Eth to purchase (trnasparent).
     * The original registerar should obtain additional tokens when the other user purchase it.
     */
    it('should be able to buy and retrieve the IPFS hash by any user with Eth', async function() {
      let uploader = publicKeys[6];
      let purchaser = publicKeys[7];
      let purchaserPrivateKey = privateKeys[7];
      let normalize_ipfsMetadata = "QmcN63TtxckH6gpjfScuVdJNxPcSni56KVzaywDfRwaR1j";
      let encryptedIdx = "c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be";

      let uploaderBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("existing balance for " + uploader + " is " + uploaderBalance);
      // assert.equal(uploaderBalance, 205000000, "expected reward should be ????????");
      let purchaserBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("existing balance for " + purchaser + " is " + purchaserBalance);
      // assert.equal(purchaserBalance, 5368709120000000, "expected reward should be ?????????");
      logging('RewardDistributor contract address ' + registry_contract.address + ' has init Ether balance ' + web3.eth.getBalance(registry_contract.address));
      logging('purchaser address ' + purchaser + ' has init Ether balance ' + web3.eth.getBalance(purchaser));

      let value = 205000000 / eth_to_tok_exchangeRate; // 1 eth = 1 * 10 ** 18 wei. This needs to align with the contract
      let data = web3Contract.registerEscrow.getData(encryptedIdx);

      let result = await rawTransaction(
        purchaser,
        purchaserPrivateKey,
        registry_contract.address,
        data,
        value
      );

      let results = (await registry_contract.decryptIPFSwithEth.call(encryptedIdx, normalize_ipfsMetadata, {from: purchaser}))
      logging('fetching decrypted IPFS hash = ' + results[0] + " and token cost = " + results[1]);
      logging('RewardDistributor contract address ' + registry_contract.address + ' has new Ether balance ' + web3.eth.getBalance(registry_contract.address));
      logging('purchaser address ' + purchaser + ' has new Ether balance ' + web3.eth.getBalance(purchaser));
      assert.equal(results[0], "QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd", "Expecting the real IPFS decrupted hash to be QmSzzutTv2AFN6mtLkPs4tDbzqXrVZ82NV6kutmp68bpYd");
      assert.equal(results[1], 205000000, "The cost to purchase encryptedIdx c180debe61a9f28ec4aef26734af8f19aed8b5d5c6c30cba87b132eea71f04be should be 205000000");
      let uploaderNewBalance = (await erc20_contract.balanceOf.call(uploader)).toNumber();
      logging("new balance for uploader " + uploader + " is " + uploaderNewBalance);
      // assert.equal(uploaderNewBalance, 330000000, "expected new balance should be ????????");
      let purchaserNewBalance = (await erc20_contract.balanceOf.call(purchaser)).toNumber();
      logging("new balance for purchaser " + purchaser + " is " + purchaserNewBalance);
      // assert.equal(purchaserNewBalance, 5368708955000000, "expected remaining balance should be ???????");

    }); // end test case

    /* jshint ignore:end */
  }); // end of describe

}); // end of contract
