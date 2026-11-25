// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title GateRecord
/// @notice Write-once commitments to an ERCOT operating day's plan, accepted only
/// before that day's day-ahead market gate (10:00 Central on the prior day).
/// Outcomes are linked to the same record later, one hash per settlement stage.
contract GateRecord {
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

    uint8 public constant STAGE_DA_SETTLED = 1;
    uint8 public constant STAGE_RT_PROVISIONAL = 2;
    uint8 public constant STAGE_RT_SETTLED = 3;

    mapping(bytes32 key => Record) private _records;
    mapping(bytes32 key => mapping(uint8 stage => Outcome)) private _outcomes;
    mapping(address committer => bytes32[]) private _keysOf;

    event Committed(
        bytes32 indexed key,
        address indexed committer,
        bytes32 indexed scope,
        uint32 od,
        bytes32 root,
        uint32 leafCount,
        bytes32 codeHash
    );
    event OutcomeLinked(bytes32 indexed key, uint8 indexed stage, bytes32 outcomeHash);

    error InvalidDay(uint32 od);
    error EmptyRecord();
    error AlreadyCommitted(bytes32 key);
    error AfterGate(uint32 od, uint256 gate);
    error UnknownRecord(bytes32 key);
    error NotCommitter(bytes32 key, address caller);
    error InvalidStage(uint8 stage);
    error EmptyOutcome();
    error StageAlreadyLinked(bytes32 key, uint8 stage);
    error StageNotOpen(uint8 stage, uint256 opensAt);

    function commit(bytes32 scope, uint32 od, bytes32 root, uint32 leafCount, bytes32 codeHash)
        external
        returns (bytes32 key)
    {
        if (root == bytes32(0) || leafCount == 0) revert EmptyRecord();
        uint256 gate = gateTs(od);
        // The gate is checked before the duplicate so a late call always reports AfterGate.
        if (block.timestamp >= gate) revert AfterGate(od, gate);

        key = keyOf(msg.sender, scope, od);
        if (_records[key].committer != address(0)) revert AlreadyCommitted(key);

        _records[key] = Record({
            root: root,
            codeHash: codeHash,
            scope: scope,
            committer: msg.sender,
            od: od,
            leafCount: leafCount,
            committedAt: uint64(block.timestamp),
            blockNumber: uint64(block.number)
        });
        _keysOf[msg.sender].push(key);

        emit Committed(key, msg.sender, scope, od, root, leafCount, codeHash);
    }

    /// @notice Stage 1 (day-ahead settled) opens at the gate; stages 2 and 3
    /// (real-time provisional and settled) open when the operating day ends.
    function linkOutcome(bytes32 key, uint8 stage, bytes32 outcomeHash) external {
        Record storage r = _records[key];
        if (r.committer == address(0)) revert UnknownRecord(key);
        if (r.committer != msg.sender) revert NotCommitter(key, msg.sender);
        if (stage < STAGE_DA_SETTLED || stage > STAGE_RT_SETTLED) revert InvalidStage(stage);
        if (outcomeHash == bytes32(0)) revert EmptyOutcome();

        uint256 opensAt = stage == STAGE_DA_SETTLED ? gateTs(r.od) : dayEndTs(r.od);
        if (block.timestamp < opensAt) revert StageNotOpen(stage, opensAt);

        Outcome storage o = _outcomes[key][stage];
        if (o.linkedAt != 0) revert StageAlreadyLinked(key, stage);
        o.hash = outcomeHash;
        o.linkedAt = uint64(block.timestamp);

        emit OutcomeLinked(key, stage, outcomeHash);
    }

    /// @notice Returns a zeroed record (committer == address(0)) when none exists.
    function get(bytes32 key) external view returns (Record memory) {
        return _records[key];
    }

    /// @notice Returns a zeroed outcome (linkedAt == 0) when the stage is not linked.
    function outcomeOf(bytes32 key, uint8 stage) external view returns (Outcome memory) {
        return _outcomes[key][stage];
    }

    function keyOf(address committer, bytes32 scope, uint32 od) public pure returns (bytes32) {
        return keccak256(abi.encode(committer, scope, od));
    }

    function countOf(address committer) external view returns (uint256) {
        return _keysOf[committer].length;
    }

    function keyAt(address committer, uint256 i) external view returns (bytes32) {
        return _keysOf[committer][i];
    }

    /// @notice Unix time of the day-ahead gate for operating day `od` (YYYYMMDD):
    /// 10:00 Central on the day before.
    function gateTs(uint32 od) public pure returns (uint256) {
        (uint256 day, uint256 y) = _civilDay(od);
        // When od is 1 January the gate falls on 31 December of y - 1, which is
        // CST under either year's DST window, so y serves for both days.
        return (day - 1) * 1 days + 10 hours + _utcOffsetHours(day - 1, y) * 1 hours;
    }

    /// @notice Unix time at which operating day `od` ends: 00:00 Central on the
    /// following day. US transitions happen at 02:00 local, so the offset in
    /// force at that midnight is the one in force on `od` after 02:00.
    function dayEndTs(uint32 od) public pure returns (uint256) {
        (uint256 day, uint256 y) = _civilDay(od);
        return (day + 1) * 1 days + _utcOffsetHours(day, y) * 1 hours;
    }

    /// Days since 1970-01-01 and the year, for a valid YYYYMMDD. Years before
    /// 2007 are refused: the DST rule below has applied only since then.
    function _civilDay(uint32 od) private pure returns (uint256 day, uint256 y) {
        y = od / 10000;
        uint256 m = (od / 100) % 100;
        uint256 d = od % 100;
        if (y < 2007 || m < 1 || m > 12 || d < 1 || d > _daysInMonth(y, m)) revert InvalidDay(od);
        day = _daysFromCivil(y, m, d);
    }

    // Hours behind UTC at 10:00 local on `day` in year `y`: CDT (5) from the
    // second Sunday in March to the first Sunday in November, CST (6) otherwise.
    // Transitions are at 02:00, so both Sundays carry their new offset by 10:00.
    function _utcOffsetHours(uint256 day, uint256 y) private pure returns (uint256) {
        uint256 dstStart = _firstSunday(_daysFromCivil(y, 3, 1)) + 7;
        uint256 dstEnd = _firstSunday(_daysFromCivil(y, 11, 1));
        return day >= dstStart && day < dstEnd ? 5 : 6;
    }

    function _firstSunday(uint256 day) private pure returns (uint256) {
        // 1970-01-01 was a Thursday, so (day + 4) % 7 is 0 on Sundays.
        return day + (7 - ((day + 4) % 7)) % 7;
    }

    // Howard Hinnant's days_from_civil, valid for years >= 1970 with unsigned arithmetic.
    function _daysFromCivil(uint256 y, uint256 m, uint256 d) private pure returns (uint256) {
        if (m <= 2) y -= 1;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 mp = m > 2 ? m - 3 : m + 9;
        uint256 doy = (153 * mp + 2) / 5 + d - 1;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    function _daysInMonth(uint256 y, uint256 m) private pure returns (uint256) {
        if (m == 2) return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28;
        return m == 4 || m == 6 || m == 9 || m == 11 ? 30 : 31;
    }
}
