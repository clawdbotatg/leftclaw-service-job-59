"use client";

import { useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useGame } from "~~/hooks/usePvPGame";
import { GameStatus, formatClawd, formatTimeout } from "~~/utils/pvp";

type Props = {
  gameId: bigint;
  filterType?: number;
};

export const OpenGameRow = ({ gameId, filterType }: Props) => {
  const { game } = useGame(gameId);
  const { address } = useAccount();
  const { data: pvpContract } = useDeployedContractInfo({ contractName: "PvPWager" });
  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      pvpContract?.address ?? "0x0000000000000000000000000000000000000000",
    ],
    query: { enabled: !!address && !!pvpContract?.address },
  });
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });
  const [busy, setBusy] = useState<"idle" | "approving" | "joining" | "cancelling">("idle");

  if (!game || game.status !== GameStatus.OPEN) return null;
  if (filterType !== undefined && game.gameType !== filterType) return null;

  const isCreator = address && game.playerA.toLowerCase() === address.toLowerCase();
  const needsApproval = ((allowance as bigint | undefined) ?? 0n) < game.wager;

  const handleApprove = async () => {
    if (!pvpContract?.address) return;
    setBusy("approving");
    try {
      await writeClawd({ functionName: "approve", args: [pvpContract.address, game.wager] });
      await refetchAllowance();
    } finally {
      setBusy("idle");
    }
  };

  const handleJoin = async () => {
    setBusy("joining");
    try {
      await writePvP({ functionName: "joinGame", args: [gameId] });
    } finally {
      setBusy("idle");
    }
  };

  const handleCancel = async () => {
    setBusy("cancelling");
    try {
      await writePvP({ functionName: "cancelGame", args: [gameId] });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="card bg-base-200 border border-base-300 shadow-sm">
      <div className="card-body p-4 flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1 grow min-w-0">
          <div className="flex gap-3 items-center">
            <span className="badge badge-neutral">#{gameId.toString()}</span>
            <span className="text-xs opacity-70">host</span>
            <Address address={game.playerA} />
          </div>
          <div className="flex gap-4 text-sm mt-1">
            <span>
              <span className="opacity-60">wager</span>{" "}
              <span className="font-mono font-semibold">{formatClawd(game.wager)} CLAWD</span>
            </span>
            <span>
              <span className="opacity-60">timeout</span>{" "}
              <span className="font-mono">{formatTimeout(game.timeout)}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/game/${gameId.toString()}`} className="btn btn-ghost btn-sm">
            View
          </Link>
          {isCreator ? (
            <button className="btn btn-outline btn-sm" disabled={busy !== "idle"} onClick={handleCancel}>
              {busy === "cancelling" && <span className="loading loading-spinner loading-xs" />}
              Cancel
            </button>
          ) : needsApproval ? (
            <button className="btn btn-primary btn-sm" disabled={busy !== "idle" || !address} onClick={handleApprove}>
              {busy === "approving" && <span className="loading loading-spinner loading-xs" />}
              Approve
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={busy !== "idle" || !address} onClick={handleJoin}>
              {busy === "joining" && <span className="loading loading-spinner loading-xs" />}
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
