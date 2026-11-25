// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// The Flap Pool Launch types and the parts of the Portal that a Launcher and a
// Vault use. Layouts follow the Portal's interfaces as published in
// flap-sh/FlapPoolLaunchVaultExample (MIT) at 29334f6. They are ABI: field order
// must not change.

uint8 constant LAUNCH_KIND_DIRECT_V2_POOL_TAX = 0;

enum FeeSlotType {
    NONE,
    DEFLATION,
    LP_BPS,
    MARKETING,
    VAULT,
    DIVIDEND
}

enum DistributionTarget {
    NONE,
    EXPLICIT,
    VAULT
}

struct FeeConfig {
    FeeSlotType feeType;
    uint16 bps;
    bytes configData;
}

struct FeeConfigVault {
    address vaultFactory;
    bytes vaultData;
}

struct CreateTaxTokenParams {
    string name;
    string symbol;
    string meta;
    uint256 totalSupply;
    bytes32 salt;
    address quoteToken;
    uint8 dexId;
    uint256 poolQuote;
    uint256 poolToken;
    uint16 buyTaxRate;
    uint16 sellTaxRate;
    uint32 taxDuration;
    uint32 antiFarmerDuration;
    FeeConfig[] feeConfigs;
    uint8 antiSniperMode;
    uint32 exemptWindow;
    address[] exemptAddrs;
    uint256 creatorBuyQuote;
    bytes32 extensionID;
    bytes extensionData;
    address commissionReceiver;
}

struct CreatorBuyParams {
    uint256 minOutputAmount;
    bytes permitData;
}

struct Distribution {
    DistributionTarget target;
    address strategy;
    uint128 amount;
    bytes configData;
}

struct LauncherRecord {
    address launcherFactory;
}

struct FieldDescriptor {
    string name;
    string fieldType;
    string description;
    uint8 decimals;
}

struct LauncherDataSchema {
    string description;
    FieldDescriptor[] fields;
    bool isArray;
}

struct VaultDataSchema {
    string description;
    FieldDescriptor[] fields;
    bool isArray;
}

struct ApproveAction {
    string tokenType;
    string amountFieldName;
}

struct VaultMethodSchema {
    string name;
    string description;
    FieldDescriptor[] inputs;
    FieldDescriptor[] outputs;
    ApproveAction[] approvals;
    bool isInputArray;
    bool isOutputArray;
    bool isWriteMethod;
}

struct VaultUISchema {
    string vaultType;
    string description;
    VaultMethodSchema[] methods;
}

struct FactoryPolicy {
    string target;
    string operator;
    bytes value;
    string description;
}

// The declared-creator extension: the launch event names the person who
// created the Launcher rather than the Launcher contract.
bytes32 constant CREATOR_EXTENSION_ID = keccak256("flap.extension.creator.v1");

interface IFlapPortal {
    function SALT_LOCK_FEE() external view returns (uint256);
    function lockSalt(bytes32 salt, uint8 kind) external payable;
    function launchTaxTokenV2(
        CreateTaxTokenParams calldata p,
        Distribution calldata distribution,
        CreatorBuyParams calldata creatorBuy
    ) external payable returns (address token, address pool);
    function newLauncher(address launcherFactory, bytes calldata data) external payable returns (address launcher);
    function getLauncher(address launcher) external view returns (LauncherRecord memory record);
    function getLaunchVault(address token) external view returns (address vault, address vaultFactory);
}

interface ILauncherFactory {
    function newLauncher(address creator, bytes calldata data) external payable returns (address launcher);
    function factorySpecVersion() external pure returns (string memory);
    function launcherDataSchema() external pure returns (LauncherDataSchema memory);
    function upgradeVaultImplementation(address newImplementation) external;
}

interface ILauncherDescription {
    function description() external view returns (string memory);
}

interface IStrategy {
    event FlapDistributionInitialized(address token, uint256 amount);

    function initializeDistribution(address token, uint256 amount, bytes calldata configData, bytes32 salt) external;
}

interface IDirectLaunchVaultFactory {
    function newVault(address token, address creator, uint8 launchKind, bytes calldata launchParams)
        external
        returns (address vault);
    function isQuoteTokenSupported(address quoteToken) external view returns (bool);
    function factorySpecVersion() external pure returns (string memory);
    function vaultDataSchema() external pure returns (VaultDataSchema memory);
    function tokenCreationPolicies() external view returns (FactoryPolicy[] memory);
    function upgradeVaultImplementation(address newImplementation) external;
}

interface IDirectLaunchVault {
    function description() external view returns (string memory);
    function vaultUISchema() external pure returns (VaultUISchema memory);
}
