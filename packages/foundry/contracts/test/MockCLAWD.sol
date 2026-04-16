// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only mock that mimics CLAWD but permits transfers to address(0)
///         so the PvPWager burn path can execute in local and test environments.
///         Transfers to zero decrement totalSupply via _update — a real burn.
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD Mock", "CLAWD") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _update(_msgSender(), to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, _msgSender(), value);
        _update(from, to, value);
        return true;
    }
}
