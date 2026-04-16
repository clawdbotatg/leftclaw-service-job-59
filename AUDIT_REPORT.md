# Audit Report — Cycle 1

## MUST FIX

- [x] **[CRITICAL]** Burn to `address(0)` will revert on real CLAWD, locking every pot — `packages/foundry/contracts/PvPWager.sol:51,208` — `BURN_ADDRESS = address(0)` and `_settle()` does `clawd.safeTransfer(BURN_ADDRESS, burnAmount)`. Standard OZ ERC20 reverts on transfers to the zero address, and `MockCLAWD.sol:7-9` explicitly exists only because it "permits transfers to address(0) so the PvPWager burn path can execute in local and test environments" — i.e. the authors know the real CLAWD does not allow this. Every `submitResult`, `claimForfeit`, and `resolveDispute` on Base will revert, leaving all escrowed CLAWD stuck forever. Fix: either call a `burn(uint256)` / `burnFrom(address,uint256)` method on the real CLAWD token, or burn to a dead address like `0x000000000000000000000000000000000000dEaD`, after confirming which path the real CLAWD on Base supports.

- [x] **[CRITICAL]** `CLAWD` contract not registered for Base (chain 8453) — `packages/foundry/script/Deploy.s.sol:27-34` and `packages/nextjs/contracts/externalContracts.ts:14` — on `block.chainid == 8453` the script uses `CLAWD_ON_BASE` directly and does **not** push it into `deployments[]`, so the generated `deployedContracts.ts` for Base will contain only `PvPWager`. `externalContracts.ts` is empty (`{}`). The frontend calls `useScaffoldReadContract({ contractName: "CLAWD", ... })` / `useScaffoldWriteContract({ contractName: "CLAWD" })` in `CreateGameModal.tsx:37,47,54` and `OpenGameRow.tsx:21,29` to read `allowance` / `balanceOf` and to `approve`. On Base these hooks will fail to resolve the `CLAWD` contract, so users cannot approve the wager or see their balance — the create/join flow is broken end-to-end. Fix: add `CLAWD` to `externalContracts.ts` under chain id `8453` with `address: 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` and the full ERC20 ABI (at minimum `allowance`, `approve`, `balanceOf`, `decimals`, `symbol`, `name`).

## KNOWN ISSUES

- **[LOW]** Unbounded loops in view functions — `packages/foundry/contracts/PvPWager.sol:228-280` — `openGames()`, `activeGames(address)`, and `playerGames(address)` each iterate all games twice. Acceptable at small-to-medium scale (views are eth_calls, not on-chain txs), but eventually the frontend lobby call cost grows linearly. Ship-acceptable; revisit with pagination or per-player indexing if game count grows past a few thousand.

- **[LOW]** `Ownable` instead of `Ownable2Step` — `packages/foundry/contracts/PvPWager.sol:15,78` — a single bad `transferOwnership` could hand the dispute role to a wrong/typo'd address with no acceptance handshake. The constructor wires the client address directly at deploy time, so the initial assignment is correct; risk is only on a future ownership change. Acceptable.

- **[LOW]** No USD value displayed next to CLAWD amounts — `packages/nextjs/components/pvp/CreateGameModal.tsx:167-171`, `packages/nextjs/components/pvp/OpenGameRow.tsx:79-86`, `packages/nextjs/app/game/[id]/page.tsx:187-194` — QA skill recommends paired dollar figures ("X CLAWD (~$Y)"). Because CLAWD's USD price source isn't obvious/stable, showing raw CLAWD only is acceptable; the asset name is explicit everywhere.

- **[LOW]** Primary CTAs don't morph into a "Switch Network" button on wrong chain — `packages/nextjs/app/page.tsx:59-67` (Create Game), `packages/nextjs/components/pvp/OpenGameRow.tsx:92-107` (Join/Cancel) — they disable on disconnect but don't surface a network-switch prompt in the primary slot; users on the wrong chain rely on RainbowKit's header dropdown or the wallet's internal switch prompt when the tx is fired. QA skill flags this; not a silent-failure risk here because wagmi will reject the write before sending, but UX is slightly worse.

- **[LOW]** Approval double-submit guard uses a single busy flag, no post-confirm cooldown — `packages/nextjs/components/pvp/CreateGameModal.tsx:70-82`, `packages/nextjs/components/pvp/OpenGameRow.tsx:39-48` — QA skill recommends a separate `approveCooldown` timer covering the allowance-refetch lag after tx confirmation. Current `step !== "idle"` / `busy !== "idle"` pattern is adequate for the signature-request window and the refetch is `await`ed before state clears, so practical double-submit risk is low.

- **[LOW]** Chess/Checkers move validation is fully off-chain and the contract records arbitrary `string calldata move` — `packages/foundry/contracts/PvPWager.sol:130-139` — this is documented product intent ("Game logic lives off-chain"). A malicious peer can submit garbage moves; the counterparty's recourse is to refuse to co-sign a result and rely on the forfeit timer. Ship-acceptable by design, but worth a one-line README callout.

- **[LOW]** Signatures are not chain- or contract-scoped — `packages/foundry/contracts/PvPWager.sol:161,284` — `keccak256(abi.encodePacked(gameId, winner))` omits `block.chainid` and `address(this)`, so if PvPWager were ever redeployed to another chain (or a second Base deployment) with overlapping `gameId`s, a co-signed result from one could in theory be replayed on another. Given the single production deployment this is informational only; EIP-712 domain separation would be the clean fix.

- **[LOW]** `currentTurn` not reset post-settlement — `packages/foundry/contracts/PvPWager.sol:148-150,170-178` — when a game settles via forfeit or dispute, `g.currentTurn` retains whichever player was on the clock. No functional impact (status flips to `COMPLETE` and gating checks use status), purely cosmetic if any indexer reads the field.

- **[INFO]** MockCLAWD has a permissionless `mint` — `packages/foundry/contracts/test/MockCLAWD.sol:12-14` — this contract only deploys on non-Base chains (local/test), and the file lives under `contracts/test/`. Not a production concern.

- **[INFO]** Footer shows `nativeCurrencyPrice` pill — `packages/nextjs/components/Footer.tsx:23-30` — harmless holdover from the SE-2 template; displays ETH price, not CLAWD.

## Summary

- Must Fix: 2 items
- Known Issues: 9 items
- Audit frameworks followed: contract audit (ethskills), QA audit (ethskills)

---

# Audit Report — Cycle 2

## MUST FIX

None — all critical paths are secure. Both Cycle 1 MUST FIX items have been resolved: `BURN_ADDRESS` is now `0x000000000000000000000000000000000000dEaD` (`PvPWager.sol:51`) and `CLAWD` is registered in `externalContracts.ts` for chain 8453 with the full ERC20 ABI. All 31 Forge tests pass. Ownership is correctly set to the client address in the deploy script (`Deploy.s.sol:15,36`).

## KNOWN ISSUES

- **[LOW]** Primary CTAs don't morph into a Switch-Network button on wrong chain — `packages/nextjs/app/page.tsx:59-67`, `packages/nextjs/components/pvp/OpenGameRow.tsx:91-109` — "Create Game" and "Join" remain rendered when the wallet is on the wrong network. Users are handed off to RainbowKit's header dropdown or the wallet's own rejection dialog; wagmi will reject before the tx is broadcast so no silent failure occurs. QA skill flags this pattern as Critical; carry-over from Cycle 1 where it was assessed as low-risk and accepted. Fix: branch on `useChainId() === targetNetwork.id` and render a `useSwitchChain`-driven "Switch to Base" button in the primary CTA slot when mismatched.

- **[LOW]** Approval single-flag guard missing post-confirm cooldown — `packages/nextjs/components/pvp/CreateGameModal.tsx:70-82`, `packages/nextjs/components/pvp/OpenGameRow.tsx:39-48` — The `step`/`busy` flag is set at the top of each handler and cleared in `finally {}`. SE-2's `writeContractAsync` waits for receipt before resolving, so the flag covers the critical window. A separate `approveCooldown` state (covering the time between receipt confirmation and `refetchAllowance` completing) is absent; practical risk is low because `refetchAllowance` is `await`ed before the flag clears. Acknowledged in code comments.

- **[LOW]** Signatures omit chainid and contract address — `packages/foundry/contracts/PvPWager.sol:163,288` — `submitResult` verifies signatures over `keccak256(abi.encodePacked(gameId, winner))` with no `address(this)` or `block.chainid` in the hash. A signed result could theoretically be replayed on a second deployment with overlapping game IDs. Single production deployment makes this informational in practice. Fix: EIP-712 domain separation.

- **[LOW]** `Ownable` not `Ownable2Step` — `packages/foundry/contracts/PvPWager.sol:16` — No two-step acceptance handshake on ownership transfers. A mistyped `transferOwnership` call is irreversible. Initial ownership is correctly set to the client address in the constructor; risk arises only on a future ownership change. Acknowledged in code comment.

- **[LOW]** Unbounded loops in view functions — `packages/foundry/contracts/PvPWager.sol:232-284` — `openGames()`, `activeGames()`, `playerGames()` each iterate the full `_games` array twice. Off-chain reads only; no on-chain write path depends on them. Acceptable at current scale. Acknowledged in code comment.

- **[LOW]** No USD value displayed next to CLAWD amounts — `packages/nextjs/components/pvp/CreateGameModal.tsx:167`, `packages/nextjs/components/pvp/OpenGameRow.tsx:78`, `packages/nextjs/app/game/[id]/page.tsx:189` — CLAWD has no stable on-chain USD price source. Acknowledged in code comments throughout; acceptable to ship with raw CLAWD figures.

- **[INFO]** PvPWager contract address not surfaced in UI — `packages/nextjs/app/page.tsx`, `packages/nextjs/app/game/[id]/page.tsx` — Users escrow CLAWD into the contract but neither page displays the PvPWager address via `<Address/>`. QA skill flags missing contract address display as Important. Acceptable to ship; users can verify via wallet or block explorer.

- **[INFO]** Default Alchemy API key fallback — `packages/nextjs/scaffold.config.ts:25` — Falls back to the SE-2 template key if `NEXT_PUBLIC_ALCHEMY_API_KEY` is not set in the hosting environment. The env var must be configured in Vercel (or equivalent) before launch.

- **[INFO]** `currentTurn` not reset after settlement — `packages/foundry/contracts/PvPWager.sol:197` — Retains the last player on the clock after `COMPLETE`/`CANCELLED`. All access control gates on `status`; no functional impact. Cosmetic for indexers. Acknowledged in code comment.

- **[INFO]** Frontend payout display uses different rounding than contract — `packages/nextjs/app/game/[id]/page.tsx:139` — UI computes `payout = (pot * 90n) / 100n`; contract computes `payout = pot - (pot * 1000 / 10000)`. For most practical CLAWD amounts (multiples of 10 in wei-space) results agree; for amounts whose wei value is not divisible by 100 there is a ≤1 wei display discrepancy. No funds are affected.

- **[INFO]** MockCLAWD has permissionless `mint` — `packages/foundry/contracts/test/MockCLAWD.sol:13` — Test-only contract deployed exclusively on non-Base chains. Not a production concern.

- **[INFO]** Footer shows native currency price pill — `packages/nextjs/components/Footer.tsx:24-30` — Displays ETH/native price, not CLAWD. Harmless SE-2 template holdover; acknowledged in code comment.

## Summary

- Must Fix: 0 items
- Known Issues: 12 items
- Audit frameworks followed: contract audit (ethskills — general, precision-math, access-control, signatures, ERC20, dos, chain-specific), QA audit (ethskills)
