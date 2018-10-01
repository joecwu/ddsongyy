pragma solidity ^0.4.20;

import "./ERC20Token.sol";

/**
* Actual Tx Cost/Fee: 0.1343282 Ether (Gas used by tx 1343282)
*/
contract TradeContract is SafeMath {

    // contract owner
    address public owner;
    // the address that can modify the exchange rate on-the-fly
    address public exchanger;
    // The token contract is dealing with
    address public exchanging_token_addr;
    // activate token exchange, we can shut this down anytime by 'owner'
    bool public allowTokenEx = true;
    // activate ipfs registration, we can shut this down anytime by 'owner'
    bool public allowIpfsReg = true;
    uint256 public constant decimals = 18;

    // This exchange rate is calculated magically and set by a seperate process
    uint256 public exchangeRate = 200; // 1 eth = 200.000000000000000000 USD = 200 BMD

    modifier restricted() {
        if (msg.sender != owner) {
            revert("caller is not contract owner");
        }
        _;
    }

    // open outcry - the master to set the exchange rate
    modifier pitmaster() {
        require(exchanger != 0, "Exchanger not set, can't trigger any function!");
        if (msg.sender != exchanger) {
            revert("caller is not the pit master / exchange owner");
        }
        _;
    }

    /** 
     Events to capture and notify
     */
    event ExchangeTokens(address indexed buyer, uint256 ethersSent, uint256 tokensBought);
    event AllowExchange(string msg, bool allowTokenEx);
    event NewExchangeRate(string msg, uint256 newExchangeRate);

    constructor(address _ex_tok_addr, bool enableTokenEx) public {
        if (_ex_tok_addr == 0x0) revert("cannot interact with null contract");
        owner = msg.sender;
        exchanging_token_addr = _ex_tok_addr;
        allowTokenEx = enableTokenEx;
        if(exchangeRate < 0) revert("exchange rate cannot be negative");
    }

    function currentTokenContract() public view returns (address tok_addr) {
        return exchanging_token_addr;
    }

    function activate(bool flipTokenEx) public restricted {
        allowTokenEx = flipTokenEx;
        emit AllowExchange("allow token exchange", flipTokenEx);
    }

    // Once contract owner set this, we no longer need the contract owner to update the exchange rate
    function delegateExchangerAddress(address _exchanger) public restricted {
        exchanger = _exchanger;
    }

    function setExchangeRate(uint256 newExRate) public pitmaster {
        require(newExRate > 0, "Exchange rate can never be set to 0 or negative");
        exchangeRate = newExRate;
        emit NewExchangeRate("New exchange rate set", newExRate);
    }

    function takerBuyAsset() public payable {
        if (allowTokenEx || msg.sender == owner) {
            // Note that exchangeRate has already been validated as > 0
            uint256 tokens = safeMul(msg.value, exchangeRate);
            require(tokens > 0, "something went wrong on our math, token value negative");
            // ERC20Token contract will see the msg.sender as the 'TradeContract contract' address
            // This means, you will need Token balance under THIS CONTRACT!!!!!!!!!!!!!!!!!!!!!!
            require(InterfaceERC20(exchanging_token_addr).transfer(msg.sender, tokens), "Exchanged token transfer failed!");
            emit ExchangeTokens(msg.sender, msg.value, tokens);
        }
        else
        {
            revert("token exchange not allowed, or you are not contract owner");
        }
    }

    function () public payable {
        takerBuyAsset();
    }

    function ownerKill() public restricted {
        selfdestruct(owner);
    }
}
