/*jshint esversion: 6*/
const BigNumber = web3.BigNumber;
var erc20 = artifacts.require("ERC20Token");
var ipfsreward = artifacts.require("RewardDistributor.sol");
var trade = artifacts.require("TradeContract.sol");
var proof_of_stake_balance = 100;
var ipfsreward_instance;
var erc20_instance;
var trade_instance;
var decimals = 18;
/* jshint ignore:start */
var eth_to_wei = new BigNumber(10**decimals);
/* jshint ignore:end */

// deployer, network, accounts must be in the exact order.
module.exports = function(deployer, network, accounts) {
  let deploy_address = accounts[0];
  deployer.deploy(erc20, 'BlockMed', 'BMD', {from: deploy_address}).then(function(erc20_i) {
    erc20_instance = erc20_i;
    console.log("network=" + JSON.stringify(network) + " accounts=" + JSON.stringify(accounts));
    console.log("Contracts are deployed by wallet " + deploy_address);
    console.log("ERC20Token BMD address is created on " + erc20_instance.address);
    console.log("Don't forget to register the RewardDistributor address for Escrow");
    return deployer.deploy(ipfsreward, erc20_instance.address, true, proof_of_stake_balance);
  }).then(function(ipfsreward_i) {
    ipfsreward_instance = ipfsreward_i;
    console.log("RewardDistributor address is created on " + ipfsreward_instance.address);
    return deployer.deploy(trade, erc20_instance.address, accounts[0], true, {from: deploy_address});
  }).then(function(trade_i) {
    trade_instance = trade_i;
    console.log("TradeContract address is created on " + trade_i.address);
    erc20_instance.transfer(trade_i.address, new BigNumber(1000000).mul(eth_to_wei));
    console.log("Funding TradeContract contract " + trade_i.address + " 1000000 tokens from accounts[0]=" + deploy_address);
  }).then(function() {
    erc20_instance.register_tradingcontract(trade_instance.address);
  }).then(function() {
    erc20_instance.register_rewardcontract(ipfsreward_instance.address);
  }).then(function() {
    erc20_instance.transfer(ipfsreward_instance.address, new BigNumber(1000000).mul(eth_to_wei));
    console.log("Funding RewardDistributor contract " + ipfsreward_instance.address + " with 1000000 tokens from accounts[0]=" + deploy_address);
  });
};
