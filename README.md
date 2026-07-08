# thebes-example-cards

Majlis — an on-chain card game (Estimation and Tarneeb) built on
[Thebes Protocol](https://github.com/Mercatura-Forum/Thebes-Protocol-): a Motoko
backend that holds the table, the shuffled deck, and the full game state machine,
and a React frontend served as certified assets. It demonstrates the shape of a
Thebes application — passkey sign-in, controller-gated admin, protocol-randomness
shuffles, and on-chain reads — in one self-contained example.

## Architecture

```
frontend (React + Vite + Tailwind)   →   cards backend (Motoko)
   @thebes/sdk  ── boundary client       mo:thebes-lib ── Admin
   Memphis passkey gate                  tables · deal · bidding · play
```

- **frontend/** uses `@thebes/sdk` for the boundary client, typed query/update
  calls, React hooks, and the Memphis passkey gate. The SDK is **vendored** under
  `frontend/vendor/@thebes/sdk` and resolved as a local dependency
  (upstream source of truth: [`thebes-sdk`](https://github.com/Mercatura-Forum/thebes-sdk)).
- **motoko/** uses `thebes-lib` for `Admin` (controller-gated operations); the
  game logic lives in `main.mo`. The library is **vendored** under
  `motoko/thebes-lib` and resolved as a local Mops dependency.

Both halves are self-contained: the repository builds with no external Git or Mops
toolkit pins. The frontend asset-canister wasm is the one artifact fetched at
deploy time (see [Deploy](#deploy)).

## Game

Four seats per table. A hand is dealt from `raw_rand` — the protocol's randomness,
so no client and no single replica controls the shuffle. **Tarneeb**: players bid a
contract and a trump suit, then play tricks. **Estimation**: a bidding round sets
the declarer and trump, then each player estimates the tricks they will win
(constrained so the table's estimates never sum to 13), then play.

A match is five hands; the highest score (team score in Tarneeb) takes the diwan,
and a rematch resets the same seats. Any open seat can be filled with a **house
bot** — bots act inside the same message as your move, through the same validated
move core, so the house cannot cheat any more than a player can. An all-pass
auction falls to the dealer's burden (minimum bid in their longest suit), an idle
human seat can be nudged after the grace window, and lifetime results land in the
on-chain leaderboard.

The property this example proves is **card conservation under enforced rules**:
at any moment of any game, 52 cards are accounted across hands, the current trick
and taken tricks, no card exists in two places, and the tricks and estimates laws
hold — recomputable by anyone through the public oracle (`invariantReportView`).

## Backend interface (selected)

| Method | Kind | Purpose |
| --- | --- | --- |
| `openTables` | query | List tables — joinable and in play. |
| `createTable` / `joinTable` / `addBot` / `closeTable` | update | Table lifecycle; the creator takes seat 0; `addBot` seats the house. |
| `startHand` / `rematch` | update | Shuffle from `raw_rand` and deal; reset the diwan after a match. |
| `bid` / `passBid` / `estimate` / `playCard` | update | The validated move core — turn order, bid legality, follow-suit, the sum-not-13 law. |
| `nudge` | update | After the idle window, the house plays a stalled human seat's turn. |
| `gameStateView` / `seatsView` / `myHandView` / `tableEventsView` | query | Table, seats, your hand, and the table's story. |
| `leaderboardView` / `myStatsView` | query | Lifetime results, kept by the contract. |
| `invariantReportView` / `conservationView` | query | **The public oracle** — 52 cards accounted, no duplicates, tricks + estimates laws. |
| `claimOwner` / `getOwner` | update / query | Ownership surface (from `thebes-lib`'s `Admin`). |

Card ids are `0..51`: `suit = id/13` (0♣ 1♦ 2♥ 3♠), `rank = id%13` (0=2 … 12=A);
trump/suit code `4` = No-Trump.

## Toolchain

- **Motoko compiler 1.4.1.** `mops install` fetches the pinned compiler to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Use that binary — the `moc` on a default `PATH` may be a different version, or
  Qt's unrelated Meta-Object Compiler.
- **Node 18+** and **[Mops](https://mops.one)** for the two builds.
- **[`thebes-deploy`](https://github.com/Mercatura-Forum/Thebes-Protocol-/releases)**
  to deploy. The prebuilt binary is Linux x86-64; on other platforms build it from
  the release source bundle (`cargo build --release -p thebes-deploy`).

## Run locally

```sh
# Frontend
cd frontend
npm install            # resolves the vendored @thebes/sdk
npm run dev            # sync-sdk copies the browser runtimes into public/, then Vite serves

# Backend (compile-check)
cd ../motoko
mops install           # resolves the vendored thebes-lib + the pinned compiler
"$(ls "$HOME/.cache/mops/moc/1.4.1/moc" "$HOME/Library/Caches/mops/moc/1.4.1/moc" 2>/dev/null | head -1)" --check $(mops sources) main.mo
```

## Deploy

`thebes.toml` describes the deploy. Its `validators` array is pre-filled with the
current WAN cluster — run `thebes-deploy init` to print the live endpoints and
refresh them if the cluster has moved.

> **Deploying your own copy?** The committed `cid` values pin the **live catalog
> deployment** (that's what the demo links serve — only its controller can
> upgrade it). Before your first deploy, set `cid = "auto"` on each canister:
> the deploy allocates fresh canisters you control and writes their ids back
> into the manifest.

### 1. Backend

```sh
thebes-deploy identity new me      # one-time local signing identity
thebes-deploy deploy cards         # build + install + verify → prints the backend cid
```

### 2. Frontend

The frontend installs an asset canister, then uploads your built bundle. Fetch the
asset-canister wasm once (it is referenced by `thebes.toml` as `asset_canister.wasm`):

```sh
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
```

Build the bundle and point it at your backend cid (the frontend reads
`window.CARDS_CID` at runtime), then deploy:

```sh
cd frontend && npm run build && cd ..
# inject the backend cid from step 1 into the built page:
sed -i 's#<head>#<head><script>window.CARDS_CID=YOUR_CARDS_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web           # install asset canister + upload bundle + verify
```

The deploy prints the live URL:
`https://memphis.mercaturaforum.com/_/raw/<web-cid>/index.html`.

For a machine-readable deploy contract, see [AGENTS.md](AGENTS.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
