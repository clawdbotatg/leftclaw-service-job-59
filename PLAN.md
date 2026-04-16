# Build Plan — Job #59

## Client
0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471

## Spec
PvP Wager Games — CLAWD Chess and Checkers. Build and deploy a PvPWager.sol contract + frontend on Base. Two players escrow equal CLAWD into a contract and play chess or checkers. Winner claims 90% of the pot, 10% is permanently burned. Timeout means forfeit. Supports both chess and checkers in the same contract. Game logic lives off-chain — both players sign moves — contract only holds the money and enforces timeouts and outcomes.

CONTRACT: PvPWager.sol

DESIGN PHILOSOPHY:
Game logic (legal move validation, board state) is entirely off-chain. The contract is a pure escrow + dispute arbiter. Both players sign each move as a message. If both agree on the outcome they co-sign a result and the contract pays out instantly. If one player times out or goes silent, the other player can claim forfeit after a timeout window. If there is a genuine dispute about a move, the owner wallet acts as arbiter and calls resolveDispute(). This keeps the contract tiny and auditable.

GAME TYPES:
- gameType 0 = Chess
- gameType 1 = Checkers
Both use identical contract logic — gameType is just metadata recorded on-chain and displayed on the frontend.

STATE PER GAME:
- uint256 gameId
- uint8 gameType — 0=chess, 1=checkers
- address playerA — created the game
- address playerB — joined the game
- uint256 wager — CLAWD amount each player puts in (total pot = wager * 2)
- uint256 timeout — seconds a player has to move before opponent can claim forfeit (suggest 24 hours)
- uint256 lastMoveTime — block.timestamp of last move or game creation
- address currentTurn — whose turn it is
- GameStatus status — enum: OPEN, ACTIVE, COMPLETE, CANCELLED
- address winner — set on completion
- uint256 burnAmount — recorded at settlement

FUNCTIONS:
createGame(uint8 gameType, uint256 wager, uint256 timeoutSeconds) — public. Transfers wager CLAWD from caller. Creates game with status OPEN, playerA = msg.sender. Emits GameCreated(gameId, msg.sender, gameType, wager).

joinGame(uint256 gameId) — public, game status must be OPEN, msg.sender != playerA. Transfers wager CLAWD from caller. Sets playerB = msg.sender, status = ACTIVE, currentTurn = playerA (white/first mover), lastMoveTime = block.timestamp. Emits GameJoined(gameId, msg.sender).

recordMove(uint256 gameId, string calldata move) — public, caller must be currentTurn, status ACTIVE. Does NOT validate the move — just records it as an event and flips currentTurn to the other player. Updates lastMoveTime. Emits MoveMade(gameId, msg.sender, move). The move string is algebraic notation for chess (e.g. e2e4) or checkers notation. Frontend uses this event log as the authoritative game history.

claimForfeit(uint256 gameId) — public, status ACTIVE, caller is the player whose turn it is NOT (i.e. waiting on opponent). Requires block.timestamp > lastMoveTime + timeout. Sets winner = msg.sender, calls _settle(gameId). Opponent timed out = forfeit. Emits ForfeitClaimed(gameId, msg.sender).

submitResult(uint256 gameId, address winner, bytes calldata sigA, bytes calldata sigB) — public, status ACTIVE. Both players must have signed the message keccak256(abi.encodePacked(gameId, winner)) with EIP-191. Verifies both signatures. Sets winner, calls _settle(gameId). This is the happy path — both players agree on the result and submit it together (either player can call once both sigs are collected). Emits ResultSubmitted(gameId, winner).

resolveDispute(uint256 gameId, address winner) — owner only, status ACTIVE. Emergency arbiter function. Owner declares winner after reviewing the move history from events. Calls _settle(gameId). Emits DisputeResolved(gameId, winner).

cancelGame(uint256 gameId) — playerA only, status OPEN (no opponent joined yet). Refunds wager to playerA. Sets status CANCELLED. Emits GameCancelled(gameId).

_settle(uint256 gameId) internal — computes burnAmount = pot * 10 / 100. Sends burnAmount to address(0). Sends pot - burnAmount to winner. Sets status COMPLETE. Emits GameComplete(gameId, winner, pot - burnAmount, burnAmount).

VIEW FUNCTIONS:
getGame(uint256 gameId) — returns full game state.
openGames() — returns array of gameIds with status OPEN (available to join).
activeGames(address player) — returns gameIds where player is playerA or playerB and status ACTIVE.

CLAWD token on Base: 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07. Burn to address(0).

FRONTEND:
Lobby: two tabs — Chess and Checkers. Each tab shows open games available to join (opponent wallet truncated, wager amount, timeout setting). Create Game button opens a modal: select wager amount (preset options: 1M, 5M, 10M, 50M CLAWD or custom), select timeout (1h / 6h / 24h), confirm creates game.

Game view: rendered chess board (use react-chessboard library) or checkers board. Both players see the live board state reconstructed from the MoveMade event log. Current player to move is highlighted. Move input: click-to-move on the board. Submitting a move calls recordMove() on-chain with algebraic notation.

Resign button: generates a signed message declaring opponent as winner. Shares the signature link for opponent to co-sign and submit via submitResult(). 

Timeout panel: if it is your turn and opponent has not moved in X hours, show a Claim Forfeit button that calls claimForfeit().

Active games sidebar: your current games with status, whose turn, wager, time since last move.

Completed games history: game ID, opponent, wager, result (W/L), amount won or burned.

Stack: scaffold-eth 2, Next.js, wagmi/viem, react-chessboard for chess rendering. Deploy to Vercel.

Deploy contract to Base mainnet, verify on Basescan. Owner wallet: 0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471. No proxy needed.

## Deploy
- Chain: Base (8453)
- RPC: Alchemy (ALCHEMY_API_KEY in .env)
- Deployer: 0x7a8b288AB00F5b469D45A82D4e08198F6Eec651C (DEPLOYER_PRIVATE_KEY in .env)
- All owner/admin/treasury roles transfer to client: 0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471
