# Changelog

## Unreleased

### Added
- `game.pointer`: mouse and touch, with positions in pixels and meters
- `game.touch`: on-screen buttons that press keyboard keys
- `Input.press()` and `Input.release()`
- Sharp rendering on high-density screens, with `maxPixelRatio`
- `game.width`, `game.height` and `game.resize()`
- Interpolated drawing, with the `interpolation` option

### Changed
- `canvas.width` now includes the pixel ratio: use `game.width`
- Rapier 0.21
- A grounded player no longer presses into the floor, which made it stutter on Rapier 0.21
- The player rides the kinematic body under it explicitly, sideways and downwards

## 0.2.0

### Added
- Scenes and levels, sensors, animations, components, collision layers and the debug renderer
- `Game.create(canvas, { gravity, scale, background })`
- `game.on("error", ...)`
- `RAPIER` exported from the engine
- `once` and `off` on everything that has `on`

### Changed
- In a running game, `entity.destroy()` waits for the current step
- `clear()` and `destroy()` wait for the current step or draw
- Errors in game code no longer stop the loop
- `addEntity()` rejects an entity already in a game
- `configure()` rejects non-finite numbers
- `Trigger` is a `Sensor`, and no longer has `targetHalfWidth` or `targetHalfHeight`
- `Ground` is a `Platform` and `Box` is a `Shape`. `new Ground(world, collision?)` takes a filter

### Removed
- `game.getBodyCount()`: use `game.debug.getStats().bodies`

## 0.1.0

- First version: `Game`, `Entity`, `Ground`, `Box`, `Player` and `Input`
