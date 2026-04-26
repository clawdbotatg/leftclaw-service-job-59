"use client";

import { useState } from "react";
import { Address } from "@scaffold-ui/components";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import type { Game } from "~~/utils/pvp";
import { resultInnerHash, truncateAddress } from "~~/utils/pvp";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type Props = {
  game: Game;
  sharedSigParam: { winner: `0x${string}`; sig: `0x${string}`; from: "A" | "B" } | null;
  onClearSharedSig: () => void;
  onSettled?: () => void;
};

type Step = "idle" | "signing" | "submitting";

export const ResultPanel = ({ game, sharedSigParam, onClearSharedSig, onSettled }: Props) => {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });
  const { targetNetwork } = useTargetNetwork();

  const [mySig, setMySig] = useState<`0x${string}` | null>(null);
  const [winner, setWinner] = useState<`0x${string}` | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const isPlayerA = address && game.playerA.toLowerCase() === address.toLowerCase();
  const isPlayerB = address && game.playerB.toLowerCase() === address.toLowerCase();
  const iAm: "A" | "B" | null = isPlayerA ? "A" : isPlayerB ? "B" : null;
  const opponent = iAm === "A" ? game.playerB : iAm === "B" ? game.playerA : null;

  const signResult = async (chosenWinner: `0x${string}`) => {
    setStep("signing");
    setErrorMsg("");
    try {
      const inner = resultInnerHash(game.gameId, chosenWinner);
      const sig = await signMessageAsync({ message: { raw: inner } });
      setMySig(sig);
      setWinner(chosenWinner);
      const params = new URLSearchParams({
        winner: chosenWinner,
        sig,
        from: iAm ?? "A",
      });
      const url = `${window.location.origin}/game/${game.gameId.toString()}#${params.toString()}`;
      setShareUrl(url);
    } catch (e) {
      setErrorMsg(getParsedErrorWithAllAbis(e, targetNetwork.id as any));
    } finally {
      setStep("idle");
    }
  };

  const handleResign = async () => {
    if (!opponent) return;
    await signResult(opponent);
  };

  const handleClaimWin = async () => {
    if (!address) return;
    await signResult(address as `0x${string}`);
  };

  const coSignAndSubmit = async () => {
    if (!sharedSigParam || !iAm) return;
    setStep("signing");
    setErrorMsg("");
    try {
      const inner = resultInnerHash(game.gameId, sharedSigParam.winner);
      const mySignature = await signMessageAsync({ message: { raw: inner } });
      const sigA = sharedSigParam.from === "A" ? sharedSigParam.sig : mySignature;
      const sigB = sharedSigParam.from === "B" ? sharedSigParam.sig : mySignature;
      setStep("submitting");
      await writePvP({
        functionName: "submitResult",
        args: [game.gameId, sharedSigParam.winner, sigA, sigB],
      });
      onSettled?.();
      onClearSharedSig();
    } catch (e) {
      setErrorMsg(getParsedErrorWithAllAbis(e, targetNetwork.id as any));
    } finally {
      setStep("idle");
    }
  };

  const copyShare = () => {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl);
  };

  if (!iAm) {
    return null;
  }

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body p-4 gap-3">
        <h3 className="font-semibold">Settle Game</h3>
        <p className="text-xs opacity-70">
          Both players co-sign who won. Either player can submit the pair of signatures to trigger payout.
        </p>

        {sharedSigParam ? (
          <div className="flex flex-col gap-2 bg-base-100 rounded-md p-3">
            <div className="text-sm">
              <span className="opacity-70">Pending proposal from player {sharedSigParam.from}:</span> winner is
            </div>
            <Address address={sharedSigParam.winner} />
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={coSignAndSubmit} disabled={step !== "idle"}>
                {step === "signing" && <span className="loading loading-spinner loading-xs" />}
                {step === "submitting" && <span className="loading loading-spinner loading-xs" />}
                Co-sign & Submit
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onClearSharedSig} disabled={step !== "idle"}>
                Dismiss
              </button>
            </div>
          </div>
        ) : mySig && winner ? (
          <div className="flex flex-col gap-2 bg-base-100 rounded-md p-3">
            <div className="text-sm">
              <span className="opacity-70">You signed. Declared winner:</span> {truncateAddress(winner)}
            </div>
            <div className="text-xs break-all font-mono opacity-70">{mySig}</div>
            {shareUrl && (
              <div className="flex flex-col gap-1">
                <div className="text-xs opacity-70">Share this link with your opponent to co-sign:</div>
                <div className="flex gap-2">
                  <input className="input input-bordered input-xs flex-1 font-mono" readOnly value={shareUrl} />
                  <button className="btn btn-xs" onClick={copyShare}>
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-outline btn-sm" onClick={handleResign} disabled={step !== "idle"}>
              Resign (opponent wins)
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleClaimWin} disabled={step !== "idle"}>
              Declare me the winner
            </button>
          </div>
        )}

        {errorMsg && <div className="text-xs text-error">{errorMsg}</div>}
      </div>
    </div>
  );
};
