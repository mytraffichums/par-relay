// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditLog {
    struct LogEntry {
        bytes32 payloadHash;
        bytes32 circuitId;
        uint256 timestamp;
        address relay;
    }

    LogEntry[] public entries;

    event EntryLogged(bytes32 indexed circuitId, bytes32 payloadHash, address relay);

    function log(bytes32 payloadHash, bytes32 circuitId) external {
        entries.push(LogEntry({
            payloadHash: payloadHash,
            circuitId: circuitId,
            timestamp: block.timestamp,
            relay: msg.sender
        }));
        emit EntryLogged(circuitId, payloadHash, msg.sender);
    }

    function entryCount() external view returns (uint256) {
        return entries.length;
    }

    function getEntries(uint256 offset, uint256 limit) external view returns (LogEntry[] memory) {
        uint256 end = offset + limit;
        if (end > entries.length) end = entries.length;
        uint256 count = end > offset ? end - offset : 0;
        LogEntry[] memory result = new LogEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = entries[offset + i];
        }
        return result;
    }
}
