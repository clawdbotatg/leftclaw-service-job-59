"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { CheckersGame } from "~~/components/pvp/CheckersGame";
import { ChessGame } from "~~/components/pvp/ChessGame";
import { ResultPanel } from "~~/components/pvp/ResultPanel";
import { useScaffoldEventHistory, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useGame } from "~~/hooks/usePvPGame";
import {
  GameStatus,
  GameType,
  STATUS_LABEL,
  formatClawd,
  formatTimeout,
  timeRemaining,
  timeSince,
  truncateAddress,
} from "~~/utils/pvp";

type SharedSig = { winner: `0x${string}`; sig: `0x${string}`; from: "A" | "B" };

const GamePage = () => {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { address } = useAccount();

  const gameId = useMemo<bigint>(() => {
    try {
      return BigInt(params.id);
    } catch {
      return 0n;
    }
  }, [params.id]);

  const { game, refetch } = useGame(gameId);

  const { data: moveEvents, refetch: refetchMoves } = useScaffoldEventHistory({
    contractName: "PvPWager",
    eventName: "MoveMade",
    fromBlock: 0n,
    filters: { gameId },
    watch: true,
    blockData: false,
  });

  const [sharedSig, setSharedSig] = useState<SharedSig | null>(null);
  const [, setTick] = useState(0);

  // Re-render every few seconds so time-remaining/forfeit logic updates.
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // Parse shared co-sign params out of the URL fragment.
  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      if (!hash) {
        setSharedSig(null);
        return;
      }
      const sp = new URLSearchParams(hash);
      const winner = sp.get("winner") as `0x${string}` | null;
      const sig = sp.get("sig") as `0x${string}` | null;
      const from = sp.get("from") as "A" | "B" | null;
      if (winner && sig && (from === "A" || from === "B")) {
        setSharedSig({ winner, sig, from });
      } else {
        setSharedSig(null);
      }
    };
    parseHash();
    window.addEventListener("hashchange", parseHash);
    return () => window.removeEventListener("hashchange", parseHash);
  }, [searchParams]);

  const moves = useMemo<string[]>(() => {
    if (!moveEvents) return [];
    return moveEvents.map(e => (e.args as { move: string }).move);
  }, [moveEvents]);

  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });
  const [forfeiting, setForfeiting] = useState(false);

  if (gameId === 0n && params.id !== "0") {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="opacity-70">Invalid game ID.</p>
        <Link href="/" className="link">
          ← Back to lobby
        </Link>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center grow p-8">
        <span className="loading loading-spinner" />
      </div>
    );
  }

  const isPlayerA = address && game.playerA.toLowerCase() === address.toLowerCase();
  const isPlayerB = address && game.playerB.toLowerCase() === address.toLowerCase();
  const isPlayer = isPlayerA || isPlayerB;
  const myTurn = !!address && game.currentTurn.toLowerCase() === address.toLowerCase();
  const myColor: "white" | "black" | null = isPlayerA ? "white" : isPlayerB ? "black" : null;
  const myCheckersColor: "light" | "dark" | null = isPlayerA ? "dark" : isPlayerB ? "light" : null;
  const isActive = game.status === GameStatus.ACTIVE;
  const isComplete = game.status === GameStatus.COMPLETE;

  const expired = isActive && BigInt(Math.floor(Date.now() / 1000)) > game.lastMoveTime + game.timeout;
  const canClaimForfeit = isPlayer && isActive && !myTurn && expired;

  const handleForfeit = async () => {
    setForfeiting(true);
    try {
      await writePvP({ functionName: "claimForfeit", args: [gameId] });
      await refetch();
    } finally {
      setForfeiting(false);
    }
  };

  const onClearSharedSig = () => {
    if (typeof window !== "undefined") {
      history.replaceState(null, "", window.location.pathname);
    }
    setSharedSig(null);
  };

  const pot = game.wager * 2n;
  const payout = (pot * 90n) / 100n;
  const burn = pot - payout;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="link text-sm">
            ← Lobby
          </Link>
        </div>

        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h1 className="text-xl font-bold">
                {game.gameType === GameType.CHESS ? "Chess" : "Checkers"} · Game #{gameId.toString()}
              </h1>
              <span
                className={`badge ${
                  game.status === GameStatus.ACTIVE
                    ? "badge-success"
                    : game.status === GameStatus.COMPLETE
                      ? "badge-neutral"
                      : game.status === GameStatus.OPEN
                        ? "badge-warning"
                        : "badge-ghost"
                }`}
              >
                {STATUS_LABEL[game.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-2">
              <div>
                <div className="opacity-60 text-xs">Host</div>
                <Address address={game.playerA} />
              </div>
              <div>
                <div className="opacity-60 text-xs">Opponent</div>
                {game.playerB === "0x0000000000000000000000000000000000000000" ? (
                  <span className="opacity-70 italic">waiting…</span>
                ) : (
                  <Address address={game.playerB} />
                )}
              </div>
              <div>
                <div className="opacity-60 text-xs">Wager (each)</div>
                <div className="font-mono">{formatClawd(game.wager)} CLAWD</div>
              </div>
              <div>
                <div className="opacity-60 text-xs">Pot / Burn</div>
                <div className="font-mono text-xs">
                  {formatClawd(payout)} won · {formatClawd(burn)} burned
                </div>
              </div>
            </div>
          </div>
        </div>

        {game.gameType === GameType.CHESS ? (
          <ChessGame
            gameId={gameId}
            moves={moves}
            myColor={myColor}
            isMyTurn={myTurn}
            disabled={!isActive}
            onMoveSubmitted={() => {
              void refetch();
              void refetchMoves();
            }}
          />
        ) : (
          <CheckersGame
            gameId={gameId}
            moves={moves}
            myColor={myCheckersColor}
            isMyTurn={myTurn}
            disabled={!isActive}
            onMoveSubmitted={() => {
              void refetch();
              void refetchMoves();
            }}
          />
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 gap-2">
            <h3 className="font-semibold">Turn</h3>
            {isActive ? (
              <>
                <div className="text-sm">
                  It is{" "}
                  <span className="font-semibold">
                    {game.currentTurn.toLowerCase() === game.playerA.toLowerCase() ? "host" : "opponent"}
                  </span>
                  &apos;s turn.
                </div>
                <div className="text-xs opacity-70">
                  Timeout: {formatTimeout(game.timeout)} per move · last move {timeSince(game.lastMoveTime)}
                </div>
                <div className="text-xs opacity-70">
                  {expired ? "⚠️ Timeout expired" : `Remaining: ${timeRemaining(game.lastMoveTime, game.timeout)}`}
                </div>
              </>
            ) : isComplete ? (
              <div className="text-sm">
                Winner: <Address address={game.winner} />
              </div>
            ) : game.status === GameStatus.OPEN ? (
              <div className="text-sm">Waiting for an opponent to join.</div>
            ) : (
              <div className="text-sm opacity-70">Cancelled.</div>
            )}
          </div>
        </div>

        {canClaimForfeit && (
          <div className="card bg-warning text-warning-content border border-warning">
            <div className="card-body p-4 gap-2">
              <h3 className="font-semibold">Opponent timed out</h3>
              <p className="text-xs">Their move window elapsed — you can claim the pot as a forfeit.</p>
              <button className="btn btn-sm" onClick={handleForfeit} disabled={forfeiting}>
                {forfeiting && <span className="loading loading-spinner loading-xs" />}
                Claim Forfeit
              </button>
            </div>
          </div>
        )}

        {isActive && isPlayer && (
          <ResultPanel
            game={game}
            sharedSigParam={sharedSig}
            onClearSharedSig={onClearSharedSig}
            onSettled={() => {
              void refetch();
              void refetchMoves();
            }}
          />
        )}

        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 gap-1">
            <h3 className="font-semibold">Move history</h3>
            {moves.length === 0 ? (
              <p className="text-xs opacity-60">No moves yet.</p>
            ) : (
              <ol className="text-xs font-mono list-decimal pl-4 max-h-64 overflow-y-auto">
                {moves.map((m, i) => {
                  const ev = moveEvents?.[i];
                  const player = ev ? (ev.args as { player: `0x${string}` }).player : undefined;
                  return (
                    <li key={`${m}-${i}`}>
                      {m} <span className="opacity-60">· {truncateAddress(player)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default GamePage;
