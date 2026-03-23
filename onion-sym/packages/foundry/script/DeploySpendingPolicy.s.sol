// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/SpendingPolicy.sol";

contract DeploySpendingPolicy is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // Deploy with deployer as both owner and initial agent
        // maxPerTx = 1 ETH, maxPerDay = 10 ETH
        SpendingPolicy policy = new SpendingPolicy(deployer, 1 ether, 10 ether);

        // Enable demo services
        policy.toggleService("weather", true);
        policy.toggleService("flights", true);
        policy.toggleService("booking", true);

        console.log("SpendingPolicy deployed, services enabled: weather, flights, booking");
    }
}
