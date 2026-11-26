// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    IOpenFourMigrateModule,
    MigrateContext,
    MigrateHookContext,
    MigrateResult,
    Phase
} from "../interfaces/OpenFour.sol";

// Test doubles for Core, the vault, the token and a V2 pair. The mock Core asks
// evaluate() after every buy and runs executeMigration() in the same transaction,
// so a revert there reverts the buy; migrate(token) returns without migrating
// when evaluate() answers false.

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}

contract MockOpenFourToken is MockERC20 {
    address public immutable vault;
    address public immutable migrateModule;
    uint256 public immutable maxSupply;
    mapping(address => bool) public migratedPools;

    constructor(uint256 maxSupply_, address vault_, address migrateModule_) MockERC20("Grand Prix Planner", "PLNR") {
        vault = vault_;
        migrateModule = migrateModule_;
        maxSupply = maxSupply_;
        _mint(vault_, maxSupply_);
    }

    function setMigratedPool(address pool, bool enabled) external {
        require(msg.sender == migrateModule, "Token: only migrate");
        migratedPools[pool] = enabled;
    }
}

contract MockVault {
    address public immutable fourCore;
    address public immutable quoteAsset;
    address public immutable migrateModule;
    address public token;
    uint8 public phase;
    uint256 public totalRaised;
    uint256 public initialSaleAmount;
    uint256 public remainingForSale;

    constructor(address quoteAsset_, uint256 saleAmount, address migrateModule_) {
        fourCore = msg.sender;
        quoteAsset = quoteAsset_;
        migrateModule = migrateModule_;
        initialSaleAmount = saleAmount;
        remainingForSale = saleAmount;
    }

    modifier onlyCore() {
        require(msg.sender == fourCore, "Vault: only fourCore");
        _;
    }

    modifier onlyMigrate() {
        require(msg.sender == migrateModule, "Vault: only migration module");
        _;
    }

    function bindToken(address token_) external onlyCore {
        token = token_;
    }

    function setPhase(uint8 phase_) external onlyCore {
        phase = phase_;
    }

    function onBuy(address trader, uint256 amount, uint256 quote) external onlyCore {
        remainingForSale -= amount;
        totalRaised += quote;
        MockERC20(token).transfer(trader, amount);
    }

    function isSoldOut() external view returns (bool) {
        return remainingForSale <= 1e18;
    }

    function soldAmount() external view returns (uint256) {
        return initialSaleAmount - remainingForSale;
    }

    function transferQuoteForMigration(address to, uint256 amount) external onlyMigrate {
        MockERC20(quoteAsset).transfer(to, amount);
    }

    function transferTokenForMigration(address to, uint256 amount) external onlyMigrate {
        MockERC20(token).transfer(to, amount);
    }
}

contract MockOpenFourCore {
    // Same member order as OpenFour's RuntimeConfig, so the public getter matches Core's.
    struct RuntimeConfig {
        uint32 version;
        address creator;
        uint256 presetId;
        address token;
        string name;
        string symbol;
        uint256 maxSupply;
        uint256 saleAmount;
        uint256 raiseAmount;
        address quoteAsset;
        address vault;
        address curveModule;
        address tradeModule;
        address migrateModule;
        address tokenModule;
        address customData;
        uint256 createBlock;
        bool exists;
        bool paused;
        bool antiSniperEnabled;
    }

    mapping(address => RuntimeConfig) public tokens;

    event TokenCreated(address indexed token, address vault, address migrateModule);
    event MigrateExecuted(address indexed token, address indexed caller, uint8 migratedDataVersion, bytes encodedMigratedData);

    function createToken(
        address implementation,
        bytes calldata migrateParams,
        uint256 maxSupply,
        uint256 saleAmount,
        address quoteAsset
    ) external returns (address token, address vault, address module) {
        module = _clone(implementation);
        vault = address(new MockVault(quoteAsset, saleAmount, module));
        token = address(new MockOpenFourToken(maxSupply, vault, module));
        MockVault(vault).bindToken(token);
        IOpenFourMigrateModule(module).init(token, address(this), address(0), migrateParams, "1.0.0");
        RuntimeConfig storage r = tokens[token];
        r.version = 1;
        r.creator = msg.sender;
        r.token = token;
        r.name = "Grand Prix Planner";
        r.symbol = "PLNR";
        r.maxSupply = maxSupply;
        r.saleAmount = saleAmount;
        r.quoteAsset = quoteAsset;
        r.vault = vault;
        r.migrateModule = module;
        r.createBlock = block.number;
        r.exists = true;
        MockVault(vault).setPhase(Phase.TRADING);
        emit TokenCreated(token, vault, module);
    }

    function buy(address token, uint256 amount, uint256 quote) external {
        RuntimeConfig storage r = tokens[token];
        MockVault vault = MockVault(r.vault);
        require(vault.phase() == Phase.TRADING, "Core: bad phase");
        MockERC20(r.quoteAsset).transferFrom(msg.sender, r.vault, quote);
        vault.onBuy(msg.sender, amount, quote);
        if (vault.isSoldOut()) vault.setPhase(Phase.SOLD_OUT);
        _tryMigrate(r);
    }

    function migrate(address token) external {
        RuntimeConfig storage r = tokens[token];
        uint8 phase = MockVault(r.vault).phase();
        require(phase == Phase.TRADING || phase == Phase.SOLD_OUT, "Core: bad phase");
        _tryMigrate(r);
    }

    /// @dev Calls executeMigration with a context the test chooses, as a faulty Core might.
    function executeWith(address token, MigrateHookContext calldata ctx, bytes calldata hookData) external {
        IOpenFourMigrateModule(tokens[token].migrateModule).executeMigration(ctx, hookData);
    }

    function _tryMigrate(RuntimeConfig storage r) internal {
        MockVault vault = MockVault(r.vault);
        MigrateResult memory res = IOpenFourMigrateModule(r.migrateModule).evaluate(
            MigrateContext(r.token, vault.totalRaised(), vault.remainingForSale(), vault.isSoldOut(), block.timestamp)
        );
        if (!res.canMigrate) return;
        vault.setPhase(Phase.MIGRATE_PENDING);
        (uint8 version, bytes memory data) = IOpenFourMigrateModule(r.migrateModule).executeMigration(
            MigrateHookContext(
                r.vault, r.token, r.quoteAsset, r.creator, vault.totalRaised(), vault.remainingForSale(), block.timestamp
            ),
            res.data
        );
        vault.setPhase(Phase.MIGRATED);
        emit MigrateExecuted(r.token, msg.sender, version, data);
    }

    /// @dev EIP-1167 minimal proxy, standing in for the Registry's per-token instance.
    function _clone(address implementation) internal returns (address instance) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "Core: clone failed");
    }
}

contract MockPancakePair is MockERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address public immutable token0;
    address public immutable token1;
    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address a, address b) MockERC20("Pancake LPs", "Cake-LP") {
        (token0, token1) = a < b ? (a, b) : (b, a);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 b0 = MockERC20(token0).balanceOf(address(this));
        uint256 b1 = MockERC20(token1).balanceOf(address(this));
        uint256 a0 = b0 - _reserve0;
        uint256 a1 = b1 - _reserve1;
        if (totalSupply == 0) {
            liquidity = _sqrt(a0 * a1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            uint256 l0 = (a0 * totalSupply) / _reserve0;
            uint256 l1 = (a1 * totalSupply) / _reserve1;
            liquidity = l0 < l1 ? l0 : l1;
        }
        require(liquidity > 0, "Pancake: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _reserve0 = uint112(b0);
        _reserve1 = uint112(b1);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

contract MockPancakeFactory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address a, address b) external returns (address pair) {
        require(getPair[a][b] == address(0), "Pancake: PAIR_EXISTS");
        pair = address(new MockPancakePair(a, b));
        getPair[a][b] = pair;
        getPair[b][a] = pair;
    }
}
