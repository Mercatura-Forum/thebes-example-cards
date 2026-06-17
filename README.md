# thebes-example-cards

A Thebes Protocol example: Majlis, an on-chain card game (Estimation and Tarneeb). A Motoko backend holds the on-chain
state and a React frontend is served as certified assets — demonstrating passkey
sign-in, controller-gated admin, and paginated on-chain reads on
[Thebes Protocol](https://github.com/Mercatura-Forum/Thebes-Protocol-).

## Architecture

- **frontend/** depends on [`@thebes/sdk`](https://github.com/Mercatura-Forum/thebes-sdk)
  for the boundary client, typed query/update calls, React hooks, and the Memphis
  passkey gate.
- **motoko/** depends on [`thebes-lib`](https://github.com/Mercatura-Forum/thebes-lib)
  for `Admin`, `MemphisAuth`, `Users`, and `Pagination`; the application logic
  lives in `motoko/main.mo`.

Neither toolkit is copied into this repo — both resolve as pinned git/mops
dependencies, so there is exactly one source of truth for each.

## Run locally

```sh
cd frontend && npm install && npm run dev      # pulls @thebes/sdk (git dependency)
cd ../motoko && mops install && moc --check $(mops sources) main.mo
```

## License

Apache-2.0. See [LICENSE](LICENSE).
