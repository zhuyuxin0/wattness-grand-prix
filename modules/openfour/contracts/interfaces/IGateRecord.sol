// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev The reads this module makes of Wattness's GateRecord (contracts/GateRecord.sol).
interface IGateRecord {
    struct Record {
        bytes32 root;
        bytes32 codeHash;
        bytes32 scope;
        address committer;
        uint32 od;
        uint32 leafCount;
        uint64 committedAt;
        uint64 blockNumber;
    }

    struct Outcome {
        bytes32 hash;
        uint64 linkedAt;
    }

    function get(bytes32 key) external view returns (Record memory);
    function outcomeOf(bytes32 key, uint8 stage) external view returns (Outcome memory);
    function keyOf(address committer, bytes32 scope, uint32 od) external pure returns (bytes32);
    function gateTs(uint32 od) external pure returns (uint256);
}
