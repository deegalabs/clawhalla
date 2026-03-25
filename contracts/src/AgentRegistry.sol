// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry — ClawHalla Agent Template Registry
/// @notice On-chain registry of agent templates with creator attribution
/// @dev Deployed on Base L2 for low gas costs
contract AgentRegistry is IAgentRegistry {
    uint16 public constant MAX_ROYALTY_BPS = 1000; // 10%

    uint256 private _nextId = 1;
    mapping(uint256 => AgentTemplate) private _templates;
    mapping(address => uint256[]) private _creatorTemplates;

    address public marketplace;
    address public owner;
    address public pendingOwner;

    event MarketplaceUpdated(address indexed oldMarketplace, address indexed newMarketplace);
    event OwnershipTransferStarted(address indexed oldOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMarketplace() {
        require(msg.sender == marketplace, "Not marketplace");
        _;
    }

    modifier onlyTemplateCreator(uint256 id) {
        require(_templates[id].creator == msg.sender, "Not template creator");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set marketplace address [MEDIUM-004: zero check] [LOW-002: event]
    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "Zero address");
        emit MarketplaceUpdated(marketplace, _marketplace);
        marketplace = _marketplace;
    }

    function registerTemplate(
        string calldata metadataURI,
        uint256 price,
        uint16 royaltyBps
    ) external returns (uint256 id) {
        require(bytes(metadataURI).length > 0, "Empty metadata URI");
        require(royaltyBps <= MAX_ROYALTY_BPS, "Royalty > 10%");

        id = _nextId++;

        _templates[id] = AgentTemplate({
            id: id,
            creator: msg.sender,
            metadataURI: metadataURI,
            price: price,
            royaltyBps: royaltyBps,
            active: true,
            installs: 0,
            createdAt: block.timestamp
        });

        _creatorTemplates[msg.sender].push(id);

        emit TemplateRegistered(id, msg.sender, metadataURI, price);
    }

    /// @notice Update template metadata and price (royalty is immutable after creation)
    function updateTemplate(
        uint256 id,
        string calldata metadataURI,
        uint256 price
    ) external onlyTemplateCreator(id) {
        require(_templates[id].active, "Template not active");
        require(bytes(metadataURI).length > 0, "Empty metadata URI");

        _templates[id].metadataURI = metadataURI;
        _templates[id].price = price;

        emit TemplateUpdated(id, metadataURI, price);
    }

    function deactivateTemplate(uint256 id) external onlyTemplateCreator(id) {
        _templates[id].active = false;
        emit TemplateDeactivated(id);
    }

    /// @notice Record install [HIGH-002 FIX: buyer param instead of tx.origin]
    function recordInstall(uint256 id, address buyer) external onlyMarketplace {
        require(_templates[id].active, "Template not active");
        _templates[id].installs++;
        emit TemplateInstalled(id, buyer);
    }

    function getTemplate(uint256 id) external view returns (AgentTemplate memory) {
        require(id > 0 && id < _nextId, "Invalid template ID");
        return _templates[id];
    }

    function getTemplatesByCreator(address creator) external view returns (uint256[] memory) {
        return _creatorTemplates[creator];
    }

    function templateCount() external view returns (uint256) {
        return _nextId - 1;
    }

    /// @notice Two-step ownership transfer [MEDIUM-003]
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
}
