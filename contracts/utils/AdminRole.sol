// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import 'openzeppelin-contracts/access/AccessControl.sol';

abstract contract AdminRole is AccessControl {
    modifier onlyAdmin() {
        hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _;
    }
}
