"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { CLAWD_DECIMALS, GameType, TIMEOUT_OPTIONS, WAGER_PRESETS } from "~~/utils/pvp";

type Props = {
  gameType: GameType;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export const CreateGameModal = ({ gameType, open, onClose, onCreated }: Props) => {
  const { address } = useAccount();
  const [wagerPreset, setWagerPreset] = useState<bigint>(WAGER_PRESETS[0].value);
  const [customWager, setCustomWager] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState<bigint>(TIMEOUT_OPTIONS[2].seconds);
  const [step, setStep] = useState<"idle" | "approving" | "creating">("idle");

  const wagerUnits: bigint = useCustom
    ? (() => {
        try {
          const n = BigInt(customWager || "0");
          return n * 10n ** BigInt(CLAWD_DECIMALS);
        } catch {
          return 0n;
        }
      })()
    : wagerPreset * 10n ** BigInt(CLAWD_DECIMALS);

  const { data: pvpContract } = useDeployedContractInfo({ contractName: "PvPWager" });
  const pvpAddress = pvpContract?.address;

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      pvpAddress ?? "0x0000000000000000000000000000000000000000",
    ],
    query: { enabled: !!address && !!pvpAddress },
  });

  const { data: balance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writePvP } = useScaffoldWriteContract({ contractName: "PvPWager" });

  useEffect(() => {
    if (!open) setStep("idle");
  }, [open]);

  if (!open) return null;

  const needsApproval = ((allowance as bigint | undefined) ?? 0n) < wagerUnits;
  const hasBalance = ((balance as bigint | undefined) ?? 0n) >= wagerUnits;
  const isBusy = step !== "idle";
  const wagerLabel = useCustom
    ? `${customWager || "0"} CLAWD`
    : WAGER_PRESETS.find(p => p.value === wagerPreset)?.label;

  // Known issue: Approval double-submit guard uses a single busy flag with no post-confirm cooldown. Practical risk is low since refetchAllowance is awaited before state clears.
  const handleApprove = async () => {
    if (!pvpAddress) return;
    setStep("approving");
    try {
      await writeClawd({
        functionName: "approve",
        args: [pvpAddress, wagerUnits],
      });
      await refetchAllowance();
    } finally {
      setStep("idle");
    }
  };

  const handleCreate = async () => {
    setStep("creating");
    try {
      await writePvP({
        functionName: "createGame",
        args: [Number(gameType), wagerUnits, timeoutSec],
      });
      onCreated?.();
      onClose();
    } finally {
      setStep("idle");
    }
  };

  return (
    <div className="modal modal-open z-40">
      <div className="modal-box max-w-md bg-base-100">
        <h3 className="font-bold text-lg mb-2">Create {gameType === GameType.CHESS ? "Chess" : "Checkers"} Game</h3>
        <p className="text-xs opacity-70 mb-4">
          You escrow your wager now. When an opponent joins, each of you has{" "}
          {TIMEOUT_OPTIONS.find(o => o.seconds === timeoutSec)?.label} to move before forfeit.
        </p>

        <div className="form-control mb-3">
          <label className="label-text text-sm mb-1">Wager (CLAWD)</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGER_PRESETS.map(p => (
              <button
                type="button"
                key={p.label}
                disabled={isBusy}
                onClick={() => {
                  setUseCustom(false);
                  setWagerPreset(p.value);
                }}
                className={`btn btn-sm ${!useCustom && wagerPreset === p.value ? "btn-primary" : "btn-outline"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={useCustom}
              onChange={e => setUseCustom(e.target.checked)}
              disabled={isBusy}
            />
            <span className="text-sm">Custom</span>
            <input
              type="number"
              min={1}
              placeholder="CLAWD amount"
              className="input input-bordered input-sm w-full"
              value={customWager}
              onChange={e => {
                setUseCustom(true);
                setCustomWager(e.target.value.replace(/[^\d]/g, ""));
              }}
              disabled={isBusy}
            />
          </div>
        </div>

        <div className="form-control mb-3">
          <label className="label-text text-sm mb-1">Timeout per move</label>
          <div className="grid grid-cols-3 gap-2">
            {TIMEOUT_OPTIONS.map(opt => (
              <button
                type="button"
                key={opt.label}
                disabled={isBusy}
                onClick={() => setTimeoutSec(opt.seconds)}
                className={`btn btn-sm ${timeoutSec === opt.seconds ? "btn-primary" : "btn-outline"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Known issue: No USD value displayed next to CLAWD amounts — CLAWD's USD price source isn't stable enough to show paired dollar figures. */}
        <div className="text-xs opacity-70 mb-4">
          Your wager: <span className="font-mono">{wagerLabel}</span>. Pot:{" "}
          {useCustom
            ? `${Number(customWager || "0") * 2}`
            : `${(Number(WAGER_PRESETS.find(p => p.value === wagerPreset)!.value) * 2).toLocaleString()}`}{" "}
          CLAWD (10% burned on settle).
        </div>

        {!hasBalance && address && (
          <div className="alert alert-warning text-xs mb-3 py-2">Not enough CLAWD balance for this wager.</div>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          {needsApproval ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleApprove}
              disabled={isBusy || wagerUnits === 0n || !hasBalance}
            >
              {step === "approving" && <span className="loading loading-spinner loading-xs" />} Approve CLAWD
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={isBusy || wagerUnits === 0n || !hasBalance}
            >
              {step === "creating" && <span className="loading loading-spinner loading-xs" />} Create Game
            </button>
          )}
        </div>
      </div>
      <div className="modal-backdrop bg-black/60" onClick={isBusy ? undefined : onClose} />
    </div>
  );
};
