pragma solidity ^0.4.24;

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
    // mapping (address => bytes) public ipfsMapping; // record all IPFS registry per wallet? not economicable!
    mapping (address => string) private ipfsMapping; // record ONLY one IPFS registry per wallet for now - prototype
    // like the title for property, First come first serve
    mapping (string => address) private ipfsMetaData;
    /** 
    Provides the real IPFS hash when user call and pay for the proper token value.
      price: token to purchase ipfs hash
      ipfsHash: the real IPFS hash
    */
    struct ipfsPayment {
        uint256 price;
        string  ipfsHash;
    }
    // unique string map to the correct Ipfs Payment record
    mapping (string => ipfsPayment) private decryptIpfs;
    // escrow account, wallet <=> token amount
    mapping (address => uint256) private escrowTokens;
    
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
    event RewardTokens(address indexed dataowner, uint256 ethersSent, uint256 tokensGranted);
    event RegisteredFreeRecord(address indexed registor, string ipfsHash);
    event RegisteredEncryptedRecord(address indexed registor, string ipfsMetadataHash, uint256 underlyingFileSize, uint256 tokenCost);
    event PurchaseTxRecord(address indexed accesser, address indexed dataowner, uint256 tokenCost);
    event RewardEvent(string msg, bool allowIpfsREgistration);

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
    TODO: extend to more than 1 record to keep? or it is not necessary?
    Update record for new IPFS hash. Needs to burn gas.
    This provides real IPFS hash without encryption, users can access IPFS hash for free.
     */
    function registerIPFS(string ipfsHash, uint256 filesize) external payable returns (bool) {
        require(bytes(ipfsHash).length > 0, "cannot store empty hash"); // can't register empty hash
        require(ipfsMetaData[ipfsHash] == 0, "ipfs hash already registered"); // new record only
        ipfsMapping[msg.sender] = ipfsHash;
        ipfsMetaData[ipfsHash] = msg.sender;
        emit RegisteredFreeRecord(msg.sender, ipfsHash);
        // BMD token = filesize / defaultRewardFileSize e.g. 400GB / 200GB = 2 BMD
        uint256 bmd_token_granted = safeDiv(safeMul(filesize, 10**decimals), defaultRewardFileSize);
        if (InterfaceERC20(exchanging_token_addr).transfer(msg.sender, bmd_token_granted)) {
            emit RewardTokens(msg.sender, msg.value, bmd_token_granted);
        } else {
            revert("Registering failed");
        }
    }

    /**
      ipfsMetadataHash: metadata IPFS content hash
      encryptedIndex: a SHA256 value as index for this record
      ipfsHash: the real IPFS hash for the underlying file/content
      realFilesize: The real file size for ipfsHash
     */
    function encryptIPFS(string ipfsMetadataHash, string encryptedIndex, string ipfsHash, uint256 realFilesize) external payable returns (bool) {
        require(bytes(ipfsHash).length > 0, "cannot store empty ipfs hash"); // can't register empty hash
        require(bytes(ipfsMetadataHash).length > 0, "cannot store empty ipfs metadata hash"); // can't register empty hash
        require(ipfsMetaData[ipfsMetadataHash] == 0, "ipfs metadata hash already registered"); // new record only
        // BMD token = filesize / defaultRewardFileSize e.g. 400GB / 200GB = 2 BMD
        uint256 bmd_token_cost = safeDiv(safeMul(realFilesize, 10**decimals), defaultRewardFileSize);
        ipfsMetaData[ipfsMetadataHash] = msg.sender;
        decryptIpfs[encryptedIndex].price = bmd_token_cost;
        decryptIpfs[encryptedIndex].ipfsHash = ipfsHash;
        // This refers to the encrypted ones
        emit RegisteredEncryptedRecord(msg.sender, ipfsMetadataHash, realFilesize, bmd_token_cost);
        if (InterfaceERC20(exchanging_token_addr).transfer(msg.sender, bmd_token_cost)) {
            emit RewardTokens(msg.sender, msg.value, bmd_token_cost);
        } else {
            revert("Registering failed");
        }
        return true;
    }

    /**
     encryptedIndex: the index to look up and pay tokens for the real IPFS hash
     ipfsMetadataHash: the owner of the metadata to get reward

     return: ipfsHash, token_cost
     */
    function decryptIPFS(string encryptedIndex, string ipfsMetadataHash) external returns (string, uint256) {
        require(bytes(encryptedIndex).length > 0, "cannot query empty index");
        // TBD: capture these to look for abuse?
        // If price is 0, revert, the user does not need to call this function as well.
        require(decryptIpfs[encryptedIndex].price != 0, "invalid index query");
        uint256 minimal_cost = decryptIpfs[encryptedIndex].price;
        address data_owner = ipfsMetaData[ipfsMetadataHash];
        require(data_owner != 0, "wallet address invalid");
        require(InterfaceERC20(exchanging_token_addr).transfer(data_owner, minimal_cost), "Sending token to data owner failed");
        require(InterfaceERC20(exchanging_token_addr).transferCost(msg.sender, minimal_cost), "Deduct token from purchaser to us");
        emit PurchaseTxRecord(msg.sender, data_owner, minimal_cost);
        string storage ipfsHash = decryptIpfs[encryptedIndex].ipfsHash;
        return (ipfsHash, minimal_cost);
    }

    /**
      Eth exchanged to tokens are not spendable here. They are hold in this contract to purchase the
      ipfsHash. The Eth fund will not be released and will be consumed by the contract to cover the disbursement
      for the uploader's token, unless there is a refund for any reason.
     */
    function registerEscrow(string encryptedIndex) external payable {
        require(bytes(encryptedIndex).length > 0, "cannot escrow an empty index");
        require(decryptIpfs[encryptedIndex].price != 0, "invalid index query");
        uint256 tokens = safeMul(safeMul(msg.value, 10**decimals), exchangeRate);
        uint256 minimal_cost = decryptIpfs[encryptedIndex].price;
        require(tokens > minimal_cost, "the eth deposited should exchange sufficient tokens for escrow");
        escrowTokens[msg.sender] = tokens;
    }

    /**
     The user needs to send the equivalant ETH that will be used to get tokens for the purchase.

     encryptedIndex: the index to look up and pay tokens for the real IPFS hash
     ipfsMetadataHash: the owner of the metadata to get reward

     return: ipfsHash, token_cost
    */
    function decryptIPFSwithEth(string encryptedIndex, string ipfsMetadataHash) external returns (string, uint256) {
        require(bytes(encryptedIndex).length > 0, "cannot query empty index");
        // TBD: capture these to look for abuse?
        // If price is 0, revert, the user does not need to call this function as well.
        require(decryptIpfs[encryptedIndex].price != 0, "invalid index query");
        uint256 escrow_token_balance = escrowTokens[msg.sender];
        uint256 minimal_cost = decryptIpfs[encryptedIndex].price;
        require(escrow_token_balance > minimal_cost, "the eth deposited should exchange sufficient tokens for purchase");
        uint256 new_token_balance = safeSub(escrow_token_balance, minimal_cost);
        escrowTokens[msg.sender] = new_token_balance;
        address data_owner = ipfsMetaData[ipfsMetadataHash];
        // Send purchase token from this contract first
        require(InterfaceERC20(exchanging_token_addr).transfer(data_owner, minimal_cost), "Sending token to data owner failed");
        // Claim the cost from the purchaser
        require(InterfaceERC20(exchanging_token_addr).transferCost(msg.sender, minimal_cost), "Deduct token from purchaser to us");
        emit PurchaseTxRecord(msg.sender, data_owner, minimal_cost);
        string storage ipfsHash = decryptIpfs[encryptedIndex].ipfsHash;
        return (ipfsHash, minimal_cost);
    }

    function () public payable {
        revert("we do not accept payments here");
    }

    function ownerKill() public restricted {
        selfdestruct(owner);
    }
}
