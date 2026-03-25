// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry — ClawHalla Agent Template Registry
/// @notice On-chain registry of agent templates with creator attribution
/// @dev Deployed on Base L2 for low gas costs
contract AgentRegistry is IAgentRegistry {
    uint256 private _nextId = 1;
    mapping(uint256 => AgentTemplate) private _templates;
    mapping(address => uint256[]) private _creatorTemplates;

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

    modifier onlyTemplateCreator(uint256 id) {
        require(_templates[id].creator == msg.sender, "Not template creator");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
    }

    function registerTemplate(
        string calldata metadataURI,
        uint256 price,
        uint16 royaltyBps
    ) external returns (uint256 id) {
        require(bytes(metadataURI).length > 0, "Empty metadata URI");
        require(royaltyBps <= 1000, "Royalty > 10%"); // Cap at 10%

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

    function recordInstall(uint256 id) external onlyMarketplace {
        require(_templates[id].active, "Template not active");
        _templates[id].installs++;
        emit TemplateInstalled(id, tx.origin);
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
}
