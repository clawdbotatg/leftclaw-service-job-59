import { encodePacked, keccak256 } from "viem";

export enum GameStatus {
  OPEN = 0,
  ACTIVE = 1,
  COMPLETE = 2,
  CANCELLED = 3,
}

export enum GameType {
  CHESS = 0,
  CHECKERS = 1,
}

export type Game = {
  gameId: bigint;
  gameType: number;
  status: number;
  playerA: `0x${string}`;
  playerB: `0x${string}`;
  currentTurn: `0x${string}`;
  winner: `0x${string}`;
  wager: bigint;
  timeout: bigint;
  lastMoveTime: bigint;
  burnAmount: bigint;
};

export const TIMEOUT_OPTIONS: { label: string; seconds: bigint }[] = [
  { label: "1 hour", seconds: 3600n },
  { label: "6 hours", seconds: 21600n },
  { label: "24 hours", seconds: 86400n },
];

// Preset wager amounts in CLAWD (18 decimals).
export const WAGER_PRESETS = [
  { label: "1M CLAWD", value: 1_000_000n },
  { label: "5M CLAWD", value: 5_000_000n },
  { label: "10M CLAWD", value: 10_000_000n },
  { label: "50M CLAWD", value: 50_000_000n },
];

export const CLAWD_DECIMALS = 18;

export const GAME_TYPE_LABEL: Record<number, string> = {
  0: "Chess",
  1: "Checkers",
};

export const STATUS_LABEL: Record<number, string> = {
  0: "Open",
  1: "Active",
  2: "Complete",
  3: "Cancelled",
};

export const formatClawd = (amount: bigint): string => {
  const whole = amount / 10n ** BigInt(CLAWD_DECIMALS);
  // Compact formatting for lobby readability.
  if (whole >= 1_000_000n) {
    const millions = Number(whole) / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (whole >= 1_000n) {
    const thousands = Number(whole) / 1_000;
    return `${thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return whole.toString();
};

export const formatTimeout = (seconds: bigint): string => {
  const s = Number(seconds);
  if (s >= 86400) return `${Math.round(s / 86400)}d`;
  if (s >= 3600) return `${Math.round(s / 3600)}h`;
  if (s >= 60) return `${Math.round(s / 60)}m`;
  return `${s}s`;
};

export const truncateAddress = (addr?: string): string => {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

export const timeSince = (timestampSec: bigint): string => {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const diff = nowSec - timestampSec;
  if (diff < 60n) return `${diff}s ago`;
  if (diff < 3600n) return `${diff / 60n}m ago`;
  if (diff < 86400n) return `${diff / 3600n}h ago`;
  return `${diff / 86400n}d ago`;
};

export const timeRemaining = (lastMoveTime: bigint, timeout: bigint): string => {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const deadline = lastMoveTime + timeout;
  if (nowSec >= deadline) return "expired";
  const remaining = deadline - nowSec;
  if (remaining < 60n) return `${remaining}s`;
  if (remaining < 3600n) return `${remaining / 60n}m`;
  if (remaining < 86400n) return `${remaining / 3600n}h`;
  return `${remaining / 86400n}d`;
};

/// Encodes the raw 32-byte inner hash that players sign via personal_sign.
/// The contract wraps this with EIP-191 before ecrecover.
export const resultInnerHash = (gameId: bigint, winner: `0x${string}`): `0x${string}` =>
  keccak256(encodePacked(["uint256", "address"], [gameId, winner]));
