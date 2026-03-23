// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/AuditLog.sol";

contract DeployAuditLog is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        new AuditLog();
        console.log("AuditLog deployed");
    }
}
