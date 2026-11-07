# ts-rapier-core

[![CI](https://github.com/francodelportdev/ts-rapier-core/actions/workflows/ci.yml/badge.svg)](https://github.com/francodelportdev/ts-rapier-core/actions/workflows/ci.yml)

An object-oriented 2D game engine for the web, built on [Rapier](https://rapier.rs) physics, plus a playable demo.

| Path | What it is |
|---|---|
| [`packages/core`](packages/core) | `@francodelportdev/rapier-engine`, the engine package ([API docs](packages/core/README.md)) |
| [`apps/game`](apps/game) | Vite demo that uses the engine ([walkthrough](apps/game/README.md)) |

## Getting started

Requires [Bun](https://bun.com) 1.4.4 or later. Earlier versions crash at random inside Rapier's WebAssembly while running the tests.

```bash
bun install
bun run dev      # starts the demo at http://localhost:5173
bun run build    # builds every workspace
bun run test     # runs the engine's tests
bun run typecheck
```

## License

[MIT](LICENSE)
