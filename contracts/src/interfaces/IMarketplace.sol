// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMarketplace — ClawHalla Agent Marketplace Interface
/// @notice Handles purchases, royalty distribution, and license minting
interface IMarketplace {
    event Purchase(uint256 indexed templateId, address indexed buyer, uint256 price, uint256 licenseTokenId);
    event RoyaltyPaid(uint256 indexed templateId, address indexed creator, uint256 amount);
    event FeeCollected(uint256 indexed templateId, uint256 amount);

    /// @notice Purchase an agent template — mints a LicenseNFT to buyer
    /// @param templateId The template to purchase
    function purchase(uint256 templateId) external payable returns (uint256 licenseTokenId);

    /// @notice Check if an address has a valid license for a template
    function hasLicense(address user, uint256 templateId) external view returns (bool);

    /// @notice Platform fee in basis points (e.g., 250 = 2.5%)
    function platformFeeBps() external view returns (uint16);

    /// @notice Update platform fee (owner only)
    function setPlatformFee(uint16 feeBps) external;

    /// @notice Withdraw accumulated platform fees
    function withdrawFees() external;
}
