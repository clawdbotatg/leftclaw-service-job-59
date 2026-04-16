//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { PvPWager } from "../contracts/PvPWager.sol";
import { MockCLAWD } from "../contracts/test/MockCLAWD.sol";

/// @notice Production deploy script.
/// @dev `vm.startBroadcast()` runs with NO arguments — the build worker supplies
///      the deployer key via the `--private-key` CLI flag. On Base (8453) the
///      real CLAWD token address is used; on every other chain a MockCLAWD is
///      deployed so local dev and test environments have a functioning token.
contract DeployScript is ScaffoldETHDeploy {
    // All owner/admin roles must route to the client wallet.
    address internal constant CLIENT_OWNER = 0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471;

    // Live CLAWD token on Base mainnet (per PLAN.md).
    uint256 internal constant BASE_CHAIN_ID = 8453;
    address internal constant CLAWD_ON_BASE = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    // Mock mint amount for local dev: 1 billion CLAWD to the deployer.
    uint256 internal constant LOCAL_MINT_AMOUNT = 1_000_000_000 ether;

    function run() external ScaffoldEthDeployerRunner {
        address clawdAddress;

        if (block.chainid == BASE_CHAIN_ID) {
            clawdAddress = CLAWD_ON_BASE;
        } else {
            MockCLAWD mock = new MockCLAWD();
            mock.mint(deployer, LOCAL_MINT_AMOUNT);
            clawdAddress = address(mock);
            deployments.push(Deployment({ name: "CLAWD", addr: clawdAddress }));
        }

        PvPWager wager = new PvPWager(clawdAddress, CLIENT_OWNER);
        deployments.push(Deployment({ name: "PvPWager", addr: address(wager) }));
    }
}
