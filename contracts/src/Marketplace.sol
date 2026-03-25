// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMarketplace.sol";
import "./interfaces/IAgentRegistry.sol";
import "./interfaces/ILicenseNFT.sol";

/// @title Marketplace — ClawHalla Agent Marketplace
/// @notice Handles template purchases, royalty splits, and license minting
/// @dev Deployed on Base L2. Uses checks-effects-interactions pattern.
contract Marketplace is IMarketplace {
    uint16 public constant MAX_PLATFORM_FEE_BPS = 1000; // 10%
    uint16 public constant BPS_DENOMINATOR = 10000;

    IAgentRegistry public immutable registry;
    ILicenseNFT public immutable licenseNFT;

    address public owner;
    address public pendingOwner;
    uint16 private _platformFeeBps = 250; // 2.5% default
    uint256 public accumulatedFees;
    bool public paused;

    event PlatformFeeUpdated(uint16 oldFee, uint16 newFee);
    event OwnershipTransferStarted(address indexed oldOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(address _registry, address _licenseNFT) {
        require(_registry != address(0), "Zero registry address");
        require(_licenseNFT != address(0), "Zero licenseNFT address");
        owner = msg.sender;
        registry = IAgentRegistry(_registry);
        licenseNFT = ILicenseNFT(_licenseNFT);
    }

    /// @notice Purchase a template — pays creator royalty, platform fee, mints license NFT
    function purchase(uint256 templateId) external payable whenNotPaused returns (uint256 licenseTokenId) {
        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(templateId);

        require(template.active, "Template not active");
        require(msg.value >= template.price, "Insufficient payment");
        // [MEDIUM-001] Prevent duplicate purchases
        require(!licenseNFT.holdsValidLicense(msg.sender, templateId), "Already licensed");

        // Free templates — just mint license
        if (template.price == 0) {
            licenseTokenId = licenseNFT.mint(msg.sender, templateId);
            registry.recordInstall(templateId, msg.sender); // [HIGH-002] pass buyer address
            emit Purchase(templateId, msg.sender, 0, licenseTokenId);
            return licenseTokenId;
        }

        // [HIGH-001 FIX] Calculate splits based on template.price, NOT msg.value
        uint256 price = template.price;
        uint256 platformFee = (price * _platformFeeBps) / BPS_DENOMINATOR;
        uint256 creatorPayment = price - platformFee;

        // Effects
        accumulatedFees += platformFee;

        // Interactions — mint license first (no value transfer)
        licenseTokenId = licenseNFT.mint(msg.sender, templateId);
        registry.recordInstall(templateId, msg.sender); // [HIGH-002] pass buyer address

        // Transfer to creator
        (bool sent,) = payable(template.creator).call{value: creatorPayment}("");
        require(sent, "Creator payment failed");

        // Refund excess
        if (msg.value > price) {
            (bool refunded,) = payable(msg.sender).call{value: msg.value - price}("");
            require(refunded, "Refund failed");
        }

        emit Purchase(templateId, msg.sender, price, licenseTokenId);
        emit RoyaltyPaid(templateId, template.creator, creatorPayment);
        emit FeeCollected(templateId, platformFee);
    }

    /// @notice Check if user has a valid license
    function hasLicense(address user, uint256 templateId) external view returns (bool) {
        return licenseNFT.holdsValidLicense(user, templateId);
    }

    function platformFeeBps() external view returns (uint16) {
        return _platformFeeBps;
    }

    /// [LOW-001] Emit event on fee change
    function setPlatformFee(uint16 feeBps) external onlyOwner {
        require(feeBps <= MAX_PLATFORM_FEE_BPS, "Fee > 10%");
        emit PlatformFeeUpdated(_platformFeeBps, feeBps);
        _platformFeeBps = feeBps;
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");

        accumulatedFees = 0;

        (bool sent,) = payable(owner).call{value: amount}("");
        require(sent, "Withdrawal failed");
    }

    /// [MEDIUM-003] Two-step ownership transfer
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    /// [INFO-003] Pause mechanism
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
