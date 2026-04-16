"use client";

import { useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { CreateGameModal } from "~~/components/pvp/CreateGameModal";
import { OpenGameRow } from "~~/components/pvp/OpenGameRow";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useActiveGameIds, useOpenGameIds } from "~~/hooks/usePvPGame";
import { GameType } from "~~/utils/pvp";

const Home: NextPage = () => {
  const { address } = useAccount();
  const [tab, setTab] = useState<GameType>(GameType.CHESS);
  const [modalOpen, setModalOpen] = useState(false);

  const openIds = useOpenGameIds();
  const activeIds = useActiveGameIds(address);

  return (
    <div className="flex flex-col grow w-full max-w-5xl mx-auto px-4 py-8 gap-6">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">CLAWD Arena</h1>
        <p className="opacity-70 mt-1">
          Escrowed 1v1 Chess and Checkers. Winner claims 90% of the pot, 10% is permanently burned.
        </p>
      </section>

      {!address && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body items-center text-center">
            <h2 className="card-title">Connect your wallet to play</h2>
            <p className="text-sm opacity-70">
              Games are escrowed on-chain. Connect a wallet holding CLAWD to create or join a game.
            </p>
            <RainbowKitCustomConnectButton />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div role="tablist" className="tabs tabs-boxed bg-base-200">
          <button
            role="tab"
            className={`tab ${tab === GameType.CHESS ? "tab-active" : ""}`}
            onClick={() => setTab(GameType.CHESS)}
          >
            ♞ Chess
          </button>
          <button
            role="tab"
            className={`tab ${tab === GameType.CHECKERS ? "tab-active" : ""}`}
            onClick={() => setTab(GameType.CHECKERS)}
          >
            ⛀ Checkers
          </button>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setModalOpen(true)}
          disabled={!address}
          title={!address ? "Connect wallet first" : undefined}
        >
          + Create Game
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          Open {tab === GameType.CHESS ? "Chess" : "Checkers"} Games
          <span className="badge badge-ghost">{openIds.length}</span>
        </h2>
        {openIds.length === 0 ? (
          <div className="bg-base-200 border border-base-300 rounded-box p-6 text-center opacity-70 text-sm">
            No open games right now. Be the first to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {openIds.map(id => (
              <OpenGameRow key={id.toString()} gameId={id} filterType={Number(tab)} />
            ))}
          </div>
        )}
      </section>

      {address && activeIds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your Active Games</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeIds.map(id => (
              <Link key={id.toString()} href={`/game/${id.toString()}`} className="btn btn-outline justify-start">
                Game #{id.toString()} →
              </Link>
            ))}
          </div>
        </section>
      )}

      <CreateGameModal gameType={tab} open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
};

export default Home;
