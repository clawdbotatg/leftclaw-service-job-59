// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { PvPWager } from "../contracts/PvPWager.sol";
import { MockCLAWD } from "../contracts/test/MockCLAWD.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract PvPWagerTest is Test {
    using MessageHashUtils for bytes32;

    PvPWager internal wager;
    MockCLAWD internal clawd;

    address internal owner = address(0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471);
    uint256 internal playerAKey = 0xA11CE;
    uint256 internal playerBKey = 0xB0B;
    address internal playerA;
    address internal playerB;
    address internal outsider = address(0xDEAD);

    uint256 internal constant WAGER = 1_000_000 ether;
    uint256 internal constant TIMEOUT = 1 days;

    event GameCreated(
        uint256 indexed gameId, address indexed playerA, uint8 gameType, uint256 wager, uint256 timeoutSeconds
    );
    event GameJoined(uint256 indexed gameId, address indexed playerB);
    event MoveMade(uint256 indexed gameId, address indexed player, string move);
    event ForfeitClaimed(uint256 indexed gameId, address indexed claimer);
    event ResultSubmitted(uint256 indexed gameId, address indexed winner);
    event DisputeResolved(uint256 indexed gameId, address indexed winner);
    event GameCancelled(uint256 indexed gameId);
    event GameComplete(uint256 indexed gameId, address indexed winner, uint256 payout, uint256 burnAmount);

    function setUp() public {
        playerA = vm.addr(playerAKey);
        playerB = vm.addr(playerBKey);

        clawd = new MockCLAWD();
        wager = new PvPWager(address(clawd), owner);

        clawd.mint(playerA, 100_000_000 ether);
        clawd.mint(playerB, 100_000_000 ether);

        vm.prank(playerA);
        clawd.approve(address(wager), type(uint256).max);
        vm.prank(playerB);
        clawd.approve(address(wager), type(uint256).max);
    }

    // ---------- createGame ----------

    function test_CreateGame_EscrowsWagerAndEmits() public {
        uint256 balBefore = clawd.balanceOf(playerA);

        vm.expectEmit(true, true, false, true);
        emit GameCreated(0, playerA, 0, WAGER, TIMEOUT);

        vm.prank(playerA);
        uint256 gameId = wager.createGame(0, WAGER, TIMEOUT);

        assertEq(gameId, 0);
        assertEq(clawd.balanceOf(playerA), balBefore - WAGER);
        assertEq(clawd.balanceOf(address(wager)), WAGER);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.OPEN));
        assertEq(g.playerA, playerA);
        assertEq(g.wager, WAGER);
        assertEq(g.gameType, 0);
    }

    function test_CreateGame_RevertsOnInvalidGameType() public {
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidGameType.selector);
        wager.createGame(2, WAGER, TIMEOUT);
    }

    function test_CreateGame_RevertsOnZeroWager() public {
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidWager.selector);
        wager.createGame(0, 0, TIMEOUT);
    }

    function test_CreateGame_RevertsOnTimeoutTooShort() public {
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidTimeout.selector);
        wager.createGame(0, WAGER, 5 minutes);
    }

    function test_CreateGame_RevertsOnTimeoutTooLong() public {
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidTimeout.selector);
        wager.createGame(0, WAGER, 365 days);
    }

    // ---------- joinGame ----------

    function test_JoinGame_ActivatesAndEscrows() public {
        vm.prank(playerA);
        uint256 gameId = wager.createGame(1, WAGER, TIMEOUT);

        vm.expectEmit(true, true, false, true);
        emit GameJoined(gameId, playerB);

        vm.prank(playerB);
        wager.joinGame(gameId);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.ACTIVE));
        assertEq(g.playerB, playerB);
        assertEq(g.currentTurn, playerA);
        assertEq(clawd.balanceOf(address(wager)), WAGER * 2);
    }

    function test_JoinGame_RevertsIfSelf() public {
        vm.prank(playerA);
        uint256 gameId = wager.createGame(0, WAGER, TIMEOUT);

        vm.prank(playerA);
        vm.expectRevert(PvPWager.CannotSelfJoin.selector);
        wager.joinGame(gameId);
    }

    function test_JoinGame_RevertsIfNotOpen() public {
        uint256 gameId = _activeGame();
        vm.prank(outsider);
        clawd.mint(outsider, WAGER);
        vm.startPrank(outsider);
        clawd.approve(address(wager), type(uint256).max);
        vm.expectRevert(PvPWager.InvalidStatus.selector);
        wager.joinGame(gameId);
        vm.stopPrank();
    }

    // ---------- recordMove ----------

    function test_RecordMove_FlipsTurnAndEmits() public {
        uint256 gameId = _activeGame();

        vm.expectEmit(true, true, false, true);
        emit MoveMade(gameId, playerA, "e2e4");

        vm.prank(playerA);
        wager.recordMove(gameId, "e2e4");

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(g.currentTurn, playerB);
        assertEq(g.lastMoveTime, block.timestamp);

        vm.prank(playerB);
        wager.recordMove(gameId, "e7e5");
        g = wager.getGame(gameId);
        assertEq(g.currentTurn, playerA);
    }

    function test_RecordMove_RevertsIfNotYourTurn() public {
        uint256 gameId = _activeGame();
        vm.prank(playerB);
        vm.expectRevert(PvPWager.NotYourTurn.selector);
        wager.recordMove(gameId, "e7e5");
    }

    function test_RecordMove_RevertsIfNotActive() public {
        vm.prank(playerA);
        uint256 gameId = wager.createGame(0, WAGER, TIMEOUT);
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidStatus.selector);
        wager.recordMove(gameId, "e2e4");
    }

    // ---------- claimForfeit ----------

    function test_ClaimForfeit_PaysWaitingPlayer() public {
        uint256 gameId = _activeGame();

        // It is A's turn; B is waiting. Jump past the timeout window.
        vm.warp(block.timestamp + TIMEOUT + 1);

        uint256 balB = clawd.balanceOf(playerB);

        vm.expectEmit(true, true, false, true);
        emit ForfeitClaimed(gameId, playerB);

        vm.prank(playerB);
        wager.claimForfeit(gameId);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.COMPLETE));
        assertEq(g.winner, playerB);

        uint256 pot = WAGER * 2;
        uint256 burned = (pot * 1000) / 10000;
        uint256 payout = pot - burned;
        assertEq(clawd.balanceOf(playerB), balB + payout);
        assertEq(clawd.balanceOf(address(wager)), 0);
        assertEq(g.burnAmount, burned);
    }

    function test_ClaimForfeit_RevertsIfYourTurn() public {
        uint256 gameId = _activeGame();
        vm.warp(block.timestamp + TIMEOUT + 1);
        vm.prank(playerA);
        vm.expectRevert(PvPWager.YourTurn.selector);
        wager.claimForfeit(gameId);
    }

    function test_ClaimForfeit_RevertsBeforeTimeout() public {
        uint256 gameId = _activeGame();
        vm.prank(playerB);
        vm.expectRevert(PvPWager.NotTimedOut.selector);
        wager.claimForfeit(gameId);
    }

    function test_ClaimForfeit_RevertsIfNotPlayer() public {
        uint256 gameId = _activeGame();
        vm.warp(block.timestamp + TIMEOUT + 1);
        vm.prank(outsider);
        vm.expectRevert(PvPWager.NotAPlayer.selector);
        wager.claimForfeit(gameId);
    }

    // ---------- submitResult ----------

    function test_SubmitResult_PaysWinnerOnCosignedOutcome() public {
        uint256 gameId = _activeGame();

        bytes memory sigA = _signResult(playerAKey, gameId, playerA);
        bytes memory sigB = _signResult(playerBKey, gameId, playerA);

        uint256 balA = clawd.balanceOf(playerA);

        vm.expectEmit(true, true, false, true);
        emit ResultSubmitted(gameId, playerA);

        vm.prank(playerB); // either party may submit
        wager.submitResult(gameId, playerA, sigA, sigB);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.COMPLETE));
        assertEq(g.winner, playerA);

        uint256 pot = WAGER * 2;
        uint256 burned = (pot * 1000) / 10000;
        assertEq(clawd.balanceOf(playerA), balA + pot - burned);
    }

    function test_SubmitResult_RevertsOnBadWinner() public {
        uint256 gameId = _activeGame();
        bytes memory sigA = _signResult(playerAKey, gameId, outsider);
        bytes memory sigB = _signResult(playerBKey, gameId, outsider);
        vm.expectRevert(PvPWager.InvalidWinner.selector);
        wager.submitResult(gameId, outsider, sigA, sigB);
    }

    function test_SubmitResult_RevertsOnBadSigA() public {
        uint256 gameId = _activeGame();
        bytes memory badSigA = _signResult(0xBAD, gameId, playerA);
        bytes memory sigB = _signResult(playerBKey, gameId, playerA);
        vm.expectRevert(PvPWager.InvalidSignature.selector);
        wager.submitResult(gameId, playerA, badSigA, sigB);
    }

    function test_SubmitResult_RevertsOnBadSigB() public {
        uint256 gameId = _activeGame();
        bytes memory sigA = _signResult(playerAKey, gameId, playerA);
        bytes memory badSigB = _signResult(0xBAD, gameId, playerA);
        vm.expectRevert(PvPWager.InvalidSignature.selector);
        wager.submitResult(gameId, playerA, sigA, badSigB);
    }

    function test_SubmitResult_RevertsOnCrossGameReplay() public {
        uint256 gameA = _activeGame();
        uint256 gameB = _activeGame();

        // Sigs for gameA should not work on gameB.
        bytes memory sigA = _signResult(playerAKey, gameA, playerA);
        bytes memory sigB = _signResult(playerBKey, gameA, playerA);

        vm.expectRevert(PvPWager.InvalidSignature.selector);
        wager.submitResult(gameB, playerA, sigA, sigB);
    }

    // ---------- resolveDispute ----------

    function test_ResolveDispute_OwnerSettles() public {
        uint256 gameId = _activeGame();

        vm.expectEmit(true, true, false, true);
        emit DisputeResolved(gameId, playerB);

        vm.prank(owner);
        wager.resolveDispute(gameId, playerB);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.COMPLETE));
        assertEq(g.winner, playerB);
    }

    function test_ResolveDispute_RevertsForNonOwner() public {
        uint256 gameId = _activeGame();
        vm.prank(playerA);
        vm.expectRevert();
        wager.resolveDispute(gameId, playerA);
    }

    function test_ResolveDispute_RevertsOnInvalidWinner() public {
        uint256 gameId = _activeGame();
        vm.prank(owner);
        vm.expectRevert(PvPWager.InvalidWinner.selector);
        wager.resolveDispute(gameId, outsider);
    }

    // ---------- cancelGame ----------

    function test_CancelGame_RefundsPlayerA() public {
        vm.prank(playerA);
        uint256 gameId = wager.createGame(0, WAGER, TIMEOUT);

        uint256 balA = clawd.balanceOf(playerA);

        vm.expectEmit(true, false, false, true);
        emit GameCancelled(gameId);

        vm.prank(playerA);
        wager.cancelGame(gameId);

        PvPWager.Game memory g = wager.getGame(gameId);
        assertEq(uint8(g.status), uint8(PvPWager.GameStatus.CANCELLED));
        assertEq(clawd.balanceOf(playerA), balA + WAGER);
    }

    function test_CancelGame_RevertsIfNotPlayerA() public {
        vm.prank(playerA);
        uint256 gameId = wager.createGame(0, WAGER, TIMEOUT);
        vm.prank(outsider);
        vm.expectRevert(PvPWager.NotAPlayer.selector);
        wager.cancelGame(gameId);
    }

    function test_CancelGame_RevertsOnceJoined() public {
        uint256 gameId = _activeGame();
        vm.prank(playerA);
        vm.expectRevert(PvPWager.InvalidStatus.selector);
        wager.cancelGame(gameId);
    }

    // ---------- burn + payout math ----------

    function test_Settlement_BurnsTenPercent() public {
        uint256 gameId = _activeGame();
        uint256 supplyBefore = clawd.totalSupply();

        vm.warp(block.timestamp + TIMEOUT + 1);
        vm.prank(playerB);
        wager.claimForfeit(gameId);

        uint256 pot = WAGER * 2;
        uint256 expectedBurn = pot / 10;
        assertEq(clawd.totalSupply(), supplyBefore - expectedBurn);
    }

    // ---------- views ----------

    function test_Views_OpenAndActiveAndPlayer() public {
        vm.prank(playerA);
        uint256 g0 = wager.createGame(0, WAGER, TIMEOUT);
        vm.prank(playerA);
        uint256 g1 = wager.createGame(1, WAGER, TIMEOUT);
        vm.prank(playerB);
        wager.joinGame(g0);

        uint256[] memory open = wager.openGames();
        assertEq(open.length, 1);
        assertEq(open[0], g1);

        uint256[] memory activeA = wager.activeGames(playerA);
        assertEq(activeA.length, 1);
        assertEq(activeA[0], g0);

        uint256[] memory participantA = wager.playerGames(playerA);
        assertEq(participantA.length, 2);
    }

    function test_ResultDigest_MatchesOffchainHash() public view {
        uint256 gameId = 42;
        bytes32 expected = keccak256(abi.encodePacked(gameId, playerA)).toEthSignedMessageHash();
        assertEq(wager.resultDigest(gameId, playerA), expected);
    }

    function test_Constructor_RevertsOnZeroClawd() public {
        vm.expectRevert(bytes("zero clawd"));
        new PvPWager(address(0), owner);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        // Ownable's own check fires — we only assert it reverts.
        vm.expectRevert();
        new PvPWager(address(clawd), address(0));
    }

    // ---------- helpers ----------

    function _activeGame() internal returns (uint256 gameId) {
        vm.prank(playerA);
        gameId = wager.createGame(0, WAGER, TIMEOUT);
        vm.prank(playerB);
        wager.joinGame(gameId);
    }

    function _signResult(uint256 pk, uint256 gameId, address winner) internal pure returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(gameId, winner)).toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
