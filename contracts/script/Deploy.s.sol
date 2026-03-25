// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deploy script for ClawHalla contracts on Base L2
/// @dev Run with: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract DeployScript {
    function run() external {
        // Step 1: Deploy AgentRegistry
        // AgentRegistry registry = new AgentRegistry();

        // Step 2: Deploy LicenseNFT
        // LicenseNFT licenseNFT = new LicenseNFT();

        // Step 3: Deploy Marketplace with registry + licenseNFT addresses
        // Marketplace marketplace = new Marketplace(address(registry), address(licenseNFT));

        // Step 4: Configure permissions
        // registry.setMarketplace(address(marketplace));
        // licenseNFT.setMarketplace(address(marketplace));

        // Log addresses for verification
        // console.log("AgentRegistry:", address(registry));
        // console.log("LicenseNFT:", address(licenseNFT));
        // console.log("Marketplace:", address(marketplace));
    }
}
