// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test suite for AgentRegistry
/// @dev Run with: forge test --match-contract AgentRegistryTest -vvv
contract AgentRegistryTest {
    // Tests to implement:
    //
    // function test_RegisterTemplate() — register a template, verify fields
    // function test_RegisterTemplate_EmptyURI_Reverts() — empty metadata URI
    // function test_RegisterTemplate_HighRoyalty_Reverts() — royalty > 10%
    // function test_UpdateTemplate() — creator updates metadata and price
    // function test_UpdateTemplate_NotCreator_Reverts() — non-creator can't update
    // function test_DeactivateTemplate() — creator deactivates
    // function test_DeactivateTemplate_NotCreator_Reverts()
    // function test_RecordInstall_OnlyMarketplace() — only marketplace can call
    // function test_GetTemplate_InvalidId_Reverts()
    // function test_GetTemplatesByCreator() — returns correct template IDs
    // function test_TemplateCount() — increments correctly
    //
    // Fuzz tests:
    // function testFuzz_RegisterTemplate_Price(uint256 price) — any price works
    // function testFuzz_RegisterTemplate_Royalty(uint16 royalty) — capped at 1000
}
