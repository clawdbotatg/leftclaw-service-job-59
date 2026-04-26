"use client";

import { useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";
import { useGame } from "~~/hooks/usePvPGame";
import { GameStatus, formatClawd, formatTimeout } from "~~/utils/pvp";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type Props = {
  gameId: bigint;
  filterType?: number;
};

const openMobileWallet = () => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && !(window as any).ethereum) {
    setTimeout(() => window.open("metamask://", "_blank"), 2000);
  }
};

export const OpenGameRow = ({ gameId, filterType }: Props) => {
  const { game } = useGame(gameId);
  const { address, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain } = useSwitchChain();
  const isCorrectNetwork = chain?.id === targetNetwork.id;

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
  const [joining, setJoining] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approveCooldown, setApproveCooldown] = useState(false);

  if (!game || game.status !== GameStatus.OPEN) return null;
  if (filterType !== undefined && game.gameType !== filterType) return null;

  const isCreator = address && game.playerA.toLowerCase() === address.toLowerCase();
  const needsApproval = ((allowance as bigint | undefined) ?? 0n) < game.wager;
  const isApproveBusy = approvalSubmitting || approveCooldown;
  const isAnyBusy = joining || cancelling || isApproveBusy;

  const handleApprove = async () => {
    if (!pvpContract?.address) return;
    setApprovalSubmitting(true);
    try {
      const promise = writeClawd({ functionName: "approve", args: [pvpContract.address, game.wager] });
      openMobileWallet();
      await promise;
      setApprovalSubmitting(false);
      setApproveCooldown(true);
      await refetchAllowance();
      setTimeout(() => setApproveCooldown(false), 4000);
    } catch (e) {
      setApprovalSubmitting(false);
      const parsed = getParsedErrorWithAllAbis(e, targetNetwork.id as any);
      notification.error(parsed);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      const promise = writePvP({ functionName: "joinGame", args: [gameId] });
      openMobileWallet();
      await promise;
    } catch (e) {
      const parsed = getParsedErrorWithAllAbis(e, targetNetwork.id as any);
      notification.error(parsed);
    } finally {
      setJoining(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const promise = writePvP({ functionName: "cancelGame", args: [gameId] });
      openMobileWallet();
      await promise;
    } catch (e) {
      const parsed = getParsedErrorWithAllAbis(e, targetNetwork.id as any);
      notification.error(parsed);
    } finally {
      setCancelling(false);
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
          {address && !isCorrectNetwork ? (
            <button className="btn btn-warning btn-sm" onClick={() => switchChain({ chainId: targetNetwork.id })}>
              Switch to {targetNetwork.name}
            </button>
          ) : isCreator ? (
            <button className="btn btn-outline btn-sm" disabled={isAnyBusy} onClick={handleCancel}>
              {cancelling && <span className="loading loading-spinner loading-xs" />}
              Cancel
            </button>
          ) : needsApproval ? (
            <button className="btn btn-primary btn-sm" disabled={isAnyBusy || !address} onClick={handleApprove}>
              {(approvalSubmitting || approveCooldown) && <span className="loading loading-spinner loading-xs" />}
              Approve
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={isAnyBusy || !address} onClick={handleJoin}>
              {joining && <span className="loading loading-spinner loading-xs" />}
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
