const privateKeys = require('./truffle-keys').private;
const publicKeys = require('./truffle-keys').public;
const EthereumTx = require('ethereumjs-tx');
var init_erc20_tok = require("./3_init_TBD_erc20.js");
var storage_registry = artifacts.require("./RewardDistributor.sol");

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

  /* jshint ignore:end */
}); // end of contract