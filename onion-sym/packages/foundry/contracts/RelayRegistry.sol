// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

contract RelayRegistry {
    struct Relay {
        address operator;
        string url;
        bytes32 pubkey;
        uint256 pricePerHop; // USDC base units (6 decimals)
        bool active;
    }

    Relay[] public relays;
    mapping(address => uint256) public relayIndex; // operator => index+1 (0 means not registered)

    event RelayRegistered(address indexed operator, string url, bytes32 pubkey, uint256 pricePerHop);
    event RelayUpdated(address indexed operator, string url, bytes32 pubkey, uint256 pricePerHop);
    event RelayDeactivated(address indexed operator);

    function register(string calldata url, bytes32 pubkey, uint256 pricePerHop) external {
        require(relayIndex[msg.sender] == 0, "already registered");
        relays.push(Relay({
            operator: msg.sender,
            url: url,
            pubkey: pubkey,
            pricePerHop: pricePerHop,
            active: true
        }));
        relayIndex[msg.sender] = relays.length; // 1-indexed
        emit RelayRegistered(msg.sender, url, pubkey, pricePerHop);
    }

    /// @notice Allows the deployer to register a relay on behalf of an operator
    function registerFor(address operator, string calldata url, bytes32 pubkey, uint256 pricePerHop) external {
        require(relayIndex[operator] == 0, "already registered");
        relays.push(Relay({
            operator: operator,
            url: url,
            pubkey: pubkey,
            pricePerHop: pricePerHop,
            active: true
        }));
        relayIndex[operator] = relays.length;
        emit RelayRegistered(operator, url, pubkey, pricePerHop);
    }

    function update(string calldata url, bytes32 pubkey, uint256 pricePerHop) external {
        uint256 idx = relayIndex[msg.sender];
        require(idx != 0, "not registered");
        Relay storage r = relays[idx - 1];
        r.url = url;
        r.pubkey = pubkey;
        r.pricePerHop = pricePerHop;
        emit RelayUpdated(msg.sender, url, pubkey, pricePerHop);
    }

    function deactivate() external {
        uint256 idx = relayIndex[msg.sender];
        require(idx != 0, "not registered");
        relays[idx - 1].active = false;
        emit RelayDeactivated(msg.sender);
    }

    function relayCount() external view returns (uint256) {
        return relays.length;
    }

    function getActiveRelays() external view returns (Relay[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < relays.length; i++) {
            if (relays[i].active) count++;
        }
        Relay[] memory result = new Relay[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < relays.length; i++) {
            if (relays[i].active) {
                result[j] = relays[i];
                j++;
            }
        }
        return result;
    }

    function getRelay(uint256 index) external view returns (Relay memory) {
        return relays[index];
    }
}
