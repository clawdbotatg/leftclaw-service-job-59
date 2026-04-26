"use client";

import { useMemo, useState } from "react";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type Piece = { color: "light" | "dark"; king: boolean } | null;
type Board = Piece[][]; // [row][col], row 0 is top (dark side by default)

type Props = {
  gameId: bigint;
  moves: string[];
  myColor: "light" | "dark" | null; // playerA = dark (moves first), playerB = light
  isMyTurn: boolean;
  disabled?: boolean;
  onMoveSubmitted?: () => void;
};

const COLS = "abcdefgh";

const initialBoard = (): Board => {
  const board: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Piece));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "light", king: false };
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "dark", king: false };
    }
  }
  return board;
};

const parseSquare = (sq: string): [number, number] | null => {
  if (sq.length !== 2) return null;
  const col = COLS.indexOf(sq[0]);
  const row = 8 - Number(sq[1]);
  if (col < 0 || Number.isNaN(row) || row < 0 || row > 7) return null;
  return [row, col];
};

const squareName = (r: number, c: number) => `${COLS[c]}${8 - r}`;

// Applies a single move like "a3-b4" or "c3xe5" (capture) or chained "c3xe5xg7".
// We keep checkers logic minimal — the contract doesn't validate moves; this
// renderer just replays whatever both players sign.
const applyMove = (board: Board, move: string): Board => {
  const parts = move.split(/[-x]/g);
  if (parts.length < 2) return board;
  const capture = move.includes("x");
  const path = parts.map(parseSquare);
  if (path.some(p => p === null)) return board;
  const next: Board = board.map(row => row.slice());
  const [startR, startC] = path[0] as [number, number];
  const piece = next[startR][startC];
  if (!piece) return board;
  next[startR][startC] = null;
  for (let i = 1; i < path.length; i++) {
    const [r, c] = path[i] as [number, number];
    if (capture && i <= path.length - 1) {
      const [pr, pc] = path[i - 1] as [number, number];
      const midR = (pr + r) / 2;
      const midC = (pc + c) / 2;
      if (Number.isInteger(midR) && Number.isInteger(midC)) {
        next[midR][midC] = null;
      }
    }
  }
  const [endR, endC] = path[path.length - 1] as [number, number];
  const crowned = piece.king || (piece.color === "dark" && endR === 0) || (piece.color === "light" && endR === 7);
  next[endR][endC] = { color: piece.color, king: crowned };
  return next;
};

export const CheckersGame = ({ gameId, moves, myColor, isMyTurn, disabled, onMoveSubmitted }: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });
  const { targetNetwork } = useTargetNetwork();

  const board = useMemo(() => {
    let b = initialBoard();
    for (const mv of moves) b = applyMove(b, mv);
    return b;
  }, [moves]);

  const orientation: "light" | "dark" = myColor === "light" ? "light" : "dark";

  const renderRows = orientation === "dark" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const renderCols = orientation === "dark" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  const canInteract = isMyTurn && !disabled && !pending;

  const submitMove = async (notation: string) => {
    setPending(true);
    setErrorMsg("");
    try {
      await writePvP({ functionName: "recordMove", args: [gameId, notation] });
      onMoveSubmitted?.();
    } catch (e) {
      setErrorMsg(getParsedErrorWithAllAbis(e, targetNetwork.id as any));
    } finally {
      setPending(false);
      setSelected(null);
    }
  };

  const onSquareClick = (r: number, c: number) => {
    if (!canInteract) return;
    const sq = squareName(r, c);
    const piece = board[r][c];
    if (selected === null) {
      if (piece && piece.color === myColor) setSelected(sq);
      return;
    }
    if (selected === sq) {
      setSelected(null);
      return;
    }
    const [sr, sc] = parseSquare(selected)!;
    const dr = r - sr;
    const dc = c - sc;
    const target = board[r][c];
    if (target) {
      if (piece && piece.color === myColor) setSelected(sq);
      return;
    }
    const selectedPiece = board[sr][sc];
    if (!selectedPiece) {
      setSelected(null);
      return;
    }
    // Basic client-side shape check; the real arbitration is off-chain anyway.
    if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
      void submitMove(`${selected}-${sq}`);
      return;
    }
    if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
      void submitMove(`${selected}x${sq}`);
      return;
    }
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-2 items-center">
      <div className="grid grid-cols-8 gap-0 border-2 border-base-content/30 rounded-md overflow-hidden w-full max-w-md aspect-square">
        {renderRows.map(r =>
          renderCols.map(c => {
            const dark = (r + c) % 2 === 1;
            const piece = board[r][c];
            const sq = squareName(r, c);
            const isSelected = selected === sq;
            return (
              <button
                key={sq}
                onClick={() => onSquareClick(r, c)}
                disabled={!canInteract}
                className={`aspect-square flex items-center justify-center text-3xl select-none ${
                  dark ? "bg-amber-800" : "bg-amber-200"
                } ${isSelected ? "ring-4 ring-primary inset-0" : ""}`}
              >
                {piece && (
                  <span
                    className={`inline-block w-3/4 h-3/4 rounded-full border-2 ${
                      piece.color === "dark" ? "bg-neutral border-neutral-content" : "bg-base-100 border-base-300"
                    }`}
                  >
                    {piece.king && <span className="text-xs">👑</span>}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
      {pending && (
        <div className="text-xs opacity-70">
          <span className="loading loading-spinner loading-xs" /> Recording move on-chain…
        </div>
      )}
      {errorMsg && <div className="text-xs text-error">{errorMsg}</div>}
      <div className="text-xs opacity-60 text-center max-w-md">
        Click one of your pieces, then click a destination. Single-step moves use <code>a1-b2</code>, captures use{" "}
        <code>a1xc3</code>. Move legality is decided between players off-chain.
      </div>
    </div>
  );
};
