// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILicenseNFT — ClawHalla License NFT Interface
/// @notice ERC-721 license tokens representing access to agent templates
interface ILicenseNFT {
    struct License {
        uint256 templateId;
        address originalBuyer;
        uint256 purchasedAt;
        bool revoked;
    }

    event LicenseMinted(uint256 indexed tokenId, uint256 indexed templateId, address indexed buyer);
    event LicenseRevoked(uint256 indexed tokenId);

    /// @notice Mint a license NFT (called by Marketplace only)
    function mint(address to, uint256 templateId) external returns (uint256 tokenId);

    /// @notice Get license details for a token
    function getLicense(uint256 tokenId) external view returns (License memory);

    /// @notice Check if a user holds a valid (non-revoked) license for a template
    function holdsValidLicense(address user, uint256 templateId) external view returns (bool);

    /// @notice Revoke a license (admin only, for policy violations)
    function revokeLicense(uint256 tokenId) external;

    /// @notice Get all template IDs licensed to a user
    function licensesOf(address user) external view returns (uint256[] memory templateIds);
}
