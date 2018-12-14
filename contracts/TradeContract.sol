pragma solidity ^0.4.24;

import "./ERC20Token.sol";

/**
* Actual Tx Cost/Fee: 0.1343282 Ether (Gas used by tx 1343282)
*/
contract TradeContract is SafeMath {

    // contract owner
    address public owner;
    // the address that can modify the exchange rate on-the-fly
    address public exchanger;
    // the address to withdraw some eth
    address private target_wallet;
    // The token contract is dealing with
    address public exchanging_token_addr;
    // activate token exchange, we can shut this down anytime by 'owner'
    bool public allowTokenEx = true;
    // activate ipfs registration, we can shut this down anytime by 'owner'
    bool public allowIpfsReg = true;
    uint256 public constant decimals = 18;

    // This exchange rate is calculated magically and set by a seperate process
    uint256 public exchangeRate = 200; // 1 eth = 200.000000000000000000 USD = 200 BMD

    // This defines the threshold to replenish the holding tokens in this contract
    uint256 private constant replenish_threshold = 100000;

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

    // restrict withdraw ownership to existing target wallets or owners only
    modifier restricted_withdraw() {
        if (msg.sender != owner && msg.sender != target_wallet) {
            revert("caller is not contract owner nor existing withdrawer");
        }
        _;
    }

    /** 
     Events to capture and notify
     */
    event ExchangeTokens(address indexed buyer, uint256 ethersSent, uint256 tokensBought);
    event AllowExchange(string msg, bool allowTokenEx);
    event NewExchangeRate(string msg, uint256 newExchangeRate);
    event Withdrawal(address caller, address target_wallet, uint256 amount);

    constructor(address _ex_tok_addr, address _target_wallet, bool enableTokenEx) public {
        if (_ex_tok_addr == 0x0) revert("cannot interact with null contract");
        if (_target_wallet == 0x0) revert("cannot set 0 to target wallet during initialization");
        owner = msg.sender;
        target_wallet = _target_wallet;
        exchanging_token_addr = _ex_tok_addr;
        allowTokenEx = enableTokenEx;
        if(exchangeRate < 0) revert("exchange rate cannot be negative");
    }

    function currentTokenContract() public view returns (address tok_addr) {
        return exchanging_token_addr;
    }

    function activate(bool flipTokenEx) external restricted {
        allowTokenEx = flipTokenEx;
        emit AllowExchange("allow token exchange", flipTokenEx);
    }

    // Once contract owner set this, we no longer need the contract owner to update the exchange rate
    function delegateExchangerAddress(address _exchanger) external restricted {
        exchanger = _exchanger;
    }

    function updateWithdrawAddress(address _target_wallet) external restricted_withdraw {
        target_wallet = _target_wallet;
    }

    function setExchangeRate(uint256 newExRate) external pitmaster {
        require(newExRate > 0, "Exchange rate can never be set to 0 or negative");
        exchangeRate = newExRate;
        emit NewExchangeRate("New exchange rate set", newExRate);
    }

    /**
    This is an auto-check to replenish the pool of funds for trading autonomously.
    We also restrict this function access to this contract only and the contract owner.
    */
    function replenishFund() internal {
        require(InterfaceERC20(exchanging_token_addr).replenishTradeContract(), "Replenish Trade contract failed!");
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
            replenishFund();
        }
        else
        {
            revert("token exchange not allowed, or you are not contract owner");
        }
    }

    function () public payable {
        takerBuyAsset();
    }

    function ownerKill() external restricted {
        selfdestruct(owner);
    }

    function withdraw(uint256 amount) external restricted_withdraw {
        require(target_wallet != 0, "Target wallet not set, can't withdraw!");
        // Use transfer() : require(target_wallet.send(amount), "Can't withdraw eth");
        target_wallet.transfer(amount);
        emit Withdrawal(msg.sender, target_wallet, amount);
    }
}
