# CLAWD Arena

PvP Chess and Checkers wagered in CLAWD on Base — winner takes 90% of the pot, 10% is burned.

## What it does

Two players each escrow an equal CLAWD wager into the on-chain `PvPWager` contract. They play chess or checkers off-chain (board state lives in the browser), recording each move on-chain so anyone can verify history and detect timeouts. When the game ends, both players co-sign the agreed winner; either side submits both signatures to release the pot. If a player disappears mid-game, the opponent can claim the forfeit after the per-move timeout elapses.

- 90% of the pot pays the winner
- 10% is burned to `address(0)` on settle
- Refunds in full if the host cancels before anyone joins

## Contract

| Network | Contract | Address |
|---------|----------|---------|
| Base mainnet | `PvPWager` | [`0xde0952553b6c4ef58307d6a8f8e9b62018c1211e`](https://basescan.org/address/0xde0952553b6c4ef58307d6a8f8e9b62018c1211e) |
| Base mainnet | `CLAWD` (token) | [`0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`](https://basescan.org/address/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) |

## How to play

1. **Connect** a wallet on Base, holding some CLAWD.
2. **Create a game** — pick chess or checkers, set the wager and per-move timeout. You approve and escrow your wager when you create.
3. **Wait for an opponent** to join. They approve and escrow the same wager.
4. **Play** off-chain in the browser; every move is recorded on-chain via `recordMove`.
5. **Settle** — both players co-sign the winner address (winning side or resignation), and either player submits both signatures via `submitResult`. The contract pays out 90% to the winner and burns 10%.
6. **Forfeit** — if your opponent's move clock runs out, call `claimForfeit` to take the pot.

## Stack

- Smart contract: Solidity 0.8.x, deployed via Foundry
- Frontend: Next.js (App Router), Wagmi, Viem, RainbowKit, DaisyUI / Tailwind
- Off-chain game logic: `chess.js` for chess rules, custom checkers engine
- Static export hosted on IPFS via bgipfs

## Local development

```bash
yarn install
yarn start            # Next.js dev server at http://localhost:3000
```

The app targets Base mainnet by default. Edit `packages/nextjs/scaffold.config.ts` to change networks.
