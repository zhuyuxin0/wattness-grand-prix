// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ABI-compatible declarations of the OpenFour structures and calls this module
// uses. Field order and types follow the public OpenFour interfaces; the
// declarations themselves are written here.

struct MigrateContext {
    address token;
    uint256 totalRaised;
    uint256 remainingForSale;
    bool soldOut;
    uint256 timestamp;
}

struct MigrateResult {
    bool canMigrate;
    bytes data;
    string reason;
}

struct MigrateHookContext {
    address vault;
    address token;
    address quoteAsset;
    address creator;
    uint256 totalRaised;
    uint256 remainingForSale;
    uint256 timestamp;
}

struct ParamDescriptor {
    string name;
    string abiType;
    uint8 decimals;
    bool optional;
    string title;
    string defaultValue;
    string hint;
    string minValue;
    string maxValue;
}

struct ModuleEncodeSchema {
    string kind;
    uint8 version;
    ParamDescriptor[] params;
}

/// @dev Vault phases, in the protocol's enum order.
library Phase {
    uint8 internal constant CREATED = 0;
    uint8 internal constant TRADING = 1;
    uint8 internal constant MIGRATE_PENDING = 2;
    uint8 internal constant MIGRATED = 3;
    uint8 internal constant TERMINAL = 4;
    uint8 internal constant SOLD_OUT = 5;
}

interface IOpenFourMigrateModule {
    function init(address token, address fourCore, address feeRouter, bytes calldata params, string calldata moduleVersion)
        external;
    function evaluate(MigrateContext calldata ctx) external view returns (MigrateResult memory);
    function executeMigration(MigrateHookContext calldata ctx, bytes calldata hookData)
        external
        returns (uint8 migratedDataVersion, bytes memory encodedMigratedData);
    function getInitParams() external view returns (bytes memory);
    function descriptor() external view returns (bytes8 tagId, string memory tag, string memory version);
}

interface IOpenFourModuleSchema {
    function moduleEncodeSchema() external pure returns (ModuleEncodeSchema memory);
}

interface IOpenFourCoreMigrate {
    function migrate(address token) external;
}

interface IOpenFourVaultView {
    function token() external view returns (address);
    function quoteAsset() external view returns (address);
    function phase() external view returns (uint8);
    function totalRaised() external view returns (uint256);
    function remainingForSale() external view returns (uint256);
    function soldAmount() external view returns (uint256);
    function isSoldOut() external view returns (bool);
    function transferQuoteForMigration(address to, uint256 amount) external;
    function transferTokenForMigration(address to, uint256 amount) external;
}

interface IOpenFourTokenView {
    function vault() external view returns (address);
    function maxSupply() external view returns (uint256);
    function migrateModule() external view returns (address);
    function setMigratedPool(address pool, bool enabled) external;
}

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

interface IPancakeV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPancakeV2Pair {
    function totalSupply() external view returns (uint256);
    function mint(address to) external returns (uint256 liquidity);
}
