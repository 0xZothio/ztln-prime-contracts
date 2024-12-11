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
 * @title ZTLNPrime
 * @dev Represents a fund with offchain custodian and NAV with a whitelisted set of holders.
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

    // Price of each share in the fund in 1e8 precision
    uint256 public price;
    address public _custodian;
    IKycManager public _kycManager;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////
    // Init
    ////////////////////////////////////////////////////////////

    /**
     * @dev Initializes the contract with the given parameters.
     * @param owner Address of the owner.
     * @param operator Address of the operator.
     * @param custodian Address of the custodian.
     * @param kycManager Address of the KYC manager.
     */
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

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * @return uint8 Number of decimals.
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    ////////////////////////////////////////////////////////////
    // Admin functions: Setting addresses
    ////////////////////////////////////////////////////////////

    /**
     * @dev Sets the custodian address.
     * @param newAddress New address of the custodian.
     */
    function setCustodian(address newAddress) external onlyAdmin {
        _custodian = newAddress;
        emit SetCustodian(newAddress);
    }

    /**
     * @dev Sets the KYC manager address.
     * @param kycManager New address of the KYC manager.
     */
    function setKycManager(address kycManager) external onlyAdmin {
        _kycManager = IKycManager(kycManager);
        emit SetKycManager(kycManager);
    }

    ////////////////////////////////////////////////////////////
    // Admin/Operator functions
    ////////////////////////////////////////////////////////////

    /**
     * @dev Sets the price of the fund.
     * @param newPrice New price of the fund.
     */
    function setPrice(uint256 newPrice) external onlyAdminOrOperator {
        price = newPrice;
        emit SetPrice(newPrice);
    }

    /**
     * @dev Pauses the contract.
     */
    function pause() external onlyAdminOrOperator {
        _pause();
    }

    /**
     * @dev Unpauses the contract.
     */
    function unpause() external onlyAdminOrOperator {
        _unpause();
    }

    /**
     * @dev Transfers assets from vault to investor and burns shares.
     * @param investor Address of the investor.
     * @param asset Address of the asset.
     * @param amount Amount of the asset.
     * @param shares Amount of shares to burn.
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
     * @dev Sweeps all asset to {_custodian}.
     * @param asset Address of the asset.
     */
    function transferAllToCustodian(address asset) external onlyAdminOrOperator {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        transferToCustodian(asset, balance);
    }

    /**
     * @dev Transfers asset to {_custodian}.
     * @param asset Address of the asset.
     * @param amount Amount of the asset.
     */
    function transferToCustodian(address asset, uint256 amount) public onlyAdminOrOperator {
        if (_custodian == address(0)) {
            revert InvalidAddress(_custodian);
        }

        IERC20(asset).safeTransfer(_custodian, amount);
        emit TransferToCustodian(_custodian, asset, amount);
    }

    /**
     * @dev Issues fund tokens to the user.
     * @param user Address of the user.
     * @param amount Amount of tokens to mint.
     */
    function mint(address user, uint256 amount) external onlyAdminOrOperator {
        _mint(user, amount);
    }

    /**
     * @dev Burns fund tokens from the user.
     * @param user Address of the user.
     * @param amount Amount of tokens to burn.
     */
    function burnFrom(address user, uint256 amount) external onlyAdminOrOperator {
        _burn(user, amount);
    }

    ////////////////////////////////////////////////////////////
    // Public entrypoints
    ////////////////////////////////////////////////////////////

    /**
     * @dev Request a subscription to the fund.
     * @param asset Asset to deposit.
     * @param amount Amount of {asset} to subscribe.
     * @return uint256 Amount of shares issued.
     */
    function deposit(
        address asset,
        uint256 amount
    ) public nonReentrant whenNotPaused returns (uint256) {
        _kycManager.onlyKyc(msg.sender);
        _kycManager.onlyNotBanned(msg.sender);

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // scale amount to 6 decimals
        uint256 scaled_amount = (amount * 1e6) / 10 ** ERC20(asset).decimals();

        uint256 shares = (scaled_amount * 1e8) / price;

        _mint(msg.sender, shares);

        emit Deposit(msg.sender, asset, amount, shares);
        return shares;
    }

    /**
     * @dev Request redemption of exact shares.
     * @param shares Amount of shares to redeem.
     * @param asset Underlying asset to receive.
     * @return uint256 Amount of underlying asset to receive.
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
     * @dev Applies KYC checks on transfers. Sender/receiver cannot be banned.
     * If strict, check both sender/receiver.
     * If sender is US, check receiver.
     * @param from Address of the sender.
     * @param to Address of the receiver.
     * @param amount Amount of tokens to transfer.
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

    /**
     * @dev Detects transfer restriction.
     * @param from Address of the sender.
     * @param to Address of the receiver.
     * @return restrictionCode uint8 Restriction code.
     */
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

    /**
     * @notice Authorizes an upgrade to a new implementation.
     * @dev This function is called by the upgrade mechanism to ensure that the caller has the appropriate permissions.
     *      Only an account with the admin role can authorize an upgrade to a new implementation.
     *      This function helps to ensure the security and integrity of the contract by restricting who can perform upgrades.
     * @param newImplementation Address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}
}
