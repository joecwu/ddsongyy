pragma solidity ^0.4.20;

import "./ERC20Token.sol";

/**
* Actual Tx Cost/Fee: 0.1343282 Ether (Gas used by tx 1343282)
*/
contract RewardDistributor is SafeMath {

    // contract owner
    address public owner;
    // The token contract is dealing with
    address public exchanging_token_addr;
    // activate token exchange, we can shut this down anytime by 'owner'
    bool public allowTokenEx = true;
    // activate ipfs registration, we can shut this down anytime by 'owner'
    bool public allowIpfsReg = true;
    uint256 public constant decimals = 18;
    uint256 public exchangeRate = 200; // 1 eth = 200.000000000000000000 BMD

    // A simple constant reward at the moment
    uint256 constant defaultRewardFileSize = 200 * 1000 * 1000 * 1000; // 1 tokens reward = 200GB (200,000,000,000)
    
    // proof of stake - minimal requirement for a wallet to be registered and active
    /**
    pos: Proof of Stake threshold. Qualify condition to collect rewards. This requires the users to
    become part of the eco-system by holding sufficient 'stake' as a collateral/security deposit to
    manage their behavior.
    */
    uint256 public pos;

    /**
    * Data contribution from wallets, e.g. wallet => set[IPFS hash].
    */
    uint8 constant defaultRecord = 1; // only record up to 200, and start rotating. FIFO.
    // mapping (address => bytes) public ipfsMapping; // record all IPFS registry per wallet
    mapping (address => string) private ipfsMapping; // record ONLY one IPFS registry per wallet for now - prototype
    mapping (string => address) private ipfsRecordOwner; // like the title for property, First come first serve
    
    // TODO: Introduce penalties (lien) to hold rewards or wallet removal for bad actors
    // mapping (address => bool) blacklist;

    modifier restricted() {
        if (msg.sender != owner) {
            revert("caller is not contract owner");
        }
        _;
    }

    /** 
     Events to capture and notify
     */
    event RewardTokens(address indexed buyer, uint256 ethersSent, uint256 tokensBought);
    event RegisteredRecord(address indexed registor, string ipfsHash);
    event RewardEvent(string msg, bool allowTokenEx);

    constructor(address _ex_tok_addr, bool enableTokenEx, uint256 _pos) public {
        if (_ex_tok_addr == 0x0) revert("cannot interact with null contract");
        owner = msg.sender;
        exchanging_token_addr = _ex_tok_addr;
        allowTokenEx = enableTokenEx;
        pos = _pos;
        if(exchangeRate < 0) revert("exchange rate cannot be negative");
        emit RewardEvent("allow ipfs registration", allowIpfsReg);
    }

    function currentTokenContract() public view returns (address tok_addr) {
        return exchanging_token_addr;
    }

    function activateRegistry(bool allowIpfsRegister) public restricted {
        allowIpfsReg = allowIpfsRegister;
        emit RewardEvent("allow ipfs registration", allowIpfsReg);
    }

    /**
     * returns the fix-length of IPFS hash in a list for an address/wallet.
     * This could become EXPENSIVE! Be aware! Always return 200 or less records.
     * ipfsH1|ipfsH2|ipfsH3|...|ipfsHn where n = max record defined by 'defaultRecord'.
     * the byte array length is always fix as (defaultRecord x 48)
     */
     /**
    function queryIPFSList(address wallet) view public returns (string) {
        // Return array type still experimental, ipfs hash are fix length
        // e.g. QmarHSr9aSNaPSR6G9KFPbuLV9aEqJfTk1y9B8pdwqK4Rq
        bytes memory ipfs_list = ipfsMapping[wallet]; // this is experimental
        require(ipfs_list.length > 0);
        uint total_record_len = 48 * defaultRecord;
        bytes memory ipfs_bytes_list = new bytes(total_record_len);
        for(uint i = 0; i < total_record_len; i++) {
            ipfs_bytes_list[i] = ipfs_list[i];
        }
        return string(ipfs_bytes_list);
    }
    */

    function queryIPFSList(address wallet) external view returns (string) {
        require(wallet != 0, "null address cannot be queried");
        return ipfsMapping[wallet];
    }

    /**
    Update record for new IPFS hash. Needs to burn gas. Fees are applied in the future.
    TODO: extend to more than 1 record to keep
     */
    function registerIPFS(string ipfsHash, uint256 filesize) external payable returns (bool) {
        require(bytes(ipfsHash).length > 0, "cannot store empty hash"); // can't register empty hash
        require(ipfsRecordOwner[ipfsHash] == 0, "ipfs hash already registered"); // new record only
        ipfsMapping[msg.sender] = ipfsHash;
        ipfsRecordOwner[ipfsHash] = msg.sender;
        emit RegisteredRecord(msg.sender, ipfsHash);
        // BMD token = filesize / defaultRewardFileSize e.g. 400GB / 200GB = 2 BMD
        uint256 bmd_token_granted = safeDiv(safeMul(filesize, 10**decimals), defaultRewardFileSize);
        if (InterfaceERC20(exchanging_token_addr).transfer(msg.sender, bmd_token_granted)) {
            emit RewardTokens(msg.sender, msg.value, bmd_token_granted);
        }
    }

    function () public payable {
        revert("we do not accept payments here");
    }

    function ownerKill() public restricted {
        selfdestruct(owner);
    }
}
