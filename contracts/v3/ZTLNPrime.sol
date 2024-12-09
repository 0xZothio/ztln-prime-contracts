// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './interfaces/IFundVaultEventsV3.sol';
import '../interfaces/IKycManager.sol';
import '../utils/ERC1404.sol';
import '../utils/upgrades/AdminOperatorRolesUpgradeable.sol';

/**
 * Represents a fund with offchain custodian and NAV with a whitelisted set of holders
 *
 * Roles:
 * - Investors who can subscribe/redeem the fund
 * - Operators who manage day-to-day operations
 * - Admins who can handle operator tasks and change addresses
 *
 * ## Operator Workflow
 * - Call {processDeposit} after a deposit request is approved to move funds to vault
 * - Call {transferAllToCustodian} after funds are received to send to offchain custodian
 * - Call {processRedemption} after a redemption request is approved to disburse underlying funds to investor
 */
contract ZTLNPrime is
    Initializable,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AdminOperatorRolesUpgradeable,
    ERC1404,
    UUPSUpgradeable,
    IFundVaultEventsV3
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public _latestNav;
    address public _custodian;
    IKycManager public _kycManager;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////
    // Init
    ////////////////////////////////////////////////////////////

    function initialize(
        address owner,
        address operator,
        address custodian,
        IKycManager kycManager
    ) public initializer {
        __ERC20_init('Zoth Tokenized Liquid Notes Prime', 'ZTLN-P');
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, owner);
        _grantRole(OPERATOR_ROLE, operator);
        _setRoleAdmin(OPERATOR_ROLE, DEFAULT_ADMIN_ROLE);

        _custodian = custodian;
        _kycManager = kycManager;
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    ////////////////////////////////////////////////////////////
    // Admin functions: Setting addresses
    ////////////////////////////////////////////////////////////

    function setCustodian(address newAddress) external onlyAdmin {
        _custodian = newAddress;
        emit SetCustodian(newAddress);
    }

    function setKycManager(address kycManager) external onlyAdmin {
        _kycManager = IKycManager(kycManager);
        emit SetKycManager(kycManager);
    }

    ////////////////////////////////////////////////////////////
    // Admin/Operator functions
    ////////////////////////////////////////////////////////////

    function pause() external onlyAdminOrOperator {
        _pause();
    }

    function unpause() external onlyAdminOrOperator {
        _unpause();
    }

    /**
     * Call after each NAV update has been published, in order to update {_latestNav}.
     */
    function setFundNav(uint256 nav) external onlyAdminOrOperator {
        _latestNav = nav;
        emit SetFundNav(nav);
    }

    /**
     * Transfers assets from vault to investor and burns shares
     */
    function processRedemption(
        address investor,
        address asset,
        uint256 amount,
        uint256 shares
    ) external onlyAdminOrOperator {
        _burn(address(this), shares);
        IERC20(asset).safeTransfer(investor, amount);

        emit ProcessRedemption(investor, shares, asset, amount);
    }

    /**
     * Sweeps all asset to {_custodian}
     */
    function transferAllToCustodian(address asset) external onlyAdminOrOperator {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        transferToCustodian(asset, balance);
    }

    /**
     * Transfers asset to {_custodian}.
     */
    function transferToCustodian(address asset, uint256 amount) public onlyAdminOrOperator {
        if (_custodian == address(0)) {
            revert InvalidAddress(_custodian);
        }

        IERC20(asset).safeTransfer(_custodian, amount);
        emit TransferToCustodian(_custodian, asset, amount);
    }

    /**
     * Issues fund tokens to the user.
     */
    function mint(address user, uint256 amount) external onlyAdminOrOperator {
        _mint(user, amount);
    }

    /**
     * Burns fund tokens from the user.
     */
    function burnFrom(address user, uint256 amount) external onlyAdminOrOperator {
        _burn(user, amount);
    }

    ////////////////////////////////////////////////////////////
    // Public entrypoints
    ////////////////////////////////////////////////////////////

    /**
     * Request a subscription to the fund
     * @param asset Asset to deposit
     * @param amount Amount of {asset} to subscribe
     */
    function deposit(
        address asset,
        uint256 amount
    ) public nonReentrant whenNotPaused returns (uint256) {
        _kycManager.onlyKyc(msg.sender);
        _kycManager.onlyNotBanned(msg.sender);

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // scale amount to 6 decimals
        uint256 shares = (amount * 1e6) / 10 ** ERC20(asset).decimals();

        _mint(msg.sender, shares);

        emit Deposit(msg.sender, asset, amount, shares);
        return 0;
    }

    /**
     * Request redemption of exact shares
     * @param shares Amount of shares to redeem
     * @param asset Underlying asset to receive
     */
    function redeem(
        uint256 shares,
        address asset
    ) public nonReentrant whenNotPaused returns (uint256) {
        _kycManager.onlyKyc(msg.sender);
        _kycManager.onlyNotBanned(msg.sender);

        IERC20(address(this)).safeTransferFrom(msg.sender, address(this), shares);

        emit RequestRedemption(msg.sender, shares, asset);
        return 0;
    }

    /**
     * Applies KYC checks on transfers. Sender/receiver cannot be banned.
     * If strict, check both sender/receiver.
     * If sender is US, check receiver.
     * @dev will be called during: transfer, transferFrom, mint, burn
     */
    function _update(address from, address to, uint256 amount) internal override {
        // no restrictions on minting or burning, or self-transfers
        if (from == address(0) || to == address(0) || to == address(this)) {
            return super._update(from, to, amount);
        } else {
            uint8 restrictionCode = detectTransferRestriction(from, to, 0);
            require(
                restrictionCode == SUCCESS_CODE,
                messageForTransferRestriction(restrictionCode)
            );
            super._update(from, to, amount);
        }
    }

    ////////////////////////////////////////////////////////////
    // ERC-1404 Overrides
    ////////////////////////////////////////////////////////////

    function detectTransferRestriction(
        address from,
        address to,
        uint256 /*value*/
    ) public view override returns (uint8 restrictionCode) {
        if (_kycManager.isBanned(from)) return REVOKED_OR_BANNED_CODE;
        else if (_kycManager.isBanned(to)) return REVOKED_OR_BANNED_CODE;

        if (_kycManager.isStrict()) {
            if (!_kycManager.isKyc(from)) return DISALLOWED_OR_STOP_CODE;
            else if (!_kycManager.isKyc(to)) return DISALLOWED_OR_STOP_CODE;
        } else if (_kycManager.isUSKyc(from)) {
            if (!_kycManager.isKyc(to)) return DISALLOWED_OR_STOP_CODE;
        }
        return SUCCESS_CODE;
    }

    ////////////////////////////////////////////////////////////
    // Upgrade functionality
    ////////////////////////////////////////////////////////////

    /// @notice Authorizes an upgrade to a new implementation
    /// @dev Only callable by admin role
    /// @param newImplementation Address of the new implementation
    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}
}
