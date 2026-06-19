# AGENTS.md — deploying this example

A canonical, copy-pasteable contract for an automated agent deploying
`thebes-example-cards` (Majlis — on-chain Estimation & Tarneeb) to a Thebes
cluster. Human-readable detail is in [README.md](README.md).

## Layout

```
thebes.toml                 deploy manifest (network + canisters)
motoko/main.mo              backend (Motoko); imports mo:thebes-lib/Admin
motoko/thebes-lib/          vendored backend library (local Mops dep — no external pin)
frontend/                   React + Vite app on @thebes/sdk
frontend/vendor/@thebes/sdk vendored SDK (local file: dep — no external pin)
```

## Toolchain (exact)

- Motoko compiler **1.4.1**, fetched by `mops install` to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Do **not** invoke a bare `moc` — a default `PATH` may resolve a different
  compiler version or Qt's Meta-Object Compiler.
- Node 18+, Mops, and the `thebes-deploy` CLI (Linux x86-64 prebuilt; build from
  the release source bundle on other platforms).
- `mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned.
  This is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

```sh
# 0. network: thebes.toml [networks.wan].validators is pre-filled with the
#    current WAN cluster. Re-run `thebes-deploy init` to refresh if the cluster moves.
thebes-deploy init            # prints current WAN cluster validators

# 1. backend
thebes-deploy identity new me
thebes-deploy deploy cards    # → prints the backend cid (call it CARDS_CID)

# 2. frontend
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
cd frontend && npm install && npm run build && cd ..
sed -i 's#<head>#<head><script>window.CARDS_CID=CARDS_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web      # → prints https://memphis.mercaturaforum.com/_/raw/<cid>/index.html
```

Verify: `curl -s -o /dev/null -w '%{http_code}' <printed-url>` returns `200`.

## Calling the backend

```sh
thebes-deploy query cards openTables                                  # queries need no identity
thebes-deploy call  cards createTable --arg '("estimation", "Table 1")'   # updates need a local identity
```

Candid arguments are passed with `--arg` in textual form, e.g.
`--arg '("estimation", "Table 1")'` or `--arg '(0 : nat, "Bob")'`.
Game flow: `createTable` → others `joinTable` → `startHand` → `bid`/`passBid`
(Tarneeb) or `estimate` (Estimation) → `playCard`. Read state with
`gameStateView` / `seatsView` / `myHandView` / `openTables`.

## Conventions that affect correctness

- **`window.CARDS_CID`** is injected into the built page at deploy time; the
  frontend reads it at runtime. If you skip the injection step, the page falls
  back to `0` and cannot reach a backend.
- **Boundary decoding** returns a `vec record` of scalar fields. A single record
  is a 0-or-1-element array; principal fields are 56-character hex. Decode with
  the SDK's `decodeVecRecord` / `decodeNat` / `decodeBool`.
- Card ids are `0..51`: `suit = id/13` (0♣ 1♦ 2♥ 3♠), `rank = id%13` (0=2 … 12=A);
  trump/suit code `4` = No-Trump. Seats are `0..3`.
