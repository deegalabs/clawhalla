// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentRegistry — ClawHalla Agent Registry Interface
/// @notice Tracks registered agent templates and their creators on-chain
interface IAgentRegistry {
    struct AgentTemplate {
        uint256 id;
        address creator;
        string metadataURI;  // IPFS URI to template JSON (persona + AGENTS.md)
        uint256 price;       // Price in wei (0 = free)
        uint16 royaltyBps;   // Creator royalty in basis points (e.g., 500 = 5%)
        bool active;
        uint256 installs;    // Total install count
        uint256 createdAt;
    }

    event TemplateRegistered(uint256 indexed id, address indexed creator, string metadataURI, uint256 price);
    event TemplateUpdated(uint256 indexed id, string metadataURI, uint256 price);
    event TemplateDeactivated(uint256 indexed id);
    event TemplateInstalled(uint256 indexed id, address indexed buyer);

    /// @notice Register a new agent template
    function registerTemplate(string calldata metadataURI, uint256 price, uint16 royaltyBps) external returns (uint256 id);

    /// @notice Update template metadata and price
    function updateTemplate(uint256 id, string calldata metadataURI, uint256 price) external;

    /// @notice Deactivate a template (creator only)
    function deactivateTemplate(uint256 id) external;

    /// @notice Record an installation (called by Marketplace)
    function recordInstall(uint256 id) external;

    /// @notice Get template details
    function getTemplate(uint256 id) external view returns (AgentTemplate memory);

    /// @notice Get all templates by a creator
    function getTemplatesByCreator(address creator) external view returns (uint256[] memory);

    /// @notice Total number of templates
    function templateCount() external view returns (uint256);
}
