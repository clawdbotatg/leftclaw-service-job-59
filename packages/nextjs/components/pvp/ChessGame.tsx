"use client";

import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type Props = {
  gameId: bigint;
  moves: string[];
  myColor: "white" | "black" | null;
  isMyTurn: boolean;
  disabled?: boolean;
  onMoveSubmitted?: () => void;
};

export const ChessGame = ({ gameId, moves, myColor, isMyTurn, disabled, onMoveSubmitted }: Props) => {
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });
  const { targetNetwork } = useTargetNetwork();

  const chess = useMemo(() => {
    const c = new Chess();
    for (const mv of moves) {
      try {
        c.move(mv);
      } catch {
        // ignore malformed history entries; contract records untrusted strings.
      }
    }
    return c;
  }, [moves]);

  const fen = chess.fen();
  const orientation: "white" | "black" = myColor === "black" ? "black" : "white";

  const submitMove = async (moveUci: string) => {
    setPending(true);
    setErrorMsg("");
    try {
      await writePvP({ functionName: "recordMove", args: [gameId, moveUci] });
      onMoveSubmitted?.();
    } catch (e) {
      setErrorMsg(getParsedErrorWithAllAbis(e, targetNetwork.id as any));
    } finally {
      setPending(false);
    }
  };

  const onPieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    piece: unknown;
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!isMyTurn || disabled || pending || !targetSquare) return false;
    const trial = new Chess(fen);
    try {
      const mv = trial.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
      if (!mv) return false;
      // Use UCI-style string (e.g., "e2e4" or "e7e8q") so replay is trivial.
      const uci = `${mv.from}${mv.to}${mv.promotion ?? ""}`;
      void submitMove(uci);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md mx-auto w-full">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: isMyTurn && !disabled && !pending,
            onPieceDrop,
            id: `board-${gameId.toString()}`,
          }}
        />
      </div>
      {pending && (
        <div className="text-center text-xs opacity-70">
          <span className="loading loading-spinner loading-xs" /> Recording move on-chain…
        </div>
      )}
      {errorMsg && <div className="text-center text-xs text-error">{errorMsg}</div>}
    </div>
  );
};
