// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {GateRecord} from "@gatelock/contracts/contracts/GateRecord.sol";
import {
    CreateTaxTokenParams,
    CreatorBuyParams,
    Distribution,
    DistributionTarget,
    FeeConfigVault,
    FeeSlotType,
    IDirectLaunchVaultFactory,
    ILauncherDescription,
    ILauncherFactory,
    IStrategy,
    LauncherRecord
} from "../FlapPoolLaunch.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract MockTaxToken is MockERC20 {
    constructor() MockERC20("Season", "PRIX") {}
}

/// Stands in for the Pool Launch Portal: the same call order (vault factory
/// before the token exists, then the pool, then the reserve to the strategy),
/// the salt-lock and one-launch rules, and a tax dispatch that pings the fee
/// recipient the way the tax processor does.
contract MockPortal {
    uint256 public constant SALT_LOCK_FEE = 0.005 ether;

    mapping(bytes32 salt => address locker) public saltLocker;
    mapping(address launcher => LauncherRecord) internal _launchers;
    mapping(address launcher => bool) public hasLaunched;
    mapping(address token => address) public taxRecipient;
    mapping(address token => address) internal _vault;
    mapping(address token => address) internal _vaultFactory;
    address public lastPool;

    event FlapNewLauncherCreated(address launcher, address launcherFactory, address creator, string description);

    function lockSalt(bytes32 salt, uint8) external payable {
        require(msg.value == SALT_LOCK_FEE, "fee");
        require(saltLocker[salt] == address(0), "locked");
        saltLocker[salt] = msg.sender;
    }

    function newLauncher(address factory, bytes calldata data) external payable returns (address launcher) {
        launcher = ILauncherFactory(factory).newLauncher{value: msg.value}(msg.sender, data);
        require(launcher.code.length != 0 && _launchers[launcher].launcherFactory == address(0), "launcher");
        _launchers[launcher] = LauncherRecord(factory);
        emit FlapNewLauncherCreated(launcher, factory, msg.sender, ILauncherDescription(launcher).description());
    }

    function getLauncher(address launcher) external view returns (LauncherRecord memory) {
        return _launchers[launcher];
    }

    function getLaunchVault(address token) external view returns (address vault, address vaultFactory) {
        return (_vault[token], _vaultFactory[token]);
    }

    function predictToken(bytes32 salt) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(type(MockTaxToken).creationCode)));
        return address(uint160(uint256(h)));
    }

    function launchTaxTokenV2(CreateTaxTokenParams calldata p, Distribution calldata d, CreatorBuyParams calldata)
        external
        payable
        returns (address token, address pool)
    {
        require(saltLocker[p.salt] == msg.sender, "salt");
        require(!hasLaunched[msg.sender], "launched");
        require(msg.value == 0 && p.quoteToken != address(0), "erc20 quote only");
        hasLaunched[msg.sender] = true;

        address predicted = predictToken(p.salt);
        address recipient;
        for (uint256 i; i < p.feeConfigs.length; ++i) {
            if (p.feeConfigs[i].feeType == FeeSlotType.VAULT) {
                FeeConfigVault memory v = abi.decode(p.feeConfigs[i].configData, (FeeConfigVault));
                recipient = IDirectLaunchVaultFactory(v.vaultFactory).newVault(predicted, msg.sender, 0, abi.encode(p, d));
                _vault[predicted] = recipient;
                _vaultFactory[predicted] = v.vaultFactory;
            } else if (p.feeConfigs[i].feeType == FeeSlotType.MARKETING) {
                recipient = abi.decode(p.feeConfigs[i].configData, (address));
            }
        }

        token = address(new MockTaxToken{salt: p.salt}());
        require(token == predicted, "prediction");
        taxRecipient[token] = recipient;
        MockERC20(token).mint(address(this), p.totalSupply);

        pool = address(uint160(uint256(keccak256(abi.encode(token, p.quoteToken)))));
        lastPool = pool;
        require(MockERC20(p.quoteToken).transferFrom(msg.sender, pool, p.poolQuote), "quote");
        require(MockERC20(token).transfer(pool, p.poolToken), "pool");

        require(d.target == DistributionTarget.EXPLICIT && d.amount == p.totalSupply - p.poolToken, "distribution");
        MockERC20(token).approve(d.strategy, d.amount);
        IStrategy(d.strategy).initializeDistribution(token, d.amount, d.configData, p.salt);
        require(MockERC20(token).balanceOf(address(this)) == 0, "remainder");
    }

    /// The tax processor's ERC20 dispatch: a transfer, then an empty call.
    function dispatchTax(address token, address quote, uint256 amount) external {
        address to = taxRecipient[token];
        require(MockERC20(quote).transferFrom(msg.sender, to, amount), "tax");
        (bool ok,) = to.call("");
        ok;
    }
}

/// Exposes the workspace GateRecord to this package's tests.
contract TestGateRecord is GateRecord {}
