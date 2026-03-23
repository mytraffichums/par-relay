// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/RelayRegistry.sol";

contract DeployRelayRegistry is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        RelayRegistry registry = new RelayRegistry();
        console.log("RelayRegistry deployed");

        // Pre-register demo relays (operator = deployer for hackathon)
        // Relay A (exit node) - pubkey will be updated by relay on startup
        registry.registerFor(
            deployer,
            "http://localhost:8001",
            bytes32(0),
            10000 // 0.01 USDC per hop
        );

        // Use a second address for relay B to avoid "already registered"
        // For hackathon, relay B uses a deterministic address
        address relayBOperator = address(uint160(uint256(keccak256("relay_b"))));
        registry.registerFor(
            relayBOperator,
            "http://localhost:8002",
            bytes32(0),
            10000 // 0.01 USDC per hop
        );

        console.log("Registered 2 demo relays at 0.01 USDC/hop");
    }
}
