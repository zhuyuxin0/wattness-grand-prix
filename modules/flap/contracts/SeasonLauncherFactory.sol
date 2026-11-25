// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FieldDescriptor, ILauncherFactory, LauncherDataSchema} from "./FlapPoolLaunch.sol";
import {IGateRecord, Text} from "./SeasonLib.sol";
import {SeasonConfig, SeasonLauncher} from "./SeasonLauncher.sol";
import {SeasonVaultFactory} from "./SeasonVaultFactory.sol";

/// Holds the Launcher's creation code, which would put the factory over the
/// contract size limit. Only its factory may use it.
contract SeasonLauncherDeployer {
    address public immutable factory;

    error NotFactory(address caller);

    constructor() {
        factory = msg.sender;
    }

    function deploy(
        address hub,
        address creator,
        address quoteToken,
        address gateRecord,
        address vaultFactory,
        SeasonConfig calldata c
    ) external payable returns (address) {
        if (msg.sender != factory) revert NotFactory(msg.sender);
        return address(new SeasonLauncher{value: msg.value}(factory, hub, creator, quoteToken, gateRecord, vaultFactory, c));
    }
}

/// The Launcher half of a Launcher and Vault pair. It deploys its own vault
/// factory, so each accepts only the other. Launchers are plain contracts and
/// cannot be upgraded, by the Guardian or anyone else.
contract SeasonLauncherFactory is ILauncherFactory {
    uint256 public constant MAX_SEASON_DAYS = 14;
    uint256 public constant MAX_WINDOW = 30 days;
    uint16 public constant MAX_EARNED_BPS = 5000;

    address public immutable hub;
    address public immutable quoteToken;
    address public immutable gateRecord;
    address public immutable vaultFactory;
    address public immutable deployer;

    event SeasonLauncherCreated(address indexed launcher, address indexed creator, bytes32 salt);

    error ZeroAddress();
    error NotHub(address caller);
    error InvalidData();
    error InvalidConfig(string field);
    error ImmutableLaunchers();

    constructor(address hub_, address quoteToken_, address gateRecord_) {
        if (hub_ == address(0) || quoteToken_ == address(0) || gateRecord_ == address(0)) revert ZeroAddress();
        hub = hub_;
        quoteToken = quoteToken_;
        gateRecord = gateRecord_;
        vaultFactory = address(new SeasonVaultFactory(hub_, quoteToken_));
        deployer = address(new SeasonLauncherDeployer());
    }

    function factorySpecVersion() external pure override returns (string memory) {
        return "lf-v1";
    }

    /// Called by the Portal for `Portal.newLauncher(this, abi.encode(SeasonConfig))`.
    function newLauncher(address creator, bytes calldata data) external payable override returns (address launcher) {
        if (msg.sender != hub) revert NotHub(msg.sender);
        SeasonConfig memory c = abi.decode(data, (SeasonConfig));
        // abi.decode ignores trailing bytes; accept only the canonical encoding.
        if (keccak256(abi.encode(c)) != keccak256(data)) revert InvalidData();
        _validate(c);
        launcher = SeasonLauncherDeployer(deployer).deploy{value: msg.value}(hub, creator, quoteToken, gateRecord, vaultFactory, c);
        emit SeasonLauncherCreated(launcher, creator, c.salt);
    }

    function upgradeVaultImplementation(address) external pure override {
        revert ImmutableLaunchers();
    }

    function _validate(SeasonConfig memory c) internal view {
        if (bytes(c.name).length == 0 || !Text.isPlain(c.name, 32)) revert InvalidConfig("name");
        if (bytes(c.symbol).length == 0 || !Text.isPlain(c.symbol, 10)) revert InvalidConfig("symbol");
        if (!Text.isPlain(c.meta, 128)) revert InvalidConfig("meta");
        if (c.salt == bytes32(0)) revert InvalidConfig("salt");
        if (c.minRaise == 0 || c.minRaise > c.raiseCap) revert InvalidConfig("minRaise");
        if (c.walletCap == 0 || c.walletCap > c.raiseCap) revert InvalidConfig("walletCap");
        if (c.deadline <= block.timestamp || c.deadline > block.timestamp + MAX_WINDOW) revert InvalidConfig("deadline");
        if (c.milestoneCommitter == address(0) || c.milestoneStage > 3) revert InvalidConfig("milestone");
        if (c.scope == bytes32(0)) revert InvalidConfig("scope");
        if (c.earnedBps > MAX_EARNED_BPS) revert InvalidConfig("earnedBps");
        if (c.taxRoute > 1) revert InvalidConfig("taxRoute");
        uint256 n = c.seasonDays.length;
        if (n == 0 || n > MAX_SEASON_DAYS) revert InvalidConfig("seasonDays");
        IGateRecord gr = IGateRecord(gateRecord);
        // gateTs reverts with InvalidDay for a date that does not exist.
        gr.gateTs(c.milestoneOd);
        for (uint256 i; i < n; ++i) {
            if (i != 0 && c.seasonDays[i] <= c.seasonDays[i - 1]) revert InvalidConfig("seasonDays");
            gr.gateTs(c.seasonDays[i]);
        }
    }

    function launcherDataSchema() external pure override returns (LauncherDataSchema memory schema) {
        schema.description =
            "Season launch: a capped contribution round in the quote token that launches only after a named plan was sealed in GateRecord before its gate, and refunds otherwise. Contributors claim their part of the reserve pro rata; the paired vault pays an earned pool by deposit times the backed agent's days sealed before the gate.";
        FieldDescriptor[] memory f = new FieldDescriptor[](16);
        f[0] = FieldDescriptor("name", "string", "Token name, printable ASCII", 0);
        f[1] = FieldDescriptor("symbol", "string", "Token symbol, printable ASCII", 0);
        f[2] = FieldDescriptor("meta", "string", "Metadata CID", 0);
        f[3] = FieldDescriptor("salt", "bytes32", "Launch salt; the token address ends in 7777", 0);
        f[4] = FieldDescriptor("minRaise", "uint256", "Quote the launch needs", 18);
        f[5] = FieldDescriptor("raiseCap", "uint256", "Cap on all contributions", 18);
        f[6] = FieldDescriptor("walletCap", "uint256", "Cap on one wallet's contributions", 18);
        f[7] = FieldDescriptor("deadline", "uint64", "Unix time the round closes (at most 30 days out)", 0);
        f[8] = FieldDescriptor("milestoneCommitter", "address", "GateRecord committer of the milestone", 0);
        f[9] = FieldDescriptor("milestoneOd", "uint32", "Operating day of the milestone, YYYYMMDD", 0);
        f[10] = FieldDescriptor("milestoneStage", "uint8", "0 sealed; 1-3 that outcome stage linked", 0);
        f[11] = FieldDescriptor("scope", "bytes32", "GateRecord scope", 0);
        f[12] = FieldDescriptor("seasonDays", "uint32[]", "Operating days that count towards skill (1-14)", 0);
        f[13] = FieldDescriptor("earnedBps", "uint16", "Reserve share held for the earned pool (0-5000)", 0);
        f[14] = FieldDescriptor("rewardCap", "uint256", "Most trading-tax quote the earned pool takes", 18);
        f[15] = FieldDescriptor("taxRoute", "uint8", "0 Flap VAULT slot; 1 MARKETING slot to the same vault", 0);
        schema.fields = f;
    }
}
