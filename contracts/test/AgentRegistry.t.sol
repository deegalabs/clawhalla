// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

/// @notice Test suite for AgentRegistry
/// @dev Run with: forge test --match-contract AgentRegistryTest -vvv
contract AgentRegistryTest is Test {
    AgentRegistry public registry;

    address public owner = address(this);
    address public marketplace = address(0xCAFE);
    address public creator1 = address(0x1);
    address public creator2 = address(0x2);
    address public random = address(0x3);

    event TemplateRegistered(uint256 indexed id, address indexed creator, string metadataURI, uint256 price);
    event TemplateUpdated(uint256 indexed id, string metadataURI, uint256 price);
    event TemplateDeactivated(uint256 indexed id);
    event TemplateInstalled(uint256 indexed id, address indexed buyer);

    function setUp() public {
        registry = new AgentRegistry();
        registry.setMarketplace(marketplace);
    }

    // --- Core Registration Tests ---

    function test_RegisterTemplate() public {
        vm.startPrank(creator1);

        uint256 expectedId = 1;
        string memory metadataURI = "ipfs://QmTest";
        uint256 price = 1 ether;
        uint16 royalty = 500; // 5%

        vm.expectEmit(true, true, false, true);
        emit TemplateRegistered(expectedId, creator1, metadataURI, price);

        uint256 id = registry.registerTemplate(metadataURI, price, royalty);

        assertEq(id, expectedId, "Template ID should be 1");
        assertEq(registry.templateCount(), 1, "Template count should be 1");

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertEq(template.id, expectedId);
        assertEq(template.creator, creator1);
        assertEq(template.metadataURI, metadataURI);
        assertEq(template.price, price);
        assertEq(template.royaltyBps, royalty);
        assertTrue(template.active);
        assertEq(template.installs, 0);
        assertEq(template.createdAt, block.timestamp);

        vm.stopPrank();
    }

    function test_RegisterTemplate_EmptyURI_Reverts() public {
        vm.startPrank(creator1);

        vm.expectRevert("Empty metadata URI");
        registry.registerTemplate("", 1 ether, 500);

        vm.stopPrank();
    }

    function test_RegisterTemplate_HighRoyalty_Reverts() public {
        vm.startPrank(creator1);

        vm.expectRevert("Royalty > 10%");
        registry.registerTemplate("ipfs://QmTest", 1 ether, 1001); // 10.01%

        vm.stopPrank();
    }

    function test_RegisterTemplate_MultipleCreators() public {
        vm.prank(creator1);
        uint256 id1 = registry.registerTemplate("ipfs://QmTest1", 1 ether, 500);

        vm.prank(creator2);
        uint256 id2 = registry.registerTemplate("ipfs://QmTest2", 2 ether, 300);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.templateCount(), 2);

        uint256[] memory creator1Templates = registry.getTemplatesByCreator(creator1);
        uint256[] memory creator2Templates = registry.getTemplatesByCreator(creator2);

        assertEq(creator1Templates.length, 1);
        assertEq(creator2Templates.length, 1);
        assertEq(creator1Templates[0], id1);
        assertEq(creator2Templates[0], id2);
    }

    // --- Update Tests ---

    function test_UpdateTemplate() public {
        vm.startPrank(creator1);

        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        string memory newURI = "ipfs://QmUpdated";
        uint256 newPrice = 2 ether;

        vm.expectEmit(true, false, false, true);
        emit TemplateUpdated(id, newURI, newPrice);

        registry.updateTemplate(id, newURI, newPrice);

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertEq(template.metadataURI, newURI);
        assertEq(template.price, newPrice);
        // Royalty shouldn't change
        assertEq(template.royaltyBps, 500);

        vm.stopPrank();
    }

    function test_UpdateTemplate_NotCreator_Reverts() public {
        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.startPrank(random);
        vm.expectRevert("Not template creator");
        registry.updateTemplate(id, "ipfs://QmUpdated", 2 ether);
        vm.stopPrank();
    }

    function test_UpdateTemplate_Inactive_Reverts() public {
        vm.startPrank(creator1);

        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);
        registry.deactivateTemplate(id);

        vm.expectRevert("Template not active");
        registry.updateTemplate(id, "ipfs://QmUpdated", 2 ether);

        vm.stopPrank();
    }

    function test_UpdateTemplate_EmptyURI_Reverts() public {
        vm.startPrank(creator1);

        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.expectRevert("Empty metadata URI");
        registry.updateTemplate(id, "", 2 ether);

        vm.stopPrank();
    }

    // --- Deactivation Tests ---

    function test_DeactivateTemplate() public {
        vm.startPrank(creator1);

        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.expectEmit(true, false, false, false);
        emit TemplateDeactivated(id);

        registry.deactivateTemplate(id);

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertFalse(template.active, "Template should be inactive");

        vm.stopPrank();
    }

    function test_DeactivateTemplate_NotCreator_Reverts() public {
        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.startPrank(random);
        vm.expectRevert("Not template creator");
        registry.deactivateTemplate(id);
        vm.stopPrank();
    }

    // --- Installation Tracking ---

    function test_RecordInstall_OnlyMarketplace() public {
        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.prank(marketplace);
        vm.expectEmit(true, true, false, false);
        emit TemplateInstalled(id, tx.origin);
        registry.recordInstall(id);

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertEq(template.installs, 1);

        // Second install
        vm.prank(marketplace);
        registry.recordInstall(id);
        template = registry.getTemplate(id);
        assertEq(template.installs, 2);
    }

    function test_RecordInstall_NotMarketplace_Reverts() public {
        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.expectRevert("Not marketplace");
        registry.recordInstall(id);
    }

    function test_RecordInstall_InactiveTemplate_Reverts() public {
        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, 500);

        vm.prank(creator1);
        registry.deactivateTemplate(id);

        vm.prank(marketplace);
        vm.expectRevert("Template not active");
        registry.recordInstall(id);
    }

    // --- View Functions ---

    function test_GetTemplate_InvalidId_Reverts() public {
        vm.expectRevert("Invalid template ID");
        registry.getTemplate(999);

        vm.expectRevert("Invalid template ID");
        registry.getTemplate(0);
    }

    function test_GetTemplatesByCreator() public {
        vm.startPrank(creator1);
        uint256 id1 = registry.registerTemplate("ipfs://QmTest1", 1 ether, 500);
        uint256 id2 = registry.registerTemplate("ipfs://QmTest2", 2 ether, 300);
        uint256 id3 = registry.registerTemplate("ipfs://QmTest3", 3 ether, 700);
        vm.stopPrank();

        uint256[] memory templates = registry.getTemplatesByCreator(creator1);
        assertEq(templates.length, 3);
        assertEq(templates[0], id1);
        assertEq(templates[1], id2);
        assertEq(templates[2], id3);

        // Creator with no templates
        uint256[] memory emptyTemplates = registry.getTemplatesByCreator(random);
        assertEq(emptyTemplates.length, 0);
    }

    function test_TemplateCount() public {
        assertEq(registry.templateCount(), 0);

        vm.prank(creator1);
        registry.registerTemplate("ipfs://QmTest1", 1 ether, 500);
        assertEq(registry.templateCount(), 1);

        vm.prank(creator2);
        registry.registerTemplate("ipfs://QmTest2", 2 ether, 300);
        assertEq(registry.templateCount(), 2);
    }

    // --- Ownership & Marketplace Management ---

    function test_SetMarketplace_OnlyOwner() public {
        address newMarketplace = address(0xBEEF);
        registry.setMarketplace(newMarketplace);
        assertEq(registry.marketplace(), newMarketplace);
    }

    function test_SetMarketplace_NotOwner_Reverts() public {
        vm.prank(random);
        vm.expectRevert("Not owner");
        registry.setMarketplace(address(0xBEEF));
    }

    // --- Fuzz Tests ---

    function testFuzz_RegisterTemplate_Price(uint256 price) public {
        vm.assume(price <= type(uint256).max);

        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", price, 500);

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertEq(template.price, price);
    }

    function testFuzz_RegisterTemplate_Royalty(uint16 royalty) public {
        vm.assume(royalty <= 1000); // Valid range

        vm.prank(creator1);
        uint256 id = registry.registerTemplate("ipfs://QmTest", 1 ether, royalty);

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(id);
        assertEq(template.royaltyBps, royalty);
    }

    function testFuzz_RegisterTemplate_Royalty_Invalid(uint16 royalty) public {
        vm.assume(royalty > 1000); // Invalid range

        vm.prank(creator1);
        vm.expectRevert("Royalty > 10%");
        registry.registerTemplate("ipfs://QmTest", 1 ether, royalty);
    }
}
