# ts-rapier-core

[![CI](https://github.com/francodelportdev/ts-rapier-core/actions/workflows/ci.yml/badge.svg)](https://github.com/francodelportdev/ts-rapier-core/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/rapier-engine)](https://www.npmjs.com/package/rapier-engine)

An object-oriented 2D game engine for the web, built on [Rapier](https://rapier.rs) physics, plus a playable demo.

**[Play the demo](https://francodelportdev.github.io/ts-rapier-core/)**: every feature on its own page, with its source code.

| Path | What it is |
|---|---|
| [`packages/core`](packages/core) | `rapier-engine`, the engine package ([API docs](packages/core/README.md)) |
| [`apps/game`](apps/game) | Vite demo that uses the engine ([walkthrough](apps/game/README.md)) |

## Getting started

Requires [Bun](https://bun.com) 1.4.4 or later.

> **Known issue:** the tests sometimes crash inside Rapier's WebAssembly, with `Out of bounds memory access` or `Unreachable code`. It happens in about 1 run in 150 of the full suite on Bun 1.4, and about 1 in 25 on Bun 1.2, never in a single test file. The cause is unknown. If it happens, run the tests again. The game in the browser isn't affected.

```bash
bun install
bun run dev      # starts the demo at http://localhost:5173
bun run build    # builds every workspace
bun run test     # runs the engine's tests
bun run typecheck
```

## License

[MIT](LICENSE)
