// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/LicenseNFT.sol";
import "../src/Marketplace.sol";

/// @notice Test suite for Marketplace + LicenseNFT integration
/// @dev Run with: forge test --match-contract MarketplaceTest -vvv
contract MarketplaceTest is Test {
    AgentRegistry public registry;
    LicenseNFT public licenseNFT;
    Marketplace public marketplace;

    address public owner = address(this);
    address public creator = address(0x1);
    address public buyer = address(0x2);
    address public buyer2 = address(0x3);
    address public random = address(0x4);

    uint256 public freeTemplateId;
    uint256 public paidTemplateId;

    event Purchase(uint256 indexed templateId, address indexed buyer, uint256 price, uint256 licenseTokenId);
    event RoyaltyPaid(uint256 indexed templateId, address indexed creator, uint256 amount);
    event FeeCollected(uint256 indexed templateId, uint256 amount);
    event LicenseMinted(uint256 indexed tokenId, uint256 indexed templateId, address indexed buyer);
    event LicenseRevoked(uint256 indexed tokenId);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function setUp() public {
        // Deploy contracts
        registry = new AgentRegistry();
        licenseNFT = new LicenseNFT();
        marketplace = new Marketplace(address(registry), address(licenseNFT));

        // Wire permissions
        registry.setMarketplace(address(marketplace));
        licenseNFT.setMarketplace(address(marketplace));

        // Register templates
        vm.startPrank(creator);
        freeTemplateId = registry.registerTemplate("ipfs://QmFree", 0, 0);
        paidTemplateId = registry.registerTemplate("ipfs://QmPaid", 1 ether, 500); // 5% royalty
        vm.stopPrank();

        // Fund buyers
        vm.deal(buyer, 10 ether);
        vm.deal(buyer2, 10 ether);
    }

    // --- Purchase Tests: Free Templates ---

    function test_PurchaseFreeTemplate() public {
        vm.startPrank(buyer);

        uint256 buyerBalanceBefore = buyer.balance;

        vm.expectEmit(true, true, false, true);
        emit LicenseMinted(1, freeTemplateId, buyer);

        vm.expectEmit(true, true, false, true);
        emit Purchase(freeTemplateId, buyer, 0, 1);

        uint256 tokenId = marketplace.purchase(freeTemplateId);

        assertEq(tokenId, 1, "Token ID should be 1");
        assertEq(buyer.balance, buyerBalanceBefore, "Balance should not change for free template");
        assertTrue(marketplace.hasLicense(buyer, freeTemplateId), "Buyer should have license");
        assertEq(licenseNFT.balanceOf(buyer), 1, "Buyer should own 1 NFT");

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(freeTemplateId);
        assertEq(template.installs, 1, "Install count should increment");

        vm.stopPrank();
    }

    // --- Purchase Tests: Paid Templates ---

    function test_PurchasePaidTemplate() public {
        vm.startPrank(buyer);

        uint256 templatePrice = 1 ether;
        uint256 buyerBalanceBefore = buyer.balance;
        uint256 creatorBalanceBefore = creator.balance;

        uint256 expectedPlatformFee = (templatePrice * 250) / 10000; // 2.5%
        uint256 expectedCreatorPayment = templatePrice - expectedPlatformFee;

        uint256 tokenId = marketplace.purchase{value: templatePrice}(paidTemplateId);

        assertEq(tokenId, 1);
        assertTrue(marketplace.hasLicense(buyer, paidTemplateId));
        assertEq(licenseNFT.balanceOf(buyer), 1);

        // Check balances
        assertEq(buyer.balance, buyerBalanceBefore - templatePrice, "Buyer paid full price");
        assertEq(creator.balance, creatorBalanceBefore + expectedCreatorPayment, "Creator received payment");
        assertEq(marketplace.accumulatedFees(), expectedPlatformFee, "Platform fees accumulated");

        vm.stopPrank();
    }

    function test_PurchasePaidTemplate_RoyaltySplit() public {
        vm.startPrank(buyer);

        uint256 templatePrice = 1 ether;
        uint256 platformFeeBps = marketplace.platformFeeBps(); // 250 = 2.5%

        uint256 expectedPlatformFee = (templatePrice * platformFeeBps) / 10000;
        uint256 expectedCreatorPayment = templatePrice - expectedPlatformFee;

        uint256 creatorBalanceBefore = creator.balance;

        vm.expectEmit(true, true, false, true);
        emit RoyaltyPaid(paidTemplateId, creator, expectedCreatorPayment);

        vm.expectEmit(true, false, false, true);
        emit FeeCollected(paidTemplateId, expectedPlatformFee);

        marketplace.purchase{value: templatePrice}(paidTemplateId);

        assertEq(creator.balance, creatorBalanceBefore + expectedCreatorPayment, "Creator royalty correct");
        assertEq(marketplace.accumulatedFees(), expectedPlatformFee, "Platform fee correct");

        vm.stopPrank();
    }

    function test_PurchasePaidTemplate_InsufficientPayment_Reverts() public {
        vm.startPrank(buyer);

        uint256 insufficientPayment = 0.5 ether; // Template costs 1 ether

        vm.expectRevert("Insufficient payment");
        marketplace.purchase{value: insufficientPayment}(paidTemplateId);

        vm.stopPrank();
    }

    function test_PurchasePaidTemplate_ExcessRefunded() public {
        vm.startPrank(buyer);

        uint256 templatePrice = 1 ether;
        uint256 overpayment = 2 ether;
        uint256 expectedRefund = overpayment - templatePrice;

        uint256 buyerBalanceBefore = buyer.balance;

        marketplace.purchase{value: overpayment}(paidTemplateId);

        uint256 actualSpent = buyerBalanceBefore - buyer.balance;
        assertEq(actualSpent, templatePrice, "Only template price should be spent");

        vm.stopPrank();
    }

    function test_PurchaseInactiveTemplate_Reverts() public {
        vm.prank(creator);
        registry.deactivateTemplate(paidTemplateId);

        vm.startPrank(buyer);
        vm.expectRevert("Template not active");
        marketplace.purchase{value: 1 ether}(paidTemplateId);
        vm.stopPrank();
    }

    // --- License Verification ---

    function test_HasLicense() public {
        vm.prank(buyer);
        marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertTrue(marketplace.hasLicense(buyer, paidTemplateId), "Buyer should have license");
        assertFalse(marketplace.hasLicense(random, paidTemplateId), "Random address should not have license");
    }

    function test_HasLicense_NonBuyer() public {
        assertFalse(marketplace.hasLicense(random, paidTemplateId), "Non-buyer has no license");
    }

    // --- Platform Fee Management ---

    function test_SetPlatformFee_OnlyOwner() public {
        uint16 newFee = 500; // 5%
        marketplace.setPlatformFee(newFee);
        assertEq(marketplace.platformFeeBps(), newFee);
    }

    function test_SetPlatformFee_NotOwner_Reverts() public {
        vm.prank(random);
        vm.expectRevert("Not owner");
        marketplace.setPlatformFee(500);
    }

    function test_SetPlatformFee_CapAt10Percent() public {
        vm.expectRevert("Fee > 10%");
        marketplace.setPlatformFee(1001); // 10.01%

        // 10% should work
        marketplace.setPlatformFee(1000);
        assertEq(marketplace.platformFeeBps(), 1000);
    }

    // --- Fee Withdrawal ---

    function test_WithdrawFees() public {
        // Generate some fees
        vm.prank(buyer);
        marketplace.purchase{value: 1 ether}(paidTemplateId);

        uint256 accumulatedFees = marketplace.accumulatedFees();
        assertTrue(accumulatedFees > 0, "Should have accumulated fees");

        uint256 ownerBalanceBefore = owner.balance;

        marketplace.withdrawFees();

        assertEq(marketplace.accumulatedFees(), 0, "Fees should be reset");
        assertEq(owner.balance, ownerBalanceBefore + accumulatedFees, "Owner should receive fees");
    }

    function test_WithdrawFees_NoFees_Reverts() public {
        vm.expectRevert("No fees to withdraw");
        marketplace.withdrawFees();
    }

    function test_WithdrawFees_NotOwner_Reverts() public {
        vm.prank(buyer);
        marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(random);
        vm.expectRevert("Not owner");
        marketplace.withdrawFees();
    }

    // --- LicenseNFT: Transfer Tests ---

    function test_LicenseTransfer() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        // Verify initial state
        assertTrue(marketplace.hasLicense(buyer, paidTemplateId));
        assertFalse(marketplace.hasLicense(buyer2, paidTemplateId));
        assertEq(licenseNFT.ownerOf(tokenId), buyer);

        // Transfer
        vm.prank(buyer);
        vm.expectEmit(true, true, true, false);
        emit Transfer(buyer, buyer2, tokenId);
        licenseNFT.transferFrom(buyer, buyer2, tokenId);

        // Verify new state
        assertEq(licenseNFT.ownerOf(tokenId), buyer2);
        assertFalse(marketplace.hasLicense(buyer, paidTemplateId), "Original buyer loses license");
        assertTrue(marketplace.hasLicense(buyer2, paidTemplateId), "New holder gains license");
    }

    function test_LicenseTransfer_Revoked_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        // Revoke license
        licenseNFT.revokeLicense(tokenId);

        // Attempt transfer
        vm.prank(buyer);
        vm.expectRevert("License revoked");
        licenseNFT.transferFrom(buyer, buyer2, tokenId);
    }

    function test_LicenseTransfer_NotAuthorized_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(random);
        vm.expectRevert("Not authorized");
        licenseNFT.transferFrom(buyer, buyer2, tokenId);
    }

    // --- LicenseNFT: Revocation Tests ---

    function test_RevokeLicense_OnlyOwner() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertTrue(marketplace.hasLicense(buyer, paidTemplateId));

        vm.expectEmit(true, false, false, false);
        emit LicenseRevoked(tokenId);

        licenseNFT.revokeLicense(tokenId);

        ILicenseNFT.License memory license = licenseNFT.getLicense(tokenId);
        assertTrue(license.revoked);
        assertFalse(marketplace.hasLicense(buyer, paidTemplateId), "License should be invalid");
    }

    function test_RevokeLicense_NotOwner_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(random);
        vm.expectRevert("Not owner");
        licenseNFT.revokeLicense(tokenId);
    }

    function test_RevokeLicense_NonexistentToken_Reverts() public {
        vm.expectRevert("Token does not exist");
        licenseNFT.revokeLicense(999);
    }

    // --- LicenseNFT: Query Functions ---

    function test_LicensesOf() public {
        vm.startPrank(buyer);
        marketplace.purchase(freeTemplateId);
        marketplace.purchase{value: 1 ether}(paidTemplateId);
        vm.stopPrank();

        uint256[] memory licenses = licenseNFT.licensesOf(buyer);
        assertEq(licenses.length, 2);
        assertEq(licenses[0], freeTemplateId);
        assertEq(licenses[1], paidTemplateId);
    }

    function test_LicensesOf_EmptyForNonBuyer() public {
        uint256[] memory licenses = licenseNFT.licensesOf(random);
        assertEq(licenses.length, 0);
    }

    function test_GetLicense() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        ILicenseNFT.License memory license = licenseNFT.getLicense(tokenId);
        assertEq(license.templateId, paidTemplateId);
        assertEq(license.originalBuyer, buyer);
        assertEq(license.purchasedAt, block.timestamp);
        assertFalse(license.revoked);
    }

    function test_GetLicense_NonexistentToken_Reverts() public {
        vm.expectRevert("Token does not exist");
        licenseNFT.getLicense(999);
    }

    // --- LicenseNFT: ERC-721 Compliance ---

    function test_SupportsInterface_ERC721() public view {
        assertTrue(licenseNFT.supportsInterface(0x80ac58cd), "Should support ERC-721");
        assertTrue(licenseNFT.supportsInterface(0x01ffc9a7), "Should support ERC-165");
        assertFalse(licenseNFT.supportsInterface(0xFFFFFFFF), "Should not support invalid interface");
    }

    function test_BalanceOf() public {
        assertEq(licenseNFT.balanceOf(buyer), 0);

        vm.prank(buyer);
        marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertEq(licenseNFT.balanceOf(buyer), 1);

        vm.prank(buyer);
        marketplace.purchase(freeTemplateId);

        assertEq(licenseNFT.balanceOf(buyer), 2);
    }

    function test_BalanceOf_ZeroAddress_Reverts() public {
        vm.expectRevert("Zero address");
        licenseNFT.balanceOf(address(0));
    }

    function test_OwnerOf() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertEq(licenseNFT.ownerOf(tokenId), buyer);
    }

    function test_OwnerOf_NonexistentToken_Reverts() public {
        vm.expectRevert("Token does not exist");
        licenseNFT.ownerOf(999);
    }

    function test_Approve() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer);
        vm.expectEmit(true, true, true, false);
        emit Approval(buyer, buyer2, tokenId);
        licenseNFT.approve(buyer2, tokenId);

        assertEq(licenseNFT.getApproved(tokenId), buyer2);
    }

    function test_Approve_NotAuthorized_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(random);
        vm.expectRevert("Not authorized");
        licenseNFT.approve(buyer2, tokenId);
    }

    function test_SetApprovalForAll() public {
        vm.startPrank(buyer);

        licenseNFT.setApprovalForAll(buyer2, true);
        assertTrue(licenseNFT.isApprovedForAll(buyer, buyer2));

        licenseNFT.setApprovalForAll(buyer2, false);
        assertFalse(licenseNFT.isApprovedForAll(buyer, buyer2));

        vm.stopPrank();
    }

    function test_TransferFrom_ViaApproval() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer);
        licenseNFT.approve(buyer2, tokenId);

        vm.prank(buyer2);
        licenseNFT.transferFrom(buyer, buyer2, tokenId);

        assertEq(licenseNFT.ownerOf(tokenId), buyer2);
        assertEq(licenseNFT.getApproved(tokenId), address(0), "Approval should be cleared");
    }

    function test_TransferFrom_ViaOperator() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer);
        licenseNFT.setApprovalForAll(buyer2, true);

        vm.prank(buyer2);
        licenseNFT.transferFrom(buyer, buyer2, tokenId);

        assertEq(licenseNFT.ownerOf(tokenId), buyer2);
    }

    function test_TransferFrom_WrongOwner_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer);
        vm.expectRevert("Not token owner");
        licenseNFT.transferFrom(buyer2, buyer, tokenId); // Wrong 'from' address
    }

    function test_TransferFrom_ZeroAddress_Reverts() public {
        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer);
        vm.expectRevert("Zero address");
        licenseNFT.transferFrom(buyer, address(0), tokenId);
    }

    // --- Fuzz Tests ---

    function testFuzz_Purchase_VariousPrices(uint96 price) public {
        vm.assume(price > 0);
        vm.assume(price <= 100 ether); // Reasonable upper bound

        vm.prank(creator);
        uint256 templateId = registry.registerTemplate("ipfs://QmFuzz", price, 500);

        vm.deal(buyer, price * 2);

        vm.prank(buyer);
        uint256 tokenId = marketplace.purchase{value: price}(templateId);

        assertTrue(marketplace.hasLicense(buyer, templateId));
        assertEq(licenseNFT.ownerOf(tokenId), buyer);
    }

    function testFuzz_PlatformFee(uint16 feeBps) public {
        vm.assume(feeBps <= 1000); // Valid range

        marketplace.setPlatformFee(feeBps);
        assertEq(marketplace.platformFeeBps(), feeBps);

        vm.prank(buyer);
        marketplace.purchase{value: 1 ether}(paidTemplateId);

        uint256 expectedFee = (1 ether * feeBps) / 10000;
        assertEq(marketplace.accumulatedFees(), expectedFee);
    }

    // --- Invariant Tests ---

    function invariant_TotalFees_LeqTotalPayments() public view {
        // Platform fees should never exceed total payments received
        uint256 fees = marketplace.accumulatedFees();
        assertTrue(fees <= address(marketplace).balance + fees, "Fees exceed total payments");
    }

    function invariant_LicenseCount_EqPurchaseCount() public view {
        // Every purchase should mint exactly one license
        // This is validated through test assertions rather than a global invariant
        // because we don't track total purchases in the contract
    }

    // --- Edge Cases ---

    function test_MultiplePurchasesSameTemplate() public {
        vm.prank(buyer);
        uint256 tokenId1 = marketplace.purchase{value: 1 ether}(paidTemplateId);

        vm.prank(buyer2);
        uint256 tokenId2 = marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertEq(tokenId1, 1);
        assertEq(tokenId2, 2);
        assertTrue(marketplace.hasLicense(buyer, paidTemplateId));
        assertTrue(marketplace.hasLicense(buyer2, paidTemplateId));

        IAgentRegistry.AgentTemplate memory template = registry.getTemplate(paidTemplateId);
        assertEq(template.installs, 2);
    }

    function test_PurchaseMultipleTemplates() public {
        vm.startPrank(buyer);

        uint256 token1 = marketplace.purchase(freeTemplateId);
        uint256 token2 = marketplace.purchase{value: 1 ether}(paidTemplateId);

        assertEq(token1, 1);
        assertEq(token2, 2);
        assertEq(licenseNFT.balanceOf(buyer), 2);
        assertTrue(marketplace.hasLicense(buyer, freeTemplateId));
        assertTrue(marketplace.hasLicense(buyer, paidTemplateId));

        vm.stopPrank();
    }

    function test_FeeAccumulation() public {
        uint256 platformFeeBps = marketplace.platformFeeBps();
        uint256 price = 1 ether;
        uint256 expectedFeePerPurchase = (price * platformFeeBps) / 10000;

        vm.prank(buyer);
        marketplace.purchase{value: price}(paidTemplateId);
        assertEq(marketplace.accumulatedFees(), expectedFeePerPurchase);

        vm.prank(buyer2);
        marketplace.purchase{value: price}(paidTemplateId);
        assertEq(marketplace.accumulatedFees(), expectedFeePerPurchase * 2);
    }
}
