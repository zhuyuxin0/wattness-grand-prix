// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FieldDescriptor, IDirectLaunchVault, VaultMethodSchema, VaultUISchema} from "./FlapPoolLaunch.sol";
import {GateRecordReader, IERC20Min, SafeTransfer, Text} from "./SeasonLib.sol";

interface ISeasonLauncher {
    function creator() external view returns (address);
    function quoteToken() external view returns (address);
    function gateRecord() external view returns (address);
    function scope() external view returns (bytes32);
    function seasonDays() external view returns (uint32[] memory);
    function rewardCap() external view returns (uint256);
    function raised() external view returns (uint256);
    function token() external view returns (address);
    function earnedTokens() external view returns (uint256);
    function depositOf(address account) external view returns (uint256);
    function agentOf(address account) external view returns (address);
}

/// The earned pool of one season. It holds the reserve share its Launcher held
/// back and receives a share of the token's trading tax in the quote token. Tax
/// is credited by balance delta up to `rewardCap`; the rest passes to the
/// creator, so the pool is bounded and nothing about its size is promised.
///
/// An account earns its deposit share of the pool times the fraction of season
/// days on which its backed agent sealed a plan in GateRecord before the gate,
/// read from GateRecord at the time of the claim. GateRecord refuses late and
/// repeated records, so a day missed cannot be made up afterwards. The share not
/// earned stays in the vault.
contract SeasonVault is IDirectLaunchVault {
    using SafeTransfer for address;

    uint256 internal constant ACC = 1e30;

    address public immutable launcher;
    address public immutable quoteToken;
    address public immutable gateRecord;
    address public immutable overflowRecipient;
    bytes32 public immutable scope;
    uint256 public immutable rewardCap;
    uint256 public immutable totalDeposit;
    uint32[] internal _seasonDays;

    /// Quote seen so far: the balance plus everything paid out or passed on.
    uint256 public recognized;
    /// The part of `recognized` credited to the earned pool; never above `rewardCap`.
    uint256 public pooled;
    /// The part above the cap, sent to `overflowRecipient`.
    uint256 public forwarded;
    uint256 public quotePaid;
    uint256 public tokensPaid;
    uint256 public accQuotePerDeposit;
    mapping(address account => uint256 amount) public quoteClaimed;
    mapping(address account => uint256 amount) public tokensClaimed;

    uint256 private _lock = 1;

    struct State {
        uint256 quoteBalance;
        uint256 tokenBalance;
        uint256 recognized;
        uint256 pooled;
        uint256 forwarded;
        uint256 rewardCap;
        uint256 quotePaid;
        uint256 tokensPaid;
        uint256 earnedTokens;
        uint256 totalDeposit;
    }

    event Credited(uint256 received, uint256 pooled, uint256 forwarded);
    event Claimed(address indexed account, address indexed agent, uint256 quote, uint256 tokens);

    error NothingRaised();
    error NothingToClaim();
    error Reentrancy();

    /// Created during the launch, before the token has code: read only the Launcher.
    constructor(address launcher_) {
        ISeasonLauncher l = ISeasonLauncher(launcher_);
        uint256 deposits = l.raised();
        if (deposits == 0) revert NothingRaised();
        launcher = launcher_;
        quoteToken = l.quoteToken();
        gateRecord = l.gateRecord();
        overflowRecipient = l.creator();
        scope = l.scope();
        rewardCap = l.rewardCap();
        totalDeposit = deposits;
        uint32[] memory ods = l.seasonDays();
        for (uint256 i; i < ods.length; ++i) {
            _seasonDays.push(ods[i]);
        }
    }

    /// Tax arrives as a quote transfer and an empty ping: stay cheap and never revert.
    receive() external payable {}

    function sync() external {
        _sync();
    }

    function seasonDays() external view returns (uint32[] memory) {
        return _seasonDays;
    }

    /// Season days on which `agent` sealed a plan under the season's scope before the gate.
    function skillOf(address agent) public view returns (uint256 verified, uint256 total) {
        verified = GateRecordReader.verifiedDays(gateRecord, agent, scope, _seasonDays);
        total = _seasonDays.length;
    }

    /// Everything an account has earned so far, claimed or not.
    function entitled(address account) public view returns (uint256 quote, uint256 tokens) {
        ISeasonLauncher l = ISeasonLauncher(launcher);
        uint256 deposit = l.depositOf(account);
        if (deposit == 0) return (0, 0);
        (uint256 verified, uint256 total) = skillOf(l.agentOf(account));
        (uint256 toPool,) = _split(_unseen());
        uint256 acc = accQuotePerDeposit + toPool * ACC / totalDeposit;
        quote = deposit * acc / ACC * verified / total;
        tokens = l.earnedTokens() * deposit * verified / (totalDeposit * total);
    }

    function claimable(address account) public view returns (uint256 quote, uint256 tokens) {
        (uint256 q, uint256 t) = entitled(account);
        quote = q > quoteClaimed[account] ? q - quoteClaimed[account] : 0;
        tokens = t > tokensClaimed[account] ? t - tokensClaimed[account] : 0;
    }

    function claim() external returns (uint256 quote, uint256 tokens) {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _sync();
        (quote, tokens) = claimable(msg.sender);
        if (quote == 0 && tokens == 0) revert NothingToClaim();
        if (quote != 0) {
            quoteClaimed[msg.sender] += quote;
            quotePaid += quote;
            quoteToken.send(msg.sender, quote);
        }
        if (tokens != 0) {
            tokensClaimed[msg.sender] += tokens;
            tokensPaid += tokens;
            ISeasonLauncher(launcher).token().send(msg.sender, tokens);
        }
        emit Claimed(msg.sender, ISeasonLauncher(launcher).agentOf(msg.sender), quote, tokens);
        _lock = 1;
    }

    function state() external view returns (State memory s) {
        ISeasonLauncher l = ISeasonLauncher(launcher);
        address t = l.token();
        s = State({
            quoteBalance: IERC20Min(quoteToken).balanceOf(address(this)),
            tokenBalance: t == address(0) || t.code.length == 0 ? 0 : IERC20Min(t).balanceOf(address(this)),
            recognized: recognized,
            pooled: pooled,
            forwarded: forwarded,
            rewardCap: rewardCap,
            quotePaid: quotePaid,
            tokensPaid: tokensPaid,
            earnedTokens: l.earnedTokens(),
            totalDeposit: totalDeposit
        });
    }

    function _unseen() internal view returns (uint256) {
        uint256 seen = IERC20Min(quoteToken).balanceOf(address(this)) + quotePaid + forwarded;
        return seen > recognized ? seen - recognized : 0;
    }

    function _split(uint256 amount) internal view returns (uint256 toPool, uint256 over) {
        uint256 room = rewardCap > pooled ? rewardCap - pooled : 0;
        toPool = amount < room ? amount : room;
        over = amount - toPool;
    }

    function _sync() internal {
        uint256 amount = _unseen();
        if (amount == 0) return;
        recognized += amount;
        (uint256 toPool, uint256 over) = _split(amount);
        if (toPool != 0) {
            pooled += toPool;
            accQuotePerDeposit += toPool * ACC / totalDeposit;
        }
        if (over != 0) {
            forwarded += over;
            quoteToken.send(overflowRecipient, over);
        }
        emit Credited(amount, toPool, over);
    }

    function description() public view override returns (string memory) {
        return string.concat(
            "SeasonVault: the earned pool of Launcher ",
            Text.hexAddress(launcher),
            ". Trading tax in the quote token is credited up to ",
            Text.decimal(rewardCap),
            " units; the rest goes to the creator. An account earns its deposit share times the fraction of season days its backed agent sealed in GateRecord ",
            Text.hexAddress(gateRecord),
            " before the gate. Credited so far: ",
            Text.decimal(pooled),
            ". Each account pulls its share with claim()."
        );
    }

    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        schema.vaultType = "SeasonVault";
        schema.description =
            "Earned pool of a season launch: deposit share times the backed agent's days sealed before the gate.";
        schema.methods = new VaultMethodSchema[](3);

        schema.methods[0].name = "claimable";
        schema.methods[0].description = "Quote and tokens the account can claim now.";
        schema.methods[0].inputs = new FieldDescriptor[](1);
        schema.methods[0].inputs[0] = FieldDescriptor("account", "address", "Contributor", 0);
        schema.methods[0].outputs = new FieldDescriptor[](2);
        schema.methods[0].outputs[0] = FieldDescriptor("quote", "uint256", "Claimable quote", 18);
        schema.methods[0].outputs[1] = FieldDescriptor("tokens", "uint256", "Claimable tokens", 18);

        schema.methods[1].name = "skillOf";
        schema.methods[1].description = "Season days the agent sealed before the gate, and the season's length.";
        schema.methods[1].inputs = new FieldDescriptor[](1);
        schema.methods[1].inputs[0] = FieldDescriptor("agent", "address", "GateRecord committer", 0);
        schema.methods[1].outputs = new FieldDescriptor[](2);
        schema.methods[1].outputs[0] = FieldDescriptor("verified", "uint256", "Days sealed before the gate", 0);
        schema.methods[1].outputs[1] = FieldDescriptor("total", "uint256", "Season days", 0);

        schema.methods[2].name = "claim";
        schema.methods[2].description = "Claim the caller's earned share.";
        schema.methods[2].isWriteMethod = true;
    }
}
