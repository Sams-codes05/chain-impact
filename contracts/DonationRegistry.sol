// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DonationRegistry
 * @dev Smart contract for immutable donation record storage on Polygon Amoy Testnet
 * Stores ONLY donation hash, timestamp, and status - NO personal data on-chain
 * All personal donor information stays off-chain in Supabase
 */
contract DonationRegistry {
    
    // Donation status enum
    enum Status { PENDING, VERIFIED, REJECTED }
    
    // Donation struct - hash-only to preserve privacy
    struct Donation {
        bytes32 donationHash;        // SHA-256 hash of: name + phone + amount + txId + timestamp
        uint256 timestamp;           // Block timestamp when recorded
        Status status;               // PENDING, VERIFIED, or REJECTED
        bool exists;                 // Track existence to prevent duplicates
    }
    
    // Mapping from donationHash to Donation record
    mapping(bytes32 => Donation) public donations;
    
    // Array to store all donation hashes
    bytes32[] public donationHashes;
    
    // Admin address for status updates
    address public admin;
    
    // Total donations recorded
    uint256 public totalDonations;
    
    // Events
    event DonationAdded(
        bytes32 indexed donationHash,
        uint256 timestamp,
        string status
    );
    
    event StatusUpdated(
        bytes32 indexed donationHash,
        string newStatus,
        address indexed updatedBy,
        uint256 timestamp
    );
    
    event AdminChanged(
        address indexed oldAdmin,
        address indexed newAdmin
    );
    
    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }
    
    modifier donationExists(bytes32 donationHash) {
        require(donations[donationHash].exists, "Donation not found on blockchain");
        _;
    }
    
    modifier donationNotExists(bytes32 donationHash) {
        require(!donations[donationHash].exists, "Donation hash already recorded");
        _;
    }
    
    /**
     * @dev Constructor initializes the contract with admin
     */
    constructor() {
        admin = msg.sender;
        totalDonations = 0;
    }
    
    /**
     * @dev Add a new donation record (hash-only)
     * @param donationHash SHA-256 hash: keccak256(abi.encodePacked(name, phone, amount, txId, timestamp))
     * Called by admin after payment verification
     */
    function addDonation(bytes32 donationHash) 
        external 
        onlyAdmin 
        donationNotExists(donationHash) 
    {
        require(donationHash != bytes32(0), "Invalid donation hash");
        
        donations[donationHash] = Donation({
            donationHash: donationHash,
            timestamp: block.timestamp,
            status: Status.PENDING,
            exists: true
        });
        
        donationHashes.push(donationHash);
        totalDonations++;
        
        emit DonationAdded(donationHash, block.timestamp, "PENDING");
    }
    
    /**
     * @dev Update donation status (admin only)
     * @param donationHash Hash of the donation to update
     * @param newStatus New status: 0=PENDING, 1=VERIFIED, 2=REJECTED
     */
    function updateStatus(bytes32 donationHash, uint8 newStatus)
        external
        onlyAdmin
        donationExists(donationHash)
    {
        require(newStatus <= 2, "Invalid status: use 0(PENDING), 1(VERIFIED), or 2(REJECTED)");
        
        Status status = Status(newStatus);
        donations[donationHash].status = status;
        
        string memory statusStr = newStatus == 0 ? "PENDING" : (newStatus == 1 ? "VERIFIED" : "REJECTED");
        
        emit StatusUpdated(donationHash, statusStr, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Get donation details by hash
     * @param donationHash Hash to query
     * @return hash The donation hash
     * @return timestamp When recorded on-chain
     * @return status Donation status
     */
    function getDonation(bytes32 donationHash)
        external
        view
        donationExists(donationHash)
        returns (
            bytes32 hash,
            uint256 timestamp,
            string memory status
        )
    {
        Donation memory donation = donations[donationHash];
        string memory statusStr = uint8(donation.status) == 0 ? "PENDING" : 
                                   (uint8(donation.status) == 1 ? "VERIFIED" : "REJECTED");
        
        return (donation.donationHash, donation.timestamp, statusStr);
    }
    
    /**
     * @dev Check if donation exists and get its status
     * @param donationHash Hash to verify
     * @return exists True if found
     * @return status Status as string
     */
    function verifyDonation(bytes32 donationHash)
        external
        view
        returns (bool exists, string memory status)
    {
        if (!donations[donationHash].exists) {
            return (false, "NOT_FOUND");
        }
        
        Donation memory donation = donations[donationHash];
        string memory statusStr = uint8(donation.status) == 0 ? "PENDING" : 
                                   (uint8(donation.status) == 1 ? "VERIFIED" : "REJECTED");
        
        return (true, statusStr);
    }
    
    /**
     * @dev Get total donations recorded
     * @return total Count of donations
     */
    function getTotalDonations() external view returns (uint256 total) {
        return totalDonations;
    }
    
    /**
     * @dev Get donation hash by index
     * @param index Position in array
     * @return hash Donation hash at index
     */
    function getDonationHashByIndex(uint256 index)
        external
        view
        returns (bytes32 hash)
    {
        require(index < donationHashes.length, "Index out of bounds");
        return donationHashes[index];
    }
    
    /**
     * @dev Get all donation hashes (use with caution for large datasets)
     * @return hashes Array of all donation hashes
     */
    function getAllDonationHashes()
        external
        view
        returns (bytes32[] memory hashes)
    {
        return donationHashes;
    }
    
    /**
     * @dev Change admin address
     * @param newAdmin New admin wallet address
     */
    function setAdmin(address newAdmin)
        external
        onlyAdmin
    {
        require(newAdmin != address(0), "Invalid admin address");
        require(newAdmin != admin, "New admin same as current");
        
        address oldAdmin = admin;
        admin = newAdmin;
        
        emit AdminChanged(oldAdmin, newAdmin);
    }
    
    /**
     * @dev Get contract version
     * @return version Version string
     */
    function getVersion() external pure returns (string memory version) {
        return "2.0.0-mumbai";
    }
    
    /**
     * @dev Get contract chain info
     * @return network Network name
     * @return chainId Chain ID
     */
    function getNetworkInfo()
        external
        view
        returns (string memory network, uint256 chainId)
    {
        return ("Polygon Mumbai Testnet", block.chainid);
    }
}
