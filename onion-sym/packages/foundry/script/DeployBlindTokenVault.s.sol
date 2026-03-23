// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/BlindTokenVault.sol";

contract DeployBlindTokenVault is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        BlindTokenVault vault = new BlindTokenVault();

        // Mint 5 demo blind tokens
        bytes32[] memory commitments = new bytes32[](5);
        for (uint256 i = 0; i < 5; i++) {
            bytes32 preimage = keccak256(abi.encodePacked("demo-token-", i));
            commitments[i] = keccak256(abi.encodePacked(preimage));
        }
        vault.mintBatch(commitments);

        console.log("BlindTokenVault deployed with 5 demo tokens");
    }
}
