//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeploySpendingPolicy } from "./DeploySpendingPolicy.s.sol";
import { DeployBlindTokenVault } from "./DeployBlindTokenVault.s.sol";
import { DeployAuditLog } from "./DeployAuditLog.s.sol";
import { DeployRelayRegistry } from "./DeployRelayRegistry.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeploySpendingPolicy deploySpendingPolicy = new DeploySpendingPolicy();
        deploySpendingPolicy.run();

        DeployBlindTokenVault deployBlindTokenVault = new DeployBlindTokenVault();
        deployBlindTokenVault.run();

        DeployAuditLog deployAuditLog = new DeployAuditLog();
        deployAuditLog.run();

        DeployRelayRegistry deployRelayRegistry = new DeployRelayRegistry();
        deployRelayRegistry.run();
    }
}
