// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMarketplace.sol";
import "./interfaces/IAgentRegistry.sol";
import "./interfaces/ILicenseNFT.sol";

/// @title Marketplace — ClawHalla Agent Marketplace
/// @notice Handles template purchases, royalty splits, and license minting
/// @dev Deployed on Base L2. Uses checks-effects-interactions pattern.
contract Marketplace is IMarketplace {
    IAgentRegistry public immutable registry;
    ILicenseNFT public immutable licenseNFT;

    address public owner;
    uint16 private _platformFeeBps = 250; // 2.5% default
    uint256 public accumulatedFees;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _registry, address _licenseNFT) {
        owner = msg.sender;
        registry = IAgentRegistry(_registry);
        licenseNFT = ILicenseNFT(_licenseNFT);
    }

    /// @notice Purchase a template — pays creator royalty, platform fee, mints license NFT
    function purchase(uint256 templateId) external payable returns (uint256 licenseTokenId) {
        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(templateId);

        require(template.active, "Template not active");
        require(msg.value >= template.price, "Insufficient payment");

        // Free templates — just mint license
        if (template.price == 0) {
            licenseTokenId = licenseNFT.mint(msg.sender, templateId);
            registry.recordInstall(templateId);
            emit Purchase(templateId, msg.sender, 0, licenseTokenId);
            return licenseTokenId;
        }

        // Calculate splits
        uint256 platformFee = (msg.value * _platformFeeBps) / 10000;
        uint256 creatorPayment = msg.value - platformFee;

        // Effects
        accumulatedFees += platformFee;

        // Interactions — mint license first (no value transfer)
        licenseTokenId = licenseNFT.mint(msg.sender, templateId);
        registry.recordInstall(templateId);

        // Transfer to creator
        (bool sent,) = payable(template.creator).call{value: creatorPayment}("");
        require(sent, "Creator payment failed");

        // Refund excess
        if (msg.value > template.price) {
            uint256 refund = msg.value - template.price;
            (bool refunded,) = payable(msg.sender).call{value: refund}("");
            require(refunded, "Refund failed");
        }

        emit Purchase(templateId, msg.sender, template.price, licenseTokenId);
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

    function setPlatformFee(uint16 feeBps) external onlyOwner {
        require(feeBps <= 1000, "Fee > 10%"); // Cap at 10%
        _platformFeeBps = feeBps;
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");

        accumulatedFees = 0;

        (bool sent,) = payable(owner).call{value: amount}("");
        require(sent, "Withdrawal failed");
    }
}
