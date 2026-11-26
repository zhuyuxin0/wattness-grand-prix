// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    CreateTaxTokenParams,
    Distribution,
    DistributionTarget,
    FactoryPolicy,
    FeeConfig,
    FeeConfigVault,
    FeeSlotType,
    FieldDescriptor,
    IDirectLaunchVaultFactory,
    IFlapPortal,
    LAUNCH_KIND_DIRECT_V2_POOL_TAX,
    VaultDataSchema
} from "./FlapPoolLaunch.sol";
import {SeasonVault} from "./SeasonVault.sol";

interface ISeasonLauncherCheck {
    function launching() external view returns (bool);
    function taxRoute() external view returns (uint8);
}

/// The Vault half of the pair, deployed by SeasonLauncherFactory. It makes one
/// SeasonVault per launch, only for a Launcher of that factory while it is
/// launching. With the VAULT fee slot the Portal asks for the vault; with the
/// MARKETING slot the Launcher opens it just before the launch.
contract SeasonVaultFactory is IDirectLaunchVaultFactory {
    uint16 public constant VAULT_SLOT_BPS = 8000;

    address public immutable launcherFactory;
    address public immutable hub;
    address public immutable quoteToken;

    mapping(address launcher => address vault) public vaultOf;

    event SeasonVaultCreated(address indexed vault, address indexed launcher, address indexed token, uint8 taxRoute);

    error ZeroAddress();
    error NotHub(address caller);
    error NotLauncher(address caller);
    error UnsupportedLaunchKind(uint8 launchKind);
    error MissingVaultSlot();
    error DuplicateVaultSlot();
    error VaultSlotBps(uint16 bps);
    error UnsupportedQuoteToken(address quoteToken);
    error InvalidVaultData();
    error UnexpectedDistribution();
    error NotFromLauncherFactory(address launcher);
    error LauncherNotLaunching(address launcher);
    error WrongRoute(uint8 taxRoute);
    error VaultExists(address launcher);
    error ImmutableVaults();

    constructor(address hub_, address quoteToken_) {
        if (hub_ == address(0) || quoteToken_ == address(0)) revert ZeroAddress();
        launcherFactory = msg.sender;
        hub = hub_;
        quoteToken = quoteToken_;
    }

    /// Portal-only, during `launchTaxTokenV2`. `token` has no code yet; `creator` is the calling Launcher.
    function newVault(address token, address creator, uint8 launchKind, bytes calldata launchParams)
        external
        override
        returns (address vault)
    {
        if (msg.sender != hub) revert NotHub(msg.sender);
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (launchKind != LAUNCH_KIND_DIRECT_V2_POOL_TAX) revert UnsupportedLaunchKind(launchKind);
        (CreateTaxTokenParams memory p, Distribution memory d) =
            abi.decode(launchParams, (CreateTaxTokenParams, Distribution));
        (uint16 bps, bytes memory vaultData) = _vaultSlot(p.feeConfigs);
        if (bps != VAULT_SLOT_BPS) revert VaultSlotBps(bps);
        if (!isQuoteTokenSupported(p.quoteToken)) revert UnsupportedQuoteToken(p.quoteToken);
        if (vaultData.length != 32 || abi.decode(vaultData, (address)) != creator) revert InvalidVaultData();
        // The reserve goes to the Launcher, which forwards the earned part itself.
        if (d.target != DistributionTarget.EXPLICIT || d.strategy != creator) revert UnexpectedDistribution();
        vault = _open(creator, 0, token);
    }

    /// For the MARKETING route: the Launcher calls this from `launch()`, before the Portal.
    function openVault(address launcher) external returns (address vault) {
        if (msg.sender != launcher) revert NotLauncher(msg.sender);
        vault = _open(launcher, 1, address(0));
    }

    function _open(address launcher, uint8 route, address token) internal returns (address vault) {
        if (IFlapPortal(hub).getLauncher(launcher).launcherFactory != launcherFactory) {
            revert NotFromLauncherFactory(launcher);
        }
        ISeasonLauncherCheck l = ISeasonLauncherCheck(launcher);
        if (!l.launching()) revert LauncherNotLaunching(launcher);
        if (l.taxRoute() != route) revert WrongRoute(route);
        if (vaultOf[launcher] != address(0)) revert VaultExists(launcher);
        vault = address(new SeasonVault(launcher));
        vaultOf[launcher] = vault;
        emit SeasonVaultCreated(vault, launcher, token, route);
    }

    function _vaultSlot(FeeConfig[] memory fees) internal view returns (uint16 bps, bytes memory vaultData) {
        bool found;
        for (uint256 i; i < fees.length; ++i) {
            if (fees[i].feeType != FeeSlotType.VAULT) continue;
            FeeConfigVault memory v = abi.decode(fees[i].configData, (FeeConfigVault));
            if (v.vaultFactory != address(this)) continue;
            if (found) revert DuplicateVaultSlot();
            found = true;
            bps = fees[i].bps;
            vaultData = v.vaultData;
        }
        if (!found) revert MissingVaultSlot();
    }

    function isQuoteTokenSupported(address quote) public view override returns (bool) {
        return quote == quoteToken;
    }

    function factorySpecVersion() external pure override returns (string memory) {
        return "pl-v1";
    }

    function vaultDataSchema() external pure override returns (VaultDataSchema memory schema) {
        schema.description =
            "Season vault: the earned pool of the launching SeasonLauncher. Set by the Launcher, not by hand.";
        schema.fields = new FieldDescriptor[](1);
        schema.fields[0] = FieldDescriptor("launcher", "address", "The SeasonLauncher that is launching", 0);
    }

    function tokenCreationPolicies() external view override returns (FactoryPolicy[] memory policies) {
        policies = new FactoryPolicy[](2);
        policies[0] = FactoryPolicy({
            target: "quoteToken",
            operator: "eq",
            value: abi.encode(quoteToken),
            description: "The factory's quote token only."
        });
        policies[1] = FactoryPolicy({
            target: "vaultSlotBps",
            operator: "eq",
            value: abi.encode(uint256(VAULT_SLOT_BPS)),
            description: "The VAULT slot takes exactly 80% of the tax."
        });
    }

    function upgradeVaultImplementation(address) external pure override {
        revert ImmutableVaults();
    }
}
