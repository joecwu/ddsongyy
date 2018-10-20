/*jshint esversion: 6*/
const BigNumber = web3.BigNumber;
const privateKeys = require('./truffle-keys').private;
const publicKeys = require('./truffle-keys').public;
const EthereumTx = require('ethereumjs-tx');
var init_erc20_tok = require("./3_init_TBD_erc20.js");
var trade_registry = artifacts.require("./TradeContract.sol");

var proof_of_stake_balance = 100;
var decimals = 18;
var eth_to_tok_exchangeRate = new BigNumber(200); // 1 eth = 200 BMD
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
  console.log('\x1b[47m\x1b[30m[TT]>>> ' + msg + '\x1b[0m');
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
 
contract('Trade', function(accounts) {
  describe("Trade contract creation and inspection before testing", function() {
    let erc20tok = null;
    /* jshint ignore:start */
    it("should have the shared context", async function() {
      context = await init_erc20_tok.run(accounts);
      erc20tok = context.erc20tokInstance;
      assert(erc20tok !== undefined, 'has been assigned with ERC20 contract instance');
    });

    it(accounts[0] + " should have init balance of " + contractCreatorRemainBalance + " TBD tokens by default", async function() {
      let trade_instance = null;

      trade_instance = await trade_registry.deployed(erc20tok.address, true, {from: accounts[1]});
      let balance = (await erc20tok.balanceOf.call(accounts[0])).toNumber();
      assert.equal(balance.valueOf(),
                   contractCreatorRemainBalance,
                   contractCreatorRemainBalance + " wasn't in the first account " + accounts[0]);
      console.log('TradeContract deployed with address ' +
      trade_instance.address +
                  ' trading erc20 token address ' +
                  erc20tok.address);
      let erc20_addr = (await trade_instance.currentTokenContract.call());
      assert.equal(erc20_addr,
                  erc20tok.address,
                  'TradeContract contract should hold ERC20 contract address ' + erc20tok.address);
    });
    /* jshint ignore:end */
  }); // end of describe

  describe("TradeContract exchanging token with Ether test cases", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let trade_contract = null;
    let pitmaster = publicKeys[4]; // the wallet that can modify the exchange rate

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      trade_contract = (await trade_registry.deployed(erc20_contract.address, true, {from: accounts[0]}));
      web3Contract = web3.eth.contract(trade_contract.abi).at(trade_contract.address);
      owner = web3Contract._eth.coinbase;
      logging('ERC20 Token Contract Address=' + erc20_contract.address);
      logging('Trade Contract Address=' + trade_contract.address);
      logging('accounts[0]=' + accounts[0]);
      logging('owner=' + owner + ' publicKeys[0]=' + publicKeys[0]);
      logging('other=' + accounts[1] + ' publicKeys[1]=' + publicKeys[1]);
      let other = publicKeys[1];
  
      // Verifying that you have specified the right key for testing in ganache-cli
      if (publicKeys[0] !== owner || publicKeys[1] !== other) {
        throw new Error('Use `truffle develop` and store the keys in ./test/truffle-keys.js' +
        ', and make sure you specify these keys in ganache-cli');
      }

      if (publicKeys[4] === owner) {
        throw new Error('The 4th publicKeys[4] shall not be the same as the owner that deploys this contract' +
        ', we use publicKeys[4] for testing in our test cases for such purposes.');
      }
  
      // Tracks all events for later verification, count may be sufficient?
      trade_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
        }
      });

      // only trade contract can interact with erc20 contarct to replenish itself
      (await erc20_contract.register_tradingcontract(trade_contract.address));
    });

    it('should be able to exchangeToken for non-owner', async function() {
      let notOwner = publicKeys[5];
      let notOwnerPrivateKey = privateKeys[5];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      // PRE-FUND this Trading Contract with ALL Tokens from accounts[0]
      let pre_fund_completed = (await erc20_contract.transfer(trade_contract.address, pre_fund_amount, {from: accounts[0]}));
      logging('Pre-funding trade_contract ' + trade_contract.address + ' with init token balance ' + pre_fund_amount);
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      let initEthbalance = web3.eth.getBalance(publicKeys[5]);
      logging('accounts[0]=' + accounts[0] + ' has start token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has start token balance ' + e0);
      logging('trade_contract.address=' + trade_contract.address + ' has start token balance ' + t0);
      logging('publicKeys[5]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('publicKeys[5]=' + notOwner + ' has init Ether balance ' + initEthbalance);
      logging('TradeContract contract address ' + trade_contract.address + ' has init Ether balance ' + web3.eth.getBalance(trade_contract.address));
      // assert.equal(t0, pre_fund_amount, "trader contract should be pre-funded with " + pre_fund_amount + " tokens from accounts[0]=" + accounts[0]);

      let value = 1 * 10 ** 18; // 1 eth = 1 * 10 ** 18 wei.

      let data = web3Contract.takerBuyAsset.getData();

      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value
      );

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      t0 = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      assert(notOwnerBalanceAfter, eth_to_tok_exchangeRate.mul(eth_to_wei).toNumber(), "should have new token balance " + eth_to_tok_exchangeRate.mul(eth_to_wei));
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has new token balance ' + e0);
      logging('trade_contract.address=' + trade_contract.address + ' has new token balance ' + t0);
      logging('publicKeys[5]=' + notOwner + ' has new Ether balance ' + web3.eth.getBalance(publicKeys[5]));
      assert(web3.eth.getBalance(trade_contract.address), value, "Trading contract received eth is not the same as " + value);
      assert.isAtMost(web3.eth.getBalance(publicKeys[5]), (initEthbalance - value), "The full " + value + " did not reach the Trading contract");
      // assert.equal(notOwnerBalanceAfter, 10000, 'it should get 10000 tokens for 1 eth');
      // assert.equal(t0, 499990000, 'trader contract token should subtract 10000');
      assert.strictEqual(0, result.indexOf('0x'));
    });

    it('should NOT be able to set exchange rate before it is delegated', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      // Should trigger a revert
      await tryCatch(trade_contract.setExchangeRate(999) , errTypes.revert);
      let ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      logging("Trading contract current exchange rate is " + ex_rate);
      assert(ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
      (await trade_contract.delegateExchangerAddress(pitmaster));
      eth_to_tok_exchangeRate = new BigNumber(999);
      let shall_pass_result = (await trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(shall_pass_result);
      let new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert(new_ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
      logging("Trading contract new exchange rate is " + new_ex_rate);
      let prev_ex_rate = eth_to_tok_exchangeRate.toNumber();
      eth_to_tok_exchangeRate = new BigNumber(200);
      // This should fail, even it is triggered from the contract owner or any other non-dedicated wallet
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[3]}) , errTypes.revert);
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[2]}) , errTypes.revert);
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[0]}) , errTypes.revert);
      new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert(new_ex_rate, prev_ex_rate, "exchange rate shall not change if it was triggered by the contract owner!");
      shall_pass_result = (await trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(shall_pass_result);
      new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert(new_ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("TradeContract should be able to replenish itself", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let trade_contract = null;
    let default_init_balance = pre_fund_amount;
    let pitmaster = publicKeys[4]; // the wallet that can modify the exchange rate
    let rediculous_tok_exchangeRate = new BigNumber(900001);

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      trade_contract = (await trade_registry.deployed(erc20_contract.address, true, {from: accounts[0]}));
      web3Contract = web3.eth.contract(trade_contract.abi).at(trade_contract.address);
      owner = web3Contract._eth.coinbase;
      logging('ERC20 Token Contract Address=' + erc20_contract.address);
      logging('Trade Contract Address=' + trade_contract.address);
      logging('accounts[0]=' + accounts[0]);
      logging('owner=' + owner + ' publicKeys[0]=' + publicKeys[0]);
      logging('other=' + accounts[1] + ' publicKeys[1]=' + publicKeys[1]);
      let other = publicKeys[1];

      // Verifying that you have specified the right key for testing in ganache-cli
      if (publicKeys[0] !== owner || publicKeys[1] !== other) {
        throw new Error('Use `truffle develop` and store the keys in ./test/truffle-keys.js' +
        ', and make sure you specify these keys in ganache-cli');
      }

      if (publicKeys[7] === owner) {
        throw new Error('The 7th publicKeys[7] shall not be the same as the owner that deploys this contract' +
        ', we use publicKeys[7] for testing in our test cases for such purposes.');
      }
  
      // Tracks all events for later verification, count may be sufficient?
      trade_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
        }
      });

      // only trade contract can interact with erc20 contarct to replenish itself
      (await erc20_contract.register_tradingcontract(trade_contract.address));
      // allow us to set exchange rate to a rediculous value to trigger the test case
      (await trade_contract.delegateExchangerAddress(pitmaster));

      let before_balance = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      default_init_balance = new BigNumber(before_balance);
      logging('trade contract ' + trade_contract.address + ' has init balance ' + default_init_balance);
      shall_pass_result = (await trade_contract.setExchangeRate(rediculous_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(shall_pass_result);
    });

    it('should be able to replenish token for non-owner tx', async function() {
      let notOwner = publicKeys[7];
      let notOwnerPrivateKey = privateKeys[7];
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      let t0 = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      let initEthbalance = web3.eth.getBalance(publicKeys[7]);
      logging('accounts[0]=' + accounts[0] + ' has start token balance ' + a0);
      logging('trade_contract.address=' + trade_contract.address + ' has start token balance ' + t0);
      logging('publicKeys[7]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('publicKeys[7]=' + notOwner + ' has init Ether balance ' + initEthbalance);
      logging('TradeContract contract address ' + trade_contract.address + ' has init Ether balance ' + web3.eth.getBalance(trade_contract.address));
      
      let value = 2.2 * 10 ** 18; // 1 eth = 1 * 10 ** 18 wei.

      let data = web3Contract.takerBuyAsset.getData();

      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value
      );

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      t0 = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      assert(notOwnerBalanceAfter, rediculous_tok_exchangeRate.mul(eth_to_wei).toNumber(), "should have new token balance " + rediculous_tok_exchangeRate.mul(eth_to_wei));
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('trade_contract.address=' + trade_contract.address + ' has new token balance ' + t0);
      logging('publicKeys[7]=' + notOwner + ' has new Ether balance ' + web3.eth.getBalance(publicKeys[7]));
      logging('TradeContract contract address ' + trade_contract.address + ' has new Ether balance ' + web3.eth.getBalance(trade_contract.address));
      assert(web3.eth.getBalance(trade_contract.address), value, "Trading contract received eth is not the same as " + value);
      assert.isAtMost(web3.eth.getBalance(publicKeys[7]), (initEthbalance - value), "The full " + value + " did not reach the Trading contract");
      assert.strictEqual(0, result.indexOf('0x')); 
    });
    /* jshint ignore:end */

  }); // end of describe


}); // end of contract