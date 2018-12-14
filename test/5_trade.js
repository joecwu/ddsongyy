/*jshint esversion: 6*/
const BigNumber = web3.BigNumber;
const privateKeys = require('./truffle-keys').private;
const publicKeys = require('./truffle-keys').public;
const EthereumTx = require('ethereumjs-tx');
var init_erc20_tok = require("./3_init_TBD_erc20.js");
var trade_registry = artifacts.require("./TradeContract.sol");

var decimals = 18;
var eth_to_tok_exchangeRate = new BigNumber(200); // 1 eth = 200 BMD
/* jshint ignore:start */
var eth_to_wei = new BigNumber(10**decimals);
/* jshint ignore:end */
var defaultTotalSupply = new BigNumber(1000000000).mul(eth_to_wei); // 1billion * 10**18
var pre_fund_amount = new BigNumber(1000000).mul(eth_to_wei); // 1M init token for trading
// fund traing and reward contract 1M each
var contractCreatorRemainBalance = defaultTotalSupply.minus(pre_fund_amount.times(2)); // account[0]
var trade_contract_eth_balance = new BigNumber(0);

/***********************
 * FUNCTION DEFINITION *
 ***********************/
function logging(msg) {
  // Define a CSS to format the text
  console.log('\x1b[47m\x1b[30m[TT]>>> ' + msg + '\x1b[0m');
}

function loggingEvent(details) {
  // Define a CSS to format the text
  console.log('\x1b[45m\x1b[30m[TT]>>> [Event][' + details.event + ']' + JSON.stringify(details.args) + '\x1b[0m');
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
          loggingEvent(details);
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

      let value = new BigNumber(1).mul(eth_to_wei); // 1 eth = 1 * 10 ** 18 wei.
      trade_contract_eth_balance = trade_contract_eth_balance.add(value);

      let data = web3Contract.takerBuyAsset.getData();

      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value.toNumber()
      );

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      a0 = (await erc20_contract.balanceOf.call(accounts[0])).toNumber();
      e0 = (await erc20_contract.balanceOf.call(erc20_contract.address)).toNumber();
      t0 = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      logging(notOwner + ' has new token balance ' + notOwnerBalanceAfter);
      assert.equal(notOwnerBalanceAfter, eth_to_tok_exchangeRate.mul(eth_to_wei).toNumber(), "should have new token balance " + eth_to_tok_exchangeRate.mul(eth_to_wei));
      logging('accounts[0]=' + accounts[0] + ' has new token balance ' + a0);
      logging('erc20_contract.address=' + erc20_contract.address + ' has new token balance ' + e0);
      logging('trade_contract.address=' + trade_contract.address + ' has new token balance ' + t0);
      logging('publicKeys[5]=' + notOwner + ' has new Ether balance ' + web3.eth.getBalance(publicKeys[5]));
      assert.equal(trade_contract_eth_balance.toNumber(), value.toNumber(), "Trading contract received eth is not the same as " + value);
      assert.isAtMost(web3.eth.getBalance(publicKeys[5]).toNumber(), initEthbalance.add(value).toNumber(), "The full " + value + " did not reach the Trading contract");
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
      assert.equal(ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
      (await trade_contract.delegateExchangerAddress(pitmaster));
      eth_to_tok_exchangeRate = new BigNumber(999);
      let shall_pass_result = (await trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(shall_pass_result);
      let new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert.equal(new_ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
      logging("Trading contract new exchange rate is " + new_ex_rate);
      let prev_ex_rate = eth_to_tok_exchangeRate.toNumber();
      eth_to_tok_exchangeRate = new BigNumber(200);
      // This should fail, even it is triggered from the contract owner or any other non-dedicated wallet
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[3]}) , errTypes.revert);
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[2]}) , errTypes.revert);
      await tryCatch(trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: accounts[0]}) , errTypes.revert);
      new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert.equal(new_ex_rate, prev_ex_rate, "exchange rate shall not change if it was triggered by the contract owner!");
      shall_pass_result = (await trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(shall_pass_result);
      new_ex_rate = (await trade_contract.exchangeRate.call()).toNumber();
      assert.equal(new_ex_rate, eth_to_tok_exchangeRate.toNumber(), "exchange rate shall not change before delegation occurs!");
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("TradeContract should be able to replenish itself", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let trade_contract = null;
    let default_init_tok_balance = pre_fund_amount;
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
          loggingEvent(details);
        }
      });

      // only trade contract can interact with erc20 contarct to replenish itself
      (await erc20_contract.register_tradingcontract(trade_contract.address));
      // allow us to set exchange rate to a rediculous value to trigger the test case
      (await trade_contract.delegateExchangerAddress(pitmaster));

      let before_balance = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      default_init_tok_balance = new BigNumber(before_balance);
      logging('trade contract ' + trade_contract.address + ' has init token balance ' + default_init_tok_balance);
      shall_pass_result = (await trade_contract.setExchangeRate(rediculous_tok_exchangeRate.toNumber(), {from: pitmaster}));
      logging(JSON.stringify(shall_pass_result));
    });

    it('should be able to replenish 1M token triggered by non-owner tx', async function() {
      let notOwner = publicKeys[7];
      let notOwnerPrivateKey = privateKeys[7];
      // accounts[0] should replenish the trade contract with 1M tokens
      let account0_tok_balance = (await erc20_contract.balanceOf.call(accounts[0]));
      let notOwnerBalanceBefore = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let trade_tok_balance = (await erc20_contract.balanceOf.call(trade_contract.address));
      let initNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      logging('publicKeys[7]=' + notOwner + ' has start token balance ' + notOwnerBalanceBefore);
      logging('publicKeys[7]=' + notOwner + ' has init Ether balance ' + initNotOwnerEthbalance);
      assert.equal(trade_contract_eth_balance.toNumber(), 1000000000000000000, 'trade contract should have 1 Eth');
      assert.equal(notOwnerBalanceBefore, 0, 'notOwner accounts[7] should have 0 tokens at the moment');

      let value = new BigNumber(2.2).mul(eth_to_wei); // 1 eth = 1 * 10 ** 18 wei.
      trade_contract_eth_balance = trade_contract_eth_balance.add(value);
      let expect_rcv_token = value.mul(rediculous_tok_exchangeRate);
      logging('trading contract will have left over balance of ' + trade_tok_balance.sub(expect_rcv_token));

      let data = web3Contract.takerBuyAsset.getData();

      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value.toNumber()
      );

      let notOwnerBalanceAfter = (await erc20_contract.balanceOf.call(notOwner)).toNumber();
      let accounts0_tok_after_replenish = (await erc20_contract.balanceOf.call(accounts[0]));
      let trade_replenish_balance = (await erc20_contract.balanceOf.call(trade_contract.address)).toNumber();
      assert(account0_tok_balance.sub(accounts0_tok_after_replenish).toNumber() == pre_fund_amount.toNumber(),
        'account[0] should transfer exactly 1M token to trade contract');
      assert.equal(notOwnerBalanceAfter, expect_rcv_token.toNumber(), "should have new token balance " + expect_rcv_token);
      assert((trade_replenish_balance > pre_fund_amount.toNumber() && 
        trade_replenish_balance < (pre_fund_amount.add(new BigNumber(100000))).mul(eth_to_wei).toNumber()),
        'trade contract was not replenished with 1M tokens');
      logging('trade_contract.address=' + trade_contract.address + ' has new token balance ' + trade_replenish_balance);
      logging('publicKeys[7]=' + notOwner + ' has new Ether balance ' + web3.eth.getBalance(notOwner));
      logging('TradeContract contract address ' + trade_contract.address + ' has new Ether balance ' + web3.eth.getBalance(trade_contract.address));
      assert.equal(web3.eth.getBalance(trade_contract.address).toNumber(), trade_contract_eth_balance.toNumber(), "Trading contract received eth is not the same as " + value);
      assert.isAtMost(web3.eth.getBalance(notOwner).toNumber(), initNotOwnerEthbalance.sub(value).toNumber(), "The full " + value + " did not reach the Trading contract");
      logging(JSON.stringify(result));
      assert.strictEqual(0, result.indexOf('0x')); 
    });
    /* jshint ignore:end */

  }); // end of describe

  describe("TradeContract should be able to withdraw eth", function() {
    let web3Contract = null;
    let eventCounter = {}; // to track all events fired
    let erc20_contract = null;
    let trade_contract = null;
    let current_ex_rate = null;
    let pitmaster = publicKeys[4]; // the wallet that can modify the exchange rate

    /* jshint ignore:start */
    before(async () => {
      context = await init_erc20_tok.run(accounts);
      erc20_contract = context.erc20tokInstance;
      assert(erc20_contract !== undefined, 'has been assigned with ERC20 contract instance');
      trade_contract = (await trade_registry.deployed(erc20_contract.address, true, {from: accounts[0]}));
      web3Contract = web3.eth.contract(trade_contract.abi).at(trade_contract.address);
      owner = web3Contract._eth.coinbase;
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

      // only trade contract can interact with erc20 contarct to replenish itself
      (await erc20_contract.register_tradingcontract(trade_contract.address));
      // allow us to set exchange rate to a rediculous value to trigger the test case
      (await trade_contract.delegateExchangerAddress(pitmaster));

      // reset to default exchange rate which should be 200 here.
      (await trade_contract.setExchangeRate(eth_to_tok_exchangeRate.toNumber(), {from: pitmaster}));
      current_ex_rate = (await trade_contract.exchangeRate.call());
      logging("Trade contract current exchange rate is " + current_ex_rate);
  
      // Tracks all events for later verification, count may be sufficient?
      trade_contract.allEvents({}, (error, details) => {
        if (error) {
          console.error(error);
        } else {
          let count = eventCounter[details.event];
          eventCounter[details.event] = count ? count + 1 : 1;
          loggingEvent(details);
        }
      });
    });

    it('should NOT be able to withdraw by any unknown wallets', async function() {
      let tryCatch = require("./exceptions.js").tryCatch;
      let errTypes = require("./exceptions.js").errTypes;
      let initTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      // Should trigger a revert
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[1]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[2]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[3]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[4]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[5]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[6]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[7]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[8]}) , errTypes.revert);
      await tryCatch(trade_contract.withdraw(999, {from: publicKeys[9]}) , errTypes.revert);
      let afterTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      assert.equal(initTradeContractEthbalance.toNumber(), afterTradeContractEthbalance.toNumber(), "Trade contract eth should not change at all!");
      });

    it('should be able to withdraw from the contract creator/owner', async function() {
      let Owner = publicKeys[0]; // accounts[0]
      let notOwner = publicKeys[8];
      let notOwnerPrivateKey = privateKeys[8];
      let OwnerTokBalanceBefore = (await erc20_contract.balanceOf.call(Owner));
      let notOwnerTokBalanceBefore = (await erc20_contract.balanceOf.call(notOwner));
      let tradeContractTokBalance = (await erc20_contract.balanceOf.call(trade_contract.address));
      let initOwnerEthbalance = web3.eth.getBalance(Owner);
      let initNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      let initTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[0]=' + Owner + ' has start token balance ' + OwnerTokBalanceBefore);
      logging('publicKeys[0]=' + Owner + ' has init Ether balance ' + initOwnerEthbalance);
      logging('publicKeys[8]=' + notOwner + ' has start token balance ' + notOwnerTokBalanceBefore);
      logging('publicKeys[8]=' + notOwner + ' has init Ether balance ' + initNotOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has start token balance ' + tradeContractTokBalance);
      logging('TradeContract=' + trade_contract.address + ' has init Ether balance ' + initTradeContractEthbalance);

      let value = new BigNumber(5).mul(eth_to_wei); // 1 eth = 1 * 10 ** 18 wei.
      let expect_trade_contract_eth_balance = initTradeContractEthbalance.add(value);
      let expect_rcv_token = value.mul(current_ex_rate);
      logging('Trading contract will have left over token balance of ' + tradeContractTokBalance.sub(expect_rcv_token));
      logging('publicKeys[8] will have new token balance of ' + notOwnerTokBalanceBefore.add(expect_rcv_token));

      let data = web3Contract.takerBuyAsset.getData();
      let potential_gas_fee = 23000; // wei
      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value.toNumber()
      );

      let OwnerTokBalanceAfter = (await erc20_contract.balanceOf.call(accounts[0]));
      let notOwnerTokBalanceAfter = (await erc20_contract.balanceOf.call(notOwner));
      let tradeContractTokBalanceAfter = (await erc20_contract.balanceOf.call(trade_contract.address));
      let afterOwnerEthbalance = web3.eth.getBalance(Owner);
      let afterNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      let afterTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[0]=' + Owner + ' has new token balance ' + OwnerTokBalanceAfter);
      logging('publicKeys[0]=' + Owner + ' has new Ether balance ' + afterOwnerEthbalance);
      assert.equal(OwnerTokBalanceBefore.toNumber(), OwnerTokBalanceAfter.toNumber(), "Owner token shall not change");
      logging('publicKeys[8]=' + notOwner + ' has new token balance ' + notOwnerTokBalanceAfter);
      logging('publicKeys[8]=' + notOwner + ' has new Ether balance ' + afterNotOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has new token balance ' + tradeContractTokBalanceAfter);
      logging('TradeContract=' + trade_contract.address + ' has new Ether balance ' + afterTradeContractEthbalance);
      assert.equal(notOwnerTokBalanceBefore.add(expect_rcv_token).toNumber(), notOwnerTokBalanceAfter, "Something is off with exchange rate for publiKeys[8]");
      // should be slightly higher after subtracting gas/tx fee which is 23000, adjust based on the contract tx cost
      assert.isAtLeast(afterTradeContractEthbalance.toNumber(), expect_trade_contract_eth_balance.sub(potential_gas_fee).toNumber(), "Trade contract did not rcv the right eth from other users");
      (await trade_contract.withdraw(value, {from: Owner}));
      afterOwnerEthbalance = web3.eth.getBalance(Owner);
      afterTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[0]=' + Owner + ' has new Ether balance ' + afterOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has new Ether balance ' + afterTradeContractEthbalance);
      assert.isAtLeast(initOwnerEthbalance.add(value).sub(potential_gas_fee).toNumber(), afterOwnerEthbalance.toNumber(), "Owner should be able to withdraw eth from Trade Contract");
    });

    it('should be able to withdraw from a preset target wallet that is NOT the contract creator/owner', async function() {
      let Owner = publicKeys[0]; // accounts[0]
      let notOwner = publicKeys[8]; // our preset target wallet
      let notOwnerPrivateKey = privateKeys[8];
      let initNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      let initTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[8]=' + notOwner + ' has init Ether balance ' + initNotOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has init Ether balance ' + initTradeContractEthbalance);
    
      // Update target_wallet
      (await trade_contract.updateWithdrawAddress(notOwner, {from: Owner}));

      let value = new BigNumber(3).mul(eth_to_wei); // 1 eth = 1 * 10 ** 18 wei.
      let expect_trade_contract_eth_balance = initTradeContractEthbalance.add(value);
      
      let data = web3Contract.takerBuyAsset.getData();
      let potential_gas_fee = 23000; // wei
      let result = await rawTransaction(
        notOwner,
        notOwnerPrivateKey,
        trade_contract.address,
        data,
        value.toNumber()
      );

      let afterNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      let afterTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[8]=' + notOwner + ' has new Ether balance ' + afterNotOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has new Ether balance ' + afterTradeContractEthbalance);
      // should be slightly higher after subtracting gas/tx fee which is 23000, adjust based on the contract tx cost
      assert.isAtLeast(afterTradeContractEthbalance.toNumber(), expect_trade_contract_eth_balance.sub(potential_gas_fee).toNumber(), "Trade contract did not rcv the right eth from other users");
      (await trade_contract.withdraw(value, {from: notOwner}));
      afterNotOwnerEthbalance = web3.eth.getBalance(notOwner);
      afterTradeContractEthbalance = web3.eth.getBalance(trade_contract.address);
      logging('publicKeys[8]=' + notOwner + ' has new Ether balance ' + afterNotOwnerEthbalance);
      logging('TradeContract=' + trade_contract.address + ' has new Ether balance ' + afterTradeContractEthbalance);
      assert.isAtLeast(initNotOwnerEthbalance.add(value).sub(potential_gas_fee).toNumber(), afterNotOwnerEthbalance.toNumber(), "Target wallet should be able to withdraw eth from Trade Contract");
    });
    /* jshint ignore:end */

  }); // end of describe

}); // end of contract