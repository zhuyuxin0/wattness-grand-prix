// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    CREATOR_EXTENSION_ID,
    CreateTaxTokenParams,
    CreatorBuyParams,
    Distribution,
    DistributionTarget,
    FeeConfig,
    FeeConfigVault,
    FeeSlotType,
    IFlapPortal,
    ILauncherDescription,
    IStrategy,
    LAUNCH_KIND_DIRECT_V2_POOL_TAX
} from "./FlapPoolLaunch.sol";
import {GateRecordReader, IERC20Min, SafeTransfer, Text} from "./SeasonLib.sol";

/// Payload of `Portal.newLauncher(factory, abi.encode(SeasonConfig))`.
struct SeasonConfig {
    string name;
    string symbol;
    string meta;
    /// Mined so the token address ends in 7777.
    bytes32 salt;
    /// Quote the launch needs; it must also clear the Portal's creation floor.
    uint256 minRaise;
    /// All contributions together.
    uint256 raiseCap;
    /// One wallet's contributions.
    uint256 walletCap;
    /// Contributions and the launch close here; refunds open if the token has not launched.
    uint64 deadline;
    /// The milestone: this committer's GateRecord entry for `milestoneOd` under `scope`.
    address milestoneCommitter;
    uint32 milestoneOd;
    /// 0: the entry sealed before its gate is enough; 1..3: that outcome stage must be linked too.
    uint8 milestoneStage;
    /// GateRecord scope of the milestone and of the season's records.
    bytes32 scope;
    /// Operating days that count towards an agent's skill, strictly increasing.
    uint32[] seasonDays;
    /// Share of the reserve held back for the earned pool, in bps of the reserve.
    uint16 earnedBps;
    /// Most quote the earned pool takes from trading tax; the rest goes to the creator.
    uint256 rewardCap;
    /// 0: Flap's VAULT fee slot, the vault made by the paired factory; 1: a MARKETING slot to the same vault.
    uint8 taxRoute;
}

interface ISeasonVaultOpener {
    function openVault(address launcher) external returns (address vault);
}

/// A capped contribution round for one season token. The round launches the
/// token only when a named plan was sealed in GateRecord before its gate; if that
/// has not happened by the deadline, every contribution is refundable.
///
/// Contributions are pooled liquidity: all of them seed the pool at launch, and
/// contributors claim the contributor part of the reserve pro rata. The earned
/// part of the reserve, and a capped share of the trading tax, go to the paired
/// SeasonVault, which pays by deposit times the backed agent's verified days.
contract SeasonLauncher is ILauncherDescription, IStrategy {
    using SafeTransfer for address;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant POOL_TOKEN = TOTAL_SUPPLY / 2;
    uint256 public constant RESERVE = TOTAL_SUPPLY - POOL_TOKEN;
    uint16 public constant TAX_BPS = 300;
    uint16 public constant VAULT_SHARE_BPS = 8000;
    uint256 public constant MAX_CONTRIBUTORS = 100;

    uint8 public constant OPEN = 0;
    uint8 public constant LAUNCHED = 1;
    uint8 public constant REFUNDING = 2;

    string internal constant TITLE_EN = "Season launch gated by a sealed record";
    string internal constant TITLE_ZH = unicode"以链上封存记录为门槛的赛季发射";
    string internal constant SUMMARY_EN =
        "Contributions in test USD seed the pool. The token launches only after the named GateRecord entry was sealed before its day-ahead gate; if that has not happened by the deadline, every contribution can be refunded. Contributors claim their part of the reserve pro rata. An earned pool pays by deposit times the backed agent's days sealed before the gate, from a held-back reserve share and a capped share of the trading tax.";
    string internal constant SUMMARY_ZH =
        unicode"贡献者以测试 USD 出资建池。只有当指定的 GateRecord 记录在日前市场关闸前封存后，代币才会发射；若截止时仍未满足，所有出资均可退回。贡献者按出资比例领取储备代币中的贡献份额。收益池按出资乘以所支持代理在关闸前封存的天数分配，来源为预留的储备份额和有上限的交易税份额。";

    address public immutable factory;
    address public immutable hub;
    address public immutable creator;
    address public immutable quoteToken;
    address public immutable gateRecord;
    address public immutable vaultFactory;
    bytes32 public immutable launchSalt;
    uint256 public immutable minRaise;
    uint256 public immutable raiseCap;
    uint256 public immutable walletCap;
    uint64 public immutable deadline;
    address public immutable milestoneCommitter;
    uint32 public immutable milestoneOd;
    uint8 public immutable milestoneStage;
    bytes32 public immutable scope;
    uint16 public immutable earnedBps;
    uint256 public immutable rewardCap;
    uint8 public immutable taxRoute;

    string public name;
    string public symbol;
    string public meta;
    uint32[] internal _seasonDays;

    uint256 public raised;
    mapping(address account => uint256 amount) public depositOf;
    mapping(address account => uint256 amount) public claimedOf;
    mapping(address account => address agent) internal _agentOf;
    mapping(address account => bool) internal _listed;
    address[] internal _contributors;

    bool public launched;
    /// True only while the Portal launch call runs; the paired vault factory checks it.
    bool public launching;
    bool internal _distributed;
    address public token;
    address public pool;
    address public vault;

    uint256 private _lock = 1;

    struct Snapshot {
        uint8 status;
        uint256 raised;
        uint256 minRaise;
        uint256 raiseCap;
        uint256 walletCap;
        uint64 deadline;
        bool milestoneMet;
        uint256 contributorCount;
        address token;
        address pool;
        address vault;
    }

    event Backed(address indexed account, address indexed agent);
    event Contributed(address indexed account, address indexed agent, uint256 amount, uint256 raised);
    event Launched(address indexed token, address indexed pool, address indexed vault, uint256 poolQuote);
    event Claimed(address indexed account, uint256 amount);
    event Refunded(address indexed account, uint256 amount);

    error InvalidConfig();
    error NotOpen();
    error ZeroAmount();
    error ZeroAgent();
    error OverWalletCap(uint256 deposit, uint256 walletCap);
    error OverRaiseCap(uint256 raised, uint256 raiseCap);
    error TooManyContributors();
    error ShortTransfer(uint256 expected, uint256 received);
    error BelowMinRaise(uint256 raised, uint256 minRaise);
    error MilestoneNotMet(address committer, bytes32 scope, uint32 od, uint8 stage);
    error NotHub(address caller);
    error UnexpectedDistribution();
    error WrongVault(address vault, address vaultFactory);
    error NotLaunched();
    error NothingToClaim();
    error RefundUnavailable();
    error NothingToRefund();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// Deployed for SeasonLauncherFactory with exactly the salt-lock fee, which
    /// the Launcher spends itself: the Portal records the caller as the locker.
    constructor(
        address factory_,
        address hub_,
        address creator_,
        address quoteToken_,
        address gateRecord_,
        address vaultFactory_,
        SeasonConfig memory c
    ) payable {
        if (hub_ == address(0) || creator_ == address(0) || quoteToken_ == address(0)) revert InvalidConfig();
        factory = factory_;
        hub = hub_;
        creator = creator_;
        quoteToken = quoteToken_;
        gateRecord = gateRecord_;
        vaultFactory = vaultFactory_;
        launchSalt = c.salt;
        minRaise = c.minRaise;
        raiseCap = c.raiseCap;
        walletCap = c.walletCap;
        deadline = c.deadline;
        milestoneCommitter = c.milestoneCommitter;
        milestoneOd = c.milestoneOd;
        milestoneStage = c.milestoneStage;
        scope = c.scope;
        earnedBps = c.earnedBps;
        rewardCap = c.rewardCap;
        taxRoute = c.taxRoute;
        name = c.name;
        symbol = c.symbol;
        meta = c.meta;
        for (uint256 i; i < c.seasonDays.length; ++i) {
            _seasonDays.push(c.seasonDays[i]);
        }

        uint256 fee = IFlapPortal(hub_).SALT_LOCK_FEE();
        if (msg.value != fee) revert InvalidConfig();
        IFlapPortal(hub_).lockSalt{value: fee}(c.salt, LAUNCH_KIND_DIRECT_V2_POOL_TAX);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function status() public view returns (uint8) {
        if (launched) return LAUNCHED;
        if (block.timestamp >= deadline) return REFUNDING;
        return OPEN;
    }

    function milestoneMet() public view returns (bool) {
        return GateRecordReader.sealedBeforeGate(gateRecord, milestoneCommitter, scope, milestoneOd, milestoneStage);
    }

    /// The agent whose sealed records weight this account's earned share; by default the account itself.
    function agentOf(address account) public view returns (address) {
        address a = _agentOf[account];
        return a == address(0) ? account : a;
    }

    function seasonDays() external view returns (uint32[] memory) {
        return _seasonDays;
    }

    function contributors() external view returns (address[] memory) {
        return _contributors;
    }

    /// Reserve tokens held back for the earned pool.
    function earnedTokens() public view returns (uint256) {
        return RESERVE * earnedBps / 10_000;
    }

    /// Reserve tokens an account claims here, pro rata to its deposit.
    function entitledTokens(address account) public view returns (uint256) {
        if (!launched || raised == 0) return 0;
        return depositOf[account] * (RESERVE - earnedTokens()) / raised;
    }

    function snapshot() external view returns (Snapshot memory s) {
        s = Snapshot({
            status: status(),
            raised: raised,
            minRaise: minRaise,
            raiseCap: raiseCap,
            walletCap: walletCap,
            deadline: deadline,
            milestoneMet: milestoneMet(),
            contributorCount: _contributors.length,
            token: token,
            pool: pool,
            vault: vault
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Contribution round
    // ─────────────────────────────────────────────────────────────────────────

    function back(address agent) external {
        if (status() != OPEN || launching) revert NotOpen();
        if (agent == address(0)) revert ZeroAgent();
        _agentOf[msg.sender] = agent;
        emit Backed(msg.sender, agent);
    }

    /// The quote must be approved to this Launcher first. The name and argument
    /// match the presale route Flap's Mini App wallet resolves.
    function contributeQuote(uint256 amount) external nonReentrant {
        if (status() != OPEN) revert NotOpen();
        if (amount == 0) revert ZeroAmount();
        uint256 deposit = depositOf[msg.sender] + amount;
        if (deposit > walletCap) revert OverWalletCap(deposit, walletCap);
        if (raised + amount > raiseCap) revert OverRaiseCap(raised + amount, raiseCap);
        if (!_listed[msg.sender]) {
            if (_contributors.length >= MAX_CONTRIBUTORS) revert TooManyContributors();
            _listed[msg.sender] = true;
            _contributors.push(msg.sender);
        }

        uint256 before = IERC20Min(quoteToken).balanceOf(address(this));
        quoteToken.pull(msg.sender, address(this), amount);
        uint256 received = IERC20Min(quoteToken).balanceOf(address(this)) - before;
        if (received != amount) revert ShortTransfer(amount, received);

        depositOf[msg.sender] = deposit;
        raised += amount;
        emit Contributed(msg.sender, agentOf(msg.sender), amount, raised);
    }

    function refund() external nonReentrant {
        if (status() != REFUNDING) revert RefundUnavailable();
        uint256 amount = depositOf[msg.sender];
        if (amount == 0) revert NothingToRefund();
        depositOf[msg.sender] = 0;
        raised -= amount;
        quoteToken.send(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Launch
    // ─────────────────────────────────────────────────────────────────────────

    /// Anyone may launch once the milestone is on chain and the raise is enough.
    function launch() external nonReentrant returns (address token_, address pool_) {
        if (status() != OPEN) revert NotOpen();
        if (raised < minRaise) revert BelowMinRaise(raised, minRaise);
        if (!milestoneMet()) revert MilestoneNotMet(milestoneCommitter, scope, milestoneOd, milestoneStage);

        launching = true;
        address taxVault = taxRoute == 1 ? ISeasonVaultOpener(vaultFactory).openVault(address(this)) : address(0);
        CreateTaxTokenParams memory p = _launchParams(taxVault);
        Distribution memory reserve = Distribution({
            target: DistributionTarget.EXPLICIT,
            strategy: address(this),
            amount: uint128(RESERVE),
            configData: ""
        });
        CreatorBuyParams memory noBuy;
        quoteToken.approve(hub, raised);
        (token_, pool_) = IFlapPortal(hub).launchTaxTokenV2(p, reserve, noBuy);
        launching = false;

        if (!_distributed || token_ != token) revert UnexpectedDistribution();
        if (taxRoute == 0) {
            address vf;
            (taxVault, vf) = IFlapPortal(hub).getLaunchVault(token_);
            if (taxVault == address(0) || vf != vaultFactory) revert WrongVault(taxVault, vf);
        }
        launched = true;
        pool = pool_;
        vault = taxVault;
        uint256 earned = earnedTokens();
        if (earned != 0) token_.send(taxVault, earned);
        emit Launched(token_, pool_, taxVault, raised);
    }

    /// The Portal hands the reserve here during the launch.
    function initializeDistribution(address token_, uint256 amount, bytes calldata, bytes32) external override {
        if (msg.sender != hub) revert NotHub(msg.sender);
        if (!launching || _distributed || token_ == address(0) || amount != RESERVE) revert UnexpectedDistribution();
        _distributed = true;
        token = token_;
        uint256 before = IERC20Min(token_).balanceOf(address(this));
        token_.pull(msg.sender, address(this), amount);
        uint256 received = IERC20Min(token_).balanceOf(address(this)) - before;
        if (received != amount) revert ShortTransfer(amount, received);
        emit FlapDistributionInitialized(token_, amount);
    }

    function claim() external nonReentrant {
        if (!launched) revert NotLaunched();
        uint256 entitled = entitledTokens(msg.sender);
        uint256 amount = entitled - claimedOf[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimedOf[msg.sender] = entitled;
        token.send(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function _launchParams(address marketingVault) internal view returns (CreateTaxTokenParams memory p) {
        p.name = name;
        p.symbol = symbol;
        p.meta = meta;
        p.totalSupply = TOTAL_SUPPLY;
        p.salt = launchSalt;
        p.quoteToken = quoteToken;
        p.poolQuote = raised;
        p.poolToken = POOL_TOKEN;
        p.buyTaxRate = TAX_BPS;
        p.sellTaxRate = TAX_BPS;
        p.taxDuration = 30 days;
        p.antiFarmerDuration = 1 days;
        p.feeConfigs = new FeeConfig[](2);
        p.feeConfigs[0] = taxRoute == 0
            ? FeeConfig({
                feeType: FeeSlotType.VAULT,
                bps: VAULT_SHARE_BPS,
                configData: abi.encode(FeeConfigVault({vaultFactory: vaultFactory, vaultData: abi.encode(address(this))}))
            })
            : FeeConfig({feeType: FeeSlotType.MARKETING, bps: VAULT_SHARE_BPS, configData: abi.encode(marketingVault)});
        p.feeConfigs[1] = FeeConfig({feeType: FeeSlotType.DEFLATION, bps: 10_000 - VAULT_SHARE_BPS, configData: ""});
        p.exemptAddrs = new address[](0);
        p.extensionID = CREATOR_EXTENSION_ID;
        p.extensionData = abi.encode(creator);
    }

    /// The v1 JSON the Portal folds into FlapNewLauncherCreated. The factory
    /// admits only names and symbols that need no JSON escaping.
    function description() external view override returns (string memory) {
        string memory head = string.concat(
            '{"v":1,"name":"',
            name,
            '","symbol":"',
            symbol,
            '","quoteToken":"',
            Text.hexAddress(quoteToken),
            '","targetRaise":"',
            Text.decimal(minRaise),
            '","poolTokenRatio":"',
            Text.decimal(POOL_TOKEN * 1e18 / TOTAL_SUPPLY)
        );
        return string.concat(
            head,
            '","titleZh":"',
            TITLE_ZH,
            '","titleEn":"',
            TITLE_EN,
            '","summaryZh":"',
            SUMMARY_ZH,
            '","summaryEn":"',
            SUMMARY_EN,
            '"}'
        );
    }
}
