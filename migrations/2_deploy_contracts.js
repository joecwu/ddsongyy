/*jshint esversion: 6*/
var erc20 = artifacts.require("ERC20Token");
var ipfsreward = artifacts.require("RewardDistributor.sol");
var trade = artifacts.require("TradeContract.sol");
var proof_of_stake_balance = 100;
var ipfsreward_instance;
var erc20_instance;
var trade_instance;

module.exports = function(deployer) {
  deployer.deploy(erc20, 'BlockMed', 'BMD').then(function(erc20_i) {
    erc20_instance = erc20_i;
    console.log("ERC20Token BMD address is created on " + erc20_instance.address);
    console.log("Don't forget to register the RewardDistributor address for Escrow");
    return deployer.deploy(ipfsreward, erc20_instance.address, true, proof_of_stake_balance);
  }).then(function(ipfsreward_i) {
    ipfsreward_instance = ipfsreward_i;
    console.log("RewardDistributor address is created on " + ipfsreward_instance.address);
    console.log("Don't forget to fund RewardDistributor contract " + ipfsreward_instance.address + " 500000000 tokens to start from accounts[0]");
    return deployer.deploy(trade, erc20_instance.address, true);
  }).then(function(trade_i) {
    console.log("TradeContract address is created on " + trade_i.address);
    console.log("Don't forget to fund TradeContract contract " + trade_i.address + " 500000000 tokens to start from accounts[0]");
  }).then(function() {
    erc20_instance.register_rewardcontract(ipfsreward_instance.address);
  });

  
};
