// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title PvPWager — CLAWD-wagered Chess and Checkers escrow
/// @notice Escrows CLAWD for 1v1 games. Winner gets 90% of the pot, 10% is burned.
///         Game logic lives off-chain; the contract only enforces timeouts, co-signed
///         outcomes, and owner-arbitrated disputes.
contract PvPWager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;

    enum GameStatus {
        OPEN,
        ACTIVE,
        COMPLETE,
        CANCELLED
    }

    struct Game {
        uint256 gameId;
        uint8 gameType; // 0 = chess, 1 = checkers
        GameStatus status;
        address playerA;
        address playerB;
        address currentTurn;
        address winner;
        uint256 wager;
        uint256 timeout;
        uint256 lastMoveTime;
        uint256 burnAmount;
    }

    IERC20 public immutable clawd;

    // Spec: pot * 10 / 100 burned.
    uint256 public constant BURN_BPS = 1_000;
    uint256 public constant BPS_DENOM = 10_000;

    // Sanity bounds so a player can't lock funds with a ridiculous timeout.
    uint256 public constant MIN_TIMEOUT = 1 hours;
    uint256 public constant MAX_TIMEOUT = 30 days;

    // Spec: burn target is address(0).
    address public constant BURN_ADDRESS = address(0);

    Game[] private _games;

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

    error InvalidGameType();
    error InvalidWager();
    error InvalidTimeout();
    error InvalidStatus();
    error NotAPlayer();
    error CannotSelfJoin();
    error NotYourTurn();
    error YourTurn();
    error NotTimedOut();
    error InvalidWinner();
    error InvalidSignature();

    constructor(address clawdToken, address initialOwner) Ownable(initialOwner) {
        // Ownable already reverts if initialOwner is the zero address.
        require(clawdToken != address(0), "zero clawd");
        clawd = IERC20(clawdToken);
    }

    // ---------- mutating ----------

    function createGame(uint8 gameType, uint256 wager, uint256 timeoutSeconds)
        external
        nonReentrant
        returns (uint256 gameId)
    {
        if (gameType > 1) revert InvalidGameType();
        if (wager == 0) revert InvalidWager();
        if (timeoutSeconds < MIN_TIMEOUT || timeoutSeconds > MAX_TIMEOUT) revert InvalidTimeout();

        gameId = _games.length;
        _games.push(
            Game({
                gameId: gameId,
                gameType: gameType,
                status: GameStatus.OPEN,
                playerA: msg.sender,
                playerB: address(0),
                currentTurn: address(0),
                winner: address(0),
                wager: wager,
                timeout: timeoutSeconds,
                lastMoveTime: block.timestamp,
                burnAmount: 0
            })
        );

        clawd.safeTransferFrom(msg.sender, address(this), wager);
        emit GameCreated(gameId, msg.sender, gameType, wager, timeoutSeconds);
    }

    function joinGame(uint256 gameId) external nonReentrant {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.OPEN) revert InvalidStatus();
        if (msg.sender == g.playerA) revert CannotSelfJoin();

        g.playerB = msg.sender;
        g.status = GameStatus.ACTIVE;
        g.currentTurn = g.playerA;
        g.lastMoveTime = block.timestamp;

        clawd.safeTransferFrom(msg.sender, address(this), g.wager);
        emit GameJoined(gameId, msg.sender);
    }

    function recordMove(uint256 gameId, string calldata move) external {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.ACTIVE) revert InvalidStatus();
        if (msg.sender != g.currentTurn) revert NotYourTurn();

        g.currentTurn = (msg.sender == g.playerA) ? g.playerB : g.playerA;
        g.lastMoveTime = block.timestamp;

        emit MoveMade(gameId, msg.sender, move);
    }

    function claimForfeit(uint256 gameId) external nonReentrant {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.ACTIVE) revert InvalidStatus();
        if (msg.sender != g.playerA && msg.sender != g.playerB) revert NotAPlayer();
        if (msg.sender == g.currentTurn) revert YourTurn();
        if (block.timestamp <= g.lastMoveTime + g.timeout) revert NotTimedOut();

        g.winner = msg.sender;
        emit ForfeitClaimed(gameId, msg.sender);
        _settle(g);
    }

    function submitResult(uint256 gameId, address winner, bytes calldata sigA, bytes calldata sigB)
        external
        nonReentrant
    {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.ACTIVE) revert InvalidStatus();
        if (winner != g.playerA && winner != g.playerB) revert InvalidWinner();

        bytes32 digest = keccak256(abi.encodePacked(gameId, winner)).toEthSignedMessageHash();
        if (ECDSA.recover(digest, sigA) != g.playerA) revert InvalidSignature();
        if (ECDSA.recover(digest, sigB) != g.playerB) revert InvalidSignature();

        g.winner = winner;
        emit ResultSubmitted(gameId, winner);
        _settle(g);
    }

    function resolveDispute(uint256 gameId, address winner) external onlyOwner nonReentrant {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.ACTIVE) revert InvalidStatus();
        if (winner != g.playerA && winner != g.playerB) revert InvalidWinner();

        g.winner = winner;
        emit DisputeResolved(gameId, winner);
        _settle(g);
    }

    function cancelGame(uint256 gameId) external nonReentrant {
        Game storage g = _game(gameId);
        if (g.status != GameStatus.OPEN) revert InvalidStatus();
        if (msg.sender != g.playerA) revert NotAPlayer();

        g.status = GameStatus.CANCELLED;
        uint256 refund = g.wager;

        emit GameCancelled(gameId);
        clawd.safeTransfer(g.playerA, refund);
    }

    // ---------- internal ----------

    function _settle(Game storage g) internal {
        uint256 pot = g.wager * 2;
        uint256 burnAmount = (pot * BURN_BPS) / BPS_DENOM;
        uint256 payout = pot - burnAmount;

        g.status = GameStatus.COMPLETE;
        g.burnAmount = burnAmount;

        address winner = g.winner;
        uint256 gameId = g.gameId;

        emit GameComplete(gameId, winner, payout, burnAmount);

        if (burnAmount > 0) {
            clawd.safeTransfer(BURN_ADDRESS, burnAmount);
        }
        clawd.safeTransfer(winner, payout);
    }

    function _game(uint256 gameId) internal view returns (Game storage) {
        require(gameId < _games.length, "bad gameId");
        return _games[gameId];
    }

    // ---------- views ----------

    function gameCount() external view returns (uint256) {
        return _games.length;
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return _game(gameId);
    }

    function openGames() external view returns (uint256[] memory) {
        uint256 len = _games.length;
        uint256 count;
        for (uint256 i = 0; i < len; i++) {
            if (_games[i].status == GameStatus.OPEN) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < len; i++) {
            if (_games[i].status == GameStatus.OPEN) {
                result[j++] = i;
            }
        }
        return result;
    }

    function activeGames(address player) external view returns (uint256[] memory) {
        uint256 len = _games.length;
        uint256 count;
        for (uint256 i = 0; i < len; i++) {
            Game storage g = _games[i];
            if (g.status == GameStatus.ACTIVE && (g.playerA == player || g.playerB == player)) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < len; i++) {
            Game storage g = _games[i];
            if (g.status == GameStatus.ACTIVE && (g.playerA == player || g.playerB == player)) {
                result[j++] = i;
            }
        }
        return result;
    }

    function playerGames(address player) external view returns (uint256[] memory) {
        uint256 len = _games.length;
        uint256 count;
        for (uint256 i = 0; i < len; i++) {
            Game storage g = _games[i];
            if (g.playerA == player || g.playerB == player) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < len; i++) {
            Game storage g = _games[i];
            if (g.playerA == player || g.playerB == player) {
                result[j++] = i;
            }
        }
        return result;
    }

    /// @notice EIP-191 digest players sign to co-sign a result.
    function resultDigest(uint256 gameId, address winner) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(gameId, winner)).toEthSignedMessageHash();
    }
}
