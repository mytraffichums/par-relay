// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "forge-std/console.sol";

contract BlindTokenVault {
    address public immutable owner;

    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => bool) public redeemed;
    uint256 public totalMinted;
    uint256 public totalRedeemed;

    event TokenMinted(bytes32 indexed commitment);
    event TokenRedeemed(bytes32 indexed commitment, address indexed redeemer);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mintCommitment(bytes32 commitment) external onlyOwner {
        require(!commitments[commitment], "already minted");
        commitments[commitment] = true;
        totalMinted++;
        emit TokenMinted(commitment);
    }

    function mintBatch(bytes32[] calldata _commitments) external onlyOwner {
        for (uint256 i = 0; i < _commitments.length; i++) {
            require(!commitments[_commitments[i]], "already minted");
            commitments[_commitments[i]] = true;
            totalMinted++;
            emit TokenMinted(_commitments[i]);
        }
    }

    function redeem(bytes32 preimage) external {
        bytes32 commitment = keccak256(abi.encodePacked(preimage));
        require(commitments[commitment], "unknown commitment");
        require(!redeemed[commitment], "already redeemed");
        redeemed[commitment] = true;
        totalRedeemed++;
        console.log("BlindTokenVault: token redeemed by");
        console.logAddress(msg.sender);
        emit TokenRedeemed(commitment, msg.sender);
    }

    function isValid(bytes32 commitment) external view returns (bool) {
        return commitments[commitment] && !redeemed[commitment];
    }

    function activeTokens() external view returns (uint256) {
        return totalMinted - totalRedeemed;
    }
}
