// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SpendingPolicy {
    address public owner;
    address public agent;

    uint256 public maxPerTx;
    uint256 public maxPerDay;
    uint256 public dailySpent;
    uint256 public lastResetDay;

    mapping(string => bool) public allowedServices;

    event SpendRecorded(address indexed agent, uint256 amount, string service);
    event PolicyUpdated(uint256 maxPerTx, uint256 maxPerDay);
    event ServiceToggled(string service, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "not agent");
        _;
    }

    constructor(address _agent, uint256 _maxPerTx, uint256 _maxPerDay) {
        owner = msg.sender;
        agent = _agent;
        maxPerTx = _maxPerTx;
        maxPerDay = _maxPerDay;
        lastResetDay = block.timestamp / 1 days;
    }

    function setPolicy(uint256 _maxPerTx, uint256 _maxPerDay) external onlyOwner {
        maxPerTx = _maxPerTx;
        maxPerDay = _maxPerDay;
        emit PolicyUpdated(_maxPerTx, _maxPerDay);
    }

    function toggleService(string calldata service, bool allowed) external onlyOwner {
        allowedServices[service] = allowed;
        emit ServiceToggled(service, allowed);
    }

    function recordSpend(uint256 amount, string calldata service) external onlyAgent {
        require(allowedServices[service], "service not allowed");
        require(amount <= maxPerTx, "exceeds per-tx limit");

        uint256 today = block.timestamp / 1 days;
        if (today > lastResetDay) {
            dailySpent = 0;
            lastResetDay = today;
        }

        require(dailySpent + amount <= maxPerDay, "exceeds daily limit");
        dailySpent += amount;

        emit SpendRecorded(agent, amount, service);
    }

    function remainingDailyBudget() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (today > lastResetDay) return maxPerDay;
        return maxPerDay > dailySpent ? maxPerDay - dailySpent : 0;
    }
}
