pragma solidity ^0.4.24;

import "./ERC20Token.sol";

/**
* Actual Tx Cost/Fee: 0.1343282 Ether (Gas used by tx 1343282)
*/
contract RewardDistributor is SafeMath {

    // contract owner
    address public owner;
    address public rewardexchanger;

    // The token contract is dealing with
    address public exchanging_token_addr;
    // activate token exchange, we can shut this down anytime by 'owner'
    bool public allowTokenEx = true;
    // activate ipfs registration, we can shut this down anytime by 'owner'
    bool public allowIpfsReg = true;
    uint256 public constant decimals = 18;

    // A simple constant reward at the moment
    uint256 public defaultRewardFileSize = 200 * 1000 * 1000 * 1000; // 1 tokens reward = 200GB (200,000,000,000)
    
    // proof of stake - minimal requirement for a wallet to be registered and active
    /**
    pos: Proof of Stake threshold. Qualify condition to collect rewards. This requires the users to
    become part of the eco-system by holding sufficient 'stake' as a collateral/security deposit to
    manage their behavior.
    */
    uint256 public pos;

    // wallet => ipfs
    mapping (address => string) private ipfsMapping; // record ONLY encrypted IPFS registry per wallet for now - prototype

    // ipfs => wallet 
    // like the title for property, First come first serve
    mapping (string => address) private ipfsMetaData;

    /** 
    Provides the real IPFS hash when user call and pay for the proper token value.
      price: token to purchase ipfs hash
      ipfsHash: the real IPFS hash
    */
    struct ipfsPayment {
        uint256 price;
        string  ipfsKeyIdx; // to fetch the key to decrypt
        string  encryptedIpfs;
    }
    // unique string map to the correct Ipfs Payment record
    mapping (string => ipfsPayment) private decryptIpfs;
    mapping (string => uint256) private randomNess;
    // variable length keys here
    mapping (string => bytes) private decryptKeys; 
    // A temp storage for each ipfs file access by wallet, only wallet owner
    // can access their own slot
    mapping (address => ipfsPayment) private tmpKeyStorage;

    // TODO: Introduce penalties (lien) to hold rewards or wallet removal for bad actors
    // mapping (address => bool) blacklist;

    modifier restricted() {
        if (msg.sender != owner) {
            revert("caller is not contract owner");
        }
        _;
    }

    // the master to set the exchange rate
    modifier requiremaster() {
        require(rewardexchanger != 0, "Reward exchanger not set, can't trigger any function!");
        if (msg.sender != rewardexchanger) {
            revert("caller is not the delegated exchange owner");
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
    event NewExchangeRate(string msg, uint256 newExchangeRate);

    constructor(address _ex_tok_addr, bool enableTokenEx, uint256 _pos) public {
        if (_ex_tok_addr == 0x0) revert("cannot interact with null contract");
        owner = msg.sender;
        exchanging_token_addr = _ex_tok_addr;
        allowTokenEx = enableTokenEx;
        pos = _pos;
        if(defaultRewardFileSize < 0) revert("reward file size cannot be 0 nor negative");
        emit RewardEvent("allow ipfs registration", allowIpfsReg);
    }

    function currentTokenContract() public view returns (address tok_addr) {
        return exchanging_token_addr;
    }

    function activateRegistry(bool allowIpfsRegister) public restricted {
        allowIpfsReg = allowIpfsRegister;
        emit RewardEvent("allow ipfs registration", allowIpfsReg);
    }

    // Once contract owner set this, we no longer need the contract owner to update the exchange rate
    function delegateExchangerAddress(address _exchanger) public restricted {
        rewardexchanger = _exchanger;
    }

    function setRewardExchangeRate(uint256 newRewardExRate) public requiremaster {
        require(newRewardExRate > 0, "Exchange rate can never be set to 0 or negative");
        defaultRewardFileSize = newRewardExRate;
        emit NewExchangeRate("New reward exchange rate set", newRewardExRate);
    }

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

    // Returns a random number for users to shuffle their key, etc.
    function generateLocalRand(string keyLookupIdx, uint256 seed) external returns (bool) {
        // This is really just a dummy picker on the seed from the user
        uint256 s = safeDiv(seed, 13);
        randomNess[keyLookupIdx] = s;
        return true;
    }

    function getLocalRand(string keyLookupIdx) external view returns (uint256) {
        return randomNess[keyLookupIdx];
    }

    function registerKey(string keyLookupIdx, bytes key) internal returns(bool) {
        decryptKeys[keyLookupIdx] = key;
    }

    function fetchKey(string keyLookupIdx) private view returns(bytes) {
        return decryptKeys[keyLookupIdx];
    }

    /**
      ipfsMetadataHash: metadata IPFS content hash
      keyLookupIdx: a SHA256 value as index for this record
      ipfsEncryptedHash: the real IPFS hash for the underlying file/content
      realFilesize: The real file size for the uploaded ipfs file
     */
    function encryptIPFS(
        string ipfsMetadataHash, 
        string partialKey, 
        string indirectKeyIdx,
        string ipfsEncryptedHash, 
        uint256 realFilesize) external payable returns (bool) 
        {
        require(bytes(ipfsEncryptedHash).length > 0, "cannot store empty ipfs hash"); // can't register empty hash
        require(bytes(ipfsMetadataHash).length > 0, "cannot store empty ipfs metadata hash"); // can't register empty hash
        require(ipfsMetaData[ipfsMetadataHash] == 0, "ipfs metadata hash already registered"); // new record only
        // BMD token = filesize / defaultRewardFileSize e.g. 400GB / 200GB = 2 BMD
        uint256 bmd_token_cost = safeDiv(safeMul(realFilesize, 10**decimals), defaultRewardFileSize);
        ipfsMetaData[ipfsMetadataHash] = msg.sender;
        decryptIpfs[ipfsMetadataHash].price = bmd_token_cost;
        decryptIpfs[ipfsMetadataHash].ipfsKeyIdx = indirectKeyIdx;
        decryptIpfs[ipfsMetadataHash].encryptedIpfs = ipfsEncryptedHash;
        decryptKeys[indirectKeyIdx] = bytes(partialKey);
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
     keyLookupIdx: the index to look up and pay tokens for the real IPFS hash
     ipfsMetadataHash: the owner of the metadata to get reward

     return: ipfsHash, token_cost
     */
    function decryptIPFS(string ipfsMetadataHash) external payable returns (bool) {
        require(bytes(ipfsMetadataHash).length > 0, "cannot query empty index");
        // TBD: capture these to look for abuse?
        // If price is 0, revert, the user does not need to call this function as well.
        require(decryptIpfs[ipfsMetadataHash].price != 0, "invalid index query");
        uint256 minimal_cost = decryptIpfs[ipfsMetadataHash].price;
        address data_owner = ipfsMetaData[ipfsMetadataHash];
        require(data_owner != 0, "wallet address invalid");
        require(InterfaceERC20(exchanging_token_addr).transfer(data_owner, minimal_cost), "Sending token to data owner failed");
        require(InterfaceERC20(exchanging_token_addr).transferCost(msg.sender, minimal_cost), "Deduct token from purchaser to us");
        emit PurchaseTxRecord(msg.sender, data_owner, minimal_cost);
        tmpKeyStorage[msg.sender].encryptedIpfs = decryptIpfs[ipfsMetadataHash].encryptedIpfs;
        tmpKeyStorage[msg.sender].ipfsKeyIdx = decryptIpfs[ipfsMetadataHash].ipfsKeyIdx;
        tmpKeyStorage[msg.sender].price = minimal_cost;
        return true;
    }

    function fetchKeyForIPFS() external view returns (string, uint256, string, uint256) {
        uint256 minimal_cost = tmpKeyStorage[msg.sender].price;
        string storage indirectKeyIdx = tmpKeyStorage[msg.sender].ipfsKeyIdx;
        string storage encIpfs = tmpKeyStorage[msg.sender].encryptedIpfs;
        string storage pkey = string(decryptKeys[indirectKeyIdx]);
        uint256 rkey = randomNess[indirectKeyIdx];
        return (pkey, rkey, encIpfs, minimal_cost);
    }

    function () public payable {
        revert("we do not accept payments here");
    }

    function ownerKill() public restricted {
        selfdestruct(owner);
    }
}
