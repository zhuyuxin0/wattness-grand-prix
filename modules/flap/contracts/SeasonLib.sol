// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// The GateRecord views a season reads. GateRecord itself refuses a record at
/// or after the gate, so a stored record was sealed before it; the reader checks
/// again rather than rely on that.
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
    function gateTs(uint32 od) external pure returns (uint256);
}

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

library GateRecordReader {
    uint8 internal constant MAX_STAGE = 3;

    /// keccak256(abi.encode(committer, scope, od)), as GateRecord.keyOf computes it.
    function keyOf(address committer, bytes32 scope, uint32 od) internal pure returns (bytes32) {
        return keccak256(abi.encode(committer, scope, od));
    }

    /// True when `committer` sealed operating day `od` under `scope` before the
    /// day's gate and, for a non-zero `stage`, has linked that outcome stage.
    function sealedBeforeGate(address gateRecord, address committer, bytes32 scope, uint32 od, uint8 stage)
        internal
        view
        returns (bool)
    {
        if (committer == address(0)) return false;
        IGateRecord gr = IGateRecord(gateRecord);
        bytes32 key = keyOf(committer, scope, od);
        IGateRecord.Record memory r = gr.get(key);
        if (r.committer != committer || r.scope != scope || r.od != od || r.leafCount == 0) return false;
        if (uint256(r.committedAt) >= gr.gateTs(od)) return false;
        if (stage != 0 && gr.outcomeOf(key, stage).linkedAt == 0) return false;
        return true;
    }

    /// The season days on which `agent` sealed a plan before the gate.
    function verifiedDays(address gateRecord, address agent, bytes32 scope, uint32[] storage ods)
        internal
        view
        returns (uint256 verified)
    {
        uint256 n = ods.length;
        for (uint256 i; i < n; ++i) {
            if (sealedBeforeGate(gateRecord, agent, scope, ods[i], 0)) ++verified;
        }
    }
}

/// Transfers that accept tokens returning nothing and refuse calls to code-less addresses.
library SafeTransfer {
    error TransferFailed(address token);

    function _call(address token, bytes memory data) private {
        if (token.code.length == 0) revert TransferFailed(token);
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed(token);
    }

    function send(address token, address to, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20Min.transfer, (to, amount)));
    }

    function pull(address token, address from, address to, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20Min.transferFrom, (from, to, amount)));
    }

    function approve(address token, address spender, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20Min.approve, (spender, amount)));
    }
}

library Text {
    bytes16 private constant HEX = "0123456789abcdef";

    function decimal(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) ++digits;
        bytes memory out = new bytes(digits);
        for (; value != 0; value /= 10) out[--digits] = bytes1(uint8(48 + (value % 10)));
        return string(out);
    }

    function hexAddress(address account) internal pure returns (string memory) {
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(account);
        for (uint256 i = 41; i > 1; --i) {
            out[i] = HEX[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }

    /// Printable ASCII without the two characters JSON would need to escape.
    function isPlain(string memory s, uint256 maxLength) internal pure returns (bool) {
        bytes memory b = bytes(s);
        if (b.length > maxLength) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c < 0x20 || c > 0x7e || c == '"' || c == "\\") return false;
        }
        return true;
    }
}
