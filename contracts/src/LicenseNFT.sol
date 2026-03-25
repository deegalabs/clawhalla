// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ILicenseNFT.sol";

/// @title LicenseNFT — ClawHalla License Token
/// @notice ERC-721 compatible license NFTs for agent template access
/// @dev Minimal ERC-721 implementation (no OpenZeppelin dep for audit clarity)
contract LicenseNFT is ILicenseNFT {
    string public constant name = "ClawHalla License";
    string public constant symbol = "CLAW-LIC";

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => License) private _licenses;
    // user => templateId => bool (quick license check)
    mapping(address => mapping(uint256 => bool)) private _hasLicense;
    // user => list of template IDs
    mapping(address => uint256[]) private _userLicenses;

    address public marketplace;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMarketplace() {
        require(msg.sender == marketplace, "Not marketplace");
        _;
    }

    // ERC-721 events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor() {
        owner = msg.sender;
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
    }

    // --- License functions ---

    function mint(address to, uint256 templateId) external onlyMarketplace returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        _owners[tokenId] = to;
        _balances[to]++;

        _licenses[tokenId] = License({
            templateId: templateId,
            originalBuyer: to,
            purchasedAt: block.timestamp,
            revoked: false
        });

        _hasLicense[to][templateId] = true;
        _userLicenses[to].push(templateId);

        emit Transfer(address(0), to, tokenId);
        emit LicenseMinted(tokenId, templateId, to);
    }

    function getLicense(uint256 tokenId) external view returns (License memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _licenses[tokenId];
    }

    function holdsValidLicense(address user, uint256 templateId) external view returns (bool) {
        return _hasLicense[user][templateId];
    }

    function revokeLicense(uint256 tokenId) external onlyOwner {
        require(_owners[tokenId] != address(0), "Token does not exist");
        _licenses[tokenId].revoked = true;

        address holder = _owners[tokenId];
        uint256 templateId = _licenses[tokenId].templateId;
        _hasLicense[holder][templateId] = false;

        emit LicenseRevoked(tokenId);
    }

    function licensesOf(address user) external view returns (uint256[] memory) {
        return _userLicenses[user];
    }

    // --- ERC-721 core ---

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "Zero address");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        require(tokenOwner != address(0), "Token does not exist");
        return tokenOwner;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not authorized");
        require(from == _owners[tokenId], "Not token owner");
        require(to != address(0), "Zero address");
        require(!_licenses[tokenId].revoked, "License revoked");

        // Update license tracking
        uint256 templateId = _licenses[tokenId].templateId;
        _hasLicense[from][templateId] = false;
        _hasLicense[to][templateId] = true;
        _userLicenses[to].push(templateId);

        _approvals[tokenId] = address(0);
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = _owners[tokenId];
        require(msg.sender == tokenOwner || _operatorApprovals[tokenOwner][msg.sender], "Not authorized");
        _approvals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _approvals[tokenId];
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = _owners[tokenId];
        return (spender == tokenOwner || _approvals[tokenId] == spender || _operatorApprovals[tokenOwner][spender]);
    }

    // --- ERC-165 ---

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x01ffc9a7; // ERC-165
    }
}
