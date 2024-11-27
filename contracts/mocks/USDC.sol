// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import 'lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol';

contract USDC is ERC20 {
    constructor() ERC20('USDC TEST', 'USDC') {
        _mint(msg.sender, 100_000_000 * 10 ** decimals());
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
