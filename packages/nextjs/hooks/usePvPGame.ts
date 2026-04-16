"use client";

import { useMemo } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import type { Game } from "~~/utils/pvp";

export const useGame = (gameId: bigint | undefined) => {
  const { data, isLoading, refetch } = useScaffoldReadContract({
    contractName: "PvPWager",
    functionName: "getGame",
    args: [gameId ?? 0n],
    query: { enabled: gameId !== undefined },
  });

  const game = useMemo(() => (data as Game | undefined) ?? undefined, [data]);
  return { game, isLoading, refetch };
};

export const useGameCount = () => {
  const { data } = useScaffoldReadContract({
    contractName: "PvPWager",
    functionName: "gameCount",
  });
  return (data as bigint | undefined) ?? 0n;
};

export const useOpenGameIds = () => {
  const { data } = useScaffoldReadContract({
    contractName: "PvPWager",
    functionName: "openGames",
  });
  return (data as readonly bigint[] | undefined) ?? [];
};

export const useActiveGameIds = (player: string | undefined) => {
  const { data } = useScaffoldReadContract({
    contractName: "PvPWager",
    functionName: "activeGames",
    args: [(player ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: !!player },
  });
  return (data as readonly bigint[] | undefined) ?? [];
};

export const usePlayerGameIds = (player: string | undefined) => {
  const { data } = useScaffoldReadContract({
    contractName: "PvPWager",
    functionName: "playerGames",
    args: [(player ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: !!player },
  });
  return (data as readonly bigint[] | undefined) ?? [];
};
