// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IGateRecord} from "./interfaces/IGateRecord.sol";
import {
    IERC20Balance,
    IOpenFourCoreMigrate,
    IOpenFourMigrateModule,
    IOpenFourModuleSchema,
    IOpenFourTokenView,
    IOpenFourVaultView,
    IPancakeV2Factory,
    IPancakeV2Pair,
    MigrateContext,
    MigrateHookContext,
    MigrateResult,
    ModuleEncodeSchema,
    ParamDescriptor,
    Phase
} from "./interfaces/OpenFour.sol";

/// @title EvidenceGatedMigrateModule
/// @notice OpenFour migrate responsibility for an agent's launch. The launch graduates
/// only when both hold at execution: the vault's selected liquidity predicate, and a
/// sealed GateRecord record of the launch's agent, bound to this launch, whose
/// committer, scope, operating day and root all match. Graduation moves the vault's
/// token and quote into an empty PancakeSwap V2 pair and sends the LP to 0xdEaD.
/// @dev One instance per token, behind the Registry's beacon. Token, Vault, Curve
/// and Trade stay the standard modules.
contract EvidenceGatedMigrateModule is IOpenFourMigrateModule, IOpenFourModuleSchema {
    string public constant TAG = "module.migrate.evidence_gated";
    uint8 public constant LIQUIDITY_SOLD_OUT = 0;
    uint8 public constant LIQUIDITY_RAISED = 1;
    /// @dev Same payload as the standard PancakeSwap V2 migrate, so indexers decode it unchanged.
    uint8 public constant MIGRATED_DATA_VERSION = 1;
    address public constant LP_SINK = 0x000000000000000000000000000000000000dEaD;

    /// @notice Creation parameters, decoded as one tuple: abi.decode(raw, (Params)).
    struct Params {
        address agent;
        bytes32 scope;
        uint32 minOd;
        uint32 minLeafCount;
        bytes32 codeHash;
        uint8 outcomeStage;
        uint8 liquidityPredicate;
        uint256 minQuoteRaised;
    }

    struct Evidence {
        bytes32 key;
        uint32 od;
        bytes32 root;
        address boundBy;
        uint64 boundAt;
    }

    struct Status {
        address token;
        address vault;
        address agent;
        bytes32 scope;
        uint8 phase;
        uint8 liquidityPredicate;
        bool liquidityReady;
        bool evidenceBound;
        bool evidenceHolds;
        Evidence evidence;
        address pair;
    }

    event EvidenceBound(
        address indexed token, address indexed agent, bytes32 indexed key, uint32 od, bytes32 root, address boundBy
    );
    event Graduated(
        address indexed token,
        address indexed pair,
        bytes32 indexed evidenceKey,
        uint256 tokenAmount,
        uint256 quoteAmount,
        uint256 liquidity
    );

    error AlreadyInitialized();
    error ZeroAddress();
    error InvalidParams(string field);
    error OnlyCore(address caller);
    error WrongToken(address token);
    error WrongVault(address vault);
    error NotBinder(address caller);
    error AlreadyGraduated(address pair);
    error GraduationInProgress();
    error NotGraduated(uint8 phase);
    error LiquidityNotReady(uint8 predicate);
    error EvidenceMissing(address agent, bytes32 scope);
    error EvidenceNotOnRecord(bytes32 key);
    error EvidenceRootMismatch(bytes32 key, bytes32 recorded, bytes32 claimed);
    error EvidenceBeforeMinimumDay(uint32 od, uint32 minOd);
    error EvidenceTooSmall(uint32 leafCount, uint32 minLeafCount);
    error EvidenceCodeMismatch(bytes32 recorded, bytes32 required);
    error EvidenceAfterGate(uint64 committedAt, uint256 gate);
    error EvidenceOutcomeMissing(bytes32 key, uint8 stage);
    error PoolNotEmpty(address pair);
    error NothingToMigrate();
    error ZeroLiquidity();

    IGateRecord public immutable gateRecord;
    IPancakeV2Factory public immutable pairFactory;

    address public token;
    address public fourCore;
    address public pair;
    Params private _params;
    Evidence private _evidence;
    bytes private _initParams;
    string private _moduleVersion;
    bool private _initialized;
    /// @dev Set only inside graduate(), so Core's call to evaluate() lets
    /// executeMigration() report exactly which condition is missing.
    bool private transient _graduating;

    constructor(IGateRecord gateRecord_, IPancakeV2Factory pairFactory_) {
        if (address(gateRecord_) == address(0) || address(pairFactory_) == address(0)) revert ZeroAddress();
        gateRecord = gateRecord_;
        pairFactory = pairFactory_;
        // The implementation is never a token's instance; only proxies initialize.
        _initialized = true;
    }

    // ---- OpenFour migrate responsibility ----

    function init(address token_, address fourCore_, address, bytes calldata rawParams, string calldata moduleVersion_)
        external
        override
    {
        if (_initialized) revert AlreadyInitialized();
        if (token_ == address(0) || fourCore_ == address(0)) revert ZeroAddress();
        Params memory p = abi.decode(rawParams, (Params));
        _validate(p);
        _initialized = true;
        token = token_;
        fourCore = fourCore_;
        _params = p;
        _initParams = rawParams;
        _moduleVersion = moduleVersion_;
    }

    /// @notice Core asks after every buy and on migrate(token). Outside graduate()
    /// this answers false until both conditions hold, so a buy that sells out the
    /// sale is never reverted by a missing record.
    function evaluate(MigrateContext calldata ctx) external view override returns (MigrateResult memory) {
        if (token == address(0) || ctx.token != token) return MigrateResult(false, "", "wrong token");
        if (pair != address(0)) return MigrateResult(false, "", "already graduated");
        if (_graduating) return MigrateResult(true, "", "");
        // ctx.soldOut is a hint; the vault is read directly.
        if (!_liquidityReady(_vault())) return MigrateResult(false, "", "liquidity predicate not met");
        if (_evidence.key == bytes32(0)) return MigrateResult(false, "", "evaluation evidence not bound");
        (, bytes memory failure) = _inspect(_evidence.od, _evidence.root);
        if (failure.length != 0) return MigrateResult(false, "", "bound evidence does not match the record");
        return MigrateResult(true, "", "");
    }

    /// @notice Rechecks both conditions against the vault and GateRecord, then adds
    /// the liquidity. hookData is ignored.
    function executeMigration(MigrateHookContext calldata ctx, bytes calldata)
        external
        override
        returns (uint8 migratedDataVersion, bytes memory encodedMigratedData)
    {
        if (msg.sender != fourCore) revert OnlyCore(msg.sender);
        if (ctx.token != token) revert WrongToken(ctx.token);
        address vault = _vault();
        if (ctx.vault != vault) revert WrongVault(ctx.vault);
        if (pair != address(0)) revert AlreadyGraduated(pair);
        if (!_liquidityReady(vault)) revert LiquidityNotReady(_params.liquidityPredicate);
        Evidence memory e = _evidence;
        if (e.key == bytes32(0)) revert EvidenceMissing(_params.agent, _params.scope);
        _requireEvidence(e.od, e.root);

        (address p, uint256 tokenAmount, uint256 quoteAmount, uint256 liquidity) = _addLiquidity(vault);
        pair = p;
        IOpenFourTokenView(token).setMigratedPool(p, true);
        emit Graduated(token, p, e.key, tokenAmount, quoteAmount, liquidity);
        return (MIGRATED_DATA_VERSION, abi.encode(p));
    }

    function getInitParams() external view override returns (bytes memory) {
        return _initParams;
    }

    function descriptor() external view override returns (bytes8 tagId, string memory tag, string memory version) {
        tag = TAG;
        return (bytes8(keccak256(bytes(tag))), tag, _moduleVersion);
    }

    // ---- Evidence and graduation ----

    /// @notice Binds the agent's sealed record for operating day `od` to this launch.
    /// The record is looked up under (agent, scope, od); `root` must equal its root.
    /// Callable by the agent or by the token's creator; a later call replaces the binding.
    function bindEvidence(uint32 od, bytes32 root) external returns (bytes32 key) {
        if (msg.sender != _params.agent && msg.sender != _creator()) revert NotBinder(msg.sender);
        if (pair != address(0)) revert AlreadyGraduated(pair);
        key = _requireEvidence(od, root);
        _evidence = Evidence(key, od, root, msg.sender, uint64(block.timestamp));
        emit EvidenceBound(token, _params.agent, key, od, root, msg.sender);
    }

    /// @notice Asks Core to migrate this token now. Reverts with the condition that
    /// is missing; callable by anyone.
    function graduate() external {
        if (_graduating) revert GraduationInProgress();
        _graduating = true;
        IOpenFourCoreMigrate(fourCore).migrate(token);
        _graduating = false;
        uint8 phase = IOpenFourVaultView(_vault()).phase();
        if (phase != Phase.MIGRATED) revert NotGraduated(phase);
    }

    /// @notice The record key a binding of (od, root) would store; reverts with the
    /// reason it does not qualify.
    function verifyEvidence(uint32 od, bytes32 root) external view returns (bytes32 key) {
        return _requireEvidence(od, root);
    }

    // ---- Reads ----

    function params() external view returns (Params memory) {
        return _params;
    }

    function evidence() external view returns (Evidence memory) {
        return _evidence;
    }

    function status() external view returns (Status memory s) {
        s.token = token;
        s.agent = _params.agent;
        s.scope = _params.scope;
        s.liquidityPredicate = _params.liquidityPredicate;
        s.evidence = _evidence;
        s.evidenceBound = _evidence.key != bytes32(0);
        s.pair = pair;
        if (token == address(0)) return s;
        s.vault = _vault();
        s.phase = IOpenFourVaultView(s.vault).phase();
        s.liquidityReady = _liquidityReady(s.vault);
        if (s.evidenceBound) {
            (, bytes memory failure) = _inspect(_evidence.od, _evidence.root);
            s.evidenceHolds = failure.length == 0;
        }
    }

    function moduleEncodeSchema() external pure override returns (ModuleEncodeSchema memory) {
        ParamDescriptor[] memory p = new ParamDescriptor[](8);
        p[0] = ParamDescriptor(
            "agent", "address", 0, false, "Agent", "", "The wallet that seals the agent's plans in GateRecord.", "", ""
        );
        p[1] = ParamDescriptor(
            "scope",
            "bytes32",
            0,
            false,
            "Record scope",
            "0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9",
            "keccak256 of the scope label; the default is gate-record/ercot-da-energy.",
            "",
            ""
        );
        p[2] = ParamDescriptor(
            "minOd",
            "uint32",
            0,
            false,
            "Earliest operating day",
            "",
            "YYYYMMDD. Records for earlier days do not qualify.",
            "20070101",
            "99991231"
        );
        p[3] = ParamDescriptor(
            "minLeafCount", "uint32", 0, true, "Minimum leaves", "1", "Batteries the record must cover.", "0", ""
        );
        p[4] = ParamDescriptor(
            "codeHash",
            "bytes32",
            0,
            true,
            "Code hash",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "The record's codeHash must equal this; zero accepts any.",
            "",
            ""
        );
        p[5] = ParamDescriptor(
            "outcomeStage",
            "uint8",
            0,
            true,
            "Outcome stage",
            "0",
            "0: the sealed record. 1, 2, 3: that settlement stage must also be linked.",
            "0",
            "3"
        );
        p[6] = ParamDescriptor(
            "liquidityPredicate",
            "uint8",
            0,
            true,
            "Liquidity predicate",
            "0",
            "0: the vault's sold-out predicate. 1: raised at least the quote floor.",
            "0",
            "1"
        );
        p[7] = ParamDescriptor(
            "minQuoteRaised",
            "uint256",
            18,
            true,
            "Quote floor",
            "0",
            "Predicate 1 only; must be 0 with predicate 0.",
            "0",
            ""
        );
        return ModuleEncodeSchema("migrate", 1, p);
    }

    // ---- Internals ----

    function _validate(Params memory p) internal view {
        if (p.agent == address(0)) revert InvalidParams("agent");
        if (p.scope == bytes32(0)) revert InvalidParams("scope");
        // Reverts InvalidDay for a date GateRecord would refuse.
        gateRecord.gateTs(p.minOd);
        if (p.outcomeStage > 3) revert InvalidParams("outcomeStage");
        if (p.liquidityPredicate == LIQUIDITY_SOLD_OUT) {
            if (p.minQuoteRaised != 0) revert InvalidParams("minQuoteRaised");
        } else if (p.liquidityPredicate == LIQUIDITY_RAISED) {
            if (p.minQuoteRaised == 0) revert InvalidParams("minQuoteRaised");
        } else {
            revert InvalidParams("liquidityPredicate");
        }
    }

    function _vault() internal view returns (address) {
        return IOpenFourTokenView(token).vault();
    }

    function _liquidityReady(address vault) internal view returns (bool) {
        if (_params.liquidityPredicate == LIQUIDITY_SOLD_OUT) return IOpenFourVaultView(vault).isSoldOut();
        return IOpenFourVaultView(vault).totalRaised() >= _params.minQuoteRaised;
    }

    /// @dev The token's creator from Core's runtime config; the getter's second word.
    function _creator() internal view returns (address creator) {
        (bool ok, bytes memory ret) = fourCore.staticcall(abi.encodeWithSignature("tokens(address)", token));
        if (!ok || ret.length < 64) return address(0);
        (, creator) = abi.decode(ret, (uint32, address));
    }

    function _requireEvidence(uint32 od, bytes32 root) internal view returns (bytes32 key) {
        bytes memory failure;
        (key, failure) = _inspect(od, root);
        if (failure.length != 0) {
            assembly ("memory-safe") {
                revert(add(failure, 0x20), mload(failure))
            }
        }
    }

    /// @dev Returns the encoded error for the first check that fails, or empty bytes.
    function _inspect(uint32 od, bytes32 root) internal view returns (bytes32 key, bytes memory failure) {
        Params storage p = _params;
        if (od < p.minOd) return (key, abi.encodeWithSelector(EvidenceBeforeMinimumDay.selector, od, p.minOd));
        key = gateRecord.keyOf(p.agent, p.scope, od);
        IGateRecord.Record memory r = gateRecord.get(key);
        // The key already commits to committer, scope and day; checking the fields
        // as well holds a substitute record source to the same three.
        if (r.committer == address(0) || r.committer != p.agent || r.scope != p.scope || r.od != od) {
            return (key, abi.encodeWithSelector(EvidenceNotOnRecord.selector, key));
        }
        if (r.root != root) return (key, abi.encodeWithSelector(EvidenceRootMismatch.selector, key, r.root, root));
        if (r.leafCount < p.minLeafCount) {
            return (key, abi.encodeWithSelector(EvidenceTooSmall.selector, r.leafCount, p.minLeafCount));
        }
        if (p.codeHash != bytes32(0) && r.codeHash != p.codeHash) {
            return (key, abi.encodeWithSelector(EvidenceCodeMismatch.selector, r.codeHash, p.codeHash));
        }
        uint256 gate = gateRecord.gateTs(od);
        if (r.committedAt >= gate) return (key, abi.encodeWithSelector(EvidenceAfterGate.selector, r.committedAt, gate));
        if (p.outcomeStage != 0 && gateRecord.outcomeOf(key, p.outcomeStage).linkedAt == 0) {
            return (key, abi.encodeWithSelector(EvidenceOutcomeMissing.selector, key, p.outcomeStage));
        }
    }

    function _addLiquidity(address vault)
        internal
        returns (address p, uint256 tokenAmount, uint256 quoteAmount, uint256 liquidity)
    {
        address quote = IOpenFourVaultView(vault).quoteAsset();
        p = pairFactory.getPair(token, quote);
        if (p == address(0)) p = pairFactory.createPair(token, quote);
        if (IPancakeV2Pair(p).totalSupply() != 0) revert PoolNotEmpty(p);

        uint256 maxSupply = IOpenFourTokenView(token).maxSupply();
        uint256 sold = IOpenFourVaultView(vault).soldAmount();
        tokenAmount = _min(maxSupply > sold ? maxSupply - sold : 0, IERC20Balance(token).balanceOf(vault));
        quoteAmount = _min(IOpenFourVaultView(vault).totalRaised(), IERC20Balance(quote).balanceOf(vault));
        if (tokenAmount == 0 || quoteAmount == 0) revert NothingToMigrate();

        IOpenFourVaultView(vault).transferTokenForMigration(p, tokenAmount);
        IOpenFourVaultView(vault).transferQuoteForMigration(p, quoteAmount);
        liquidity = IPancakeV2Pair(p).mint(LP_SINK);
        if (liquidity == 0) revert ZeroLiquidity();
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
