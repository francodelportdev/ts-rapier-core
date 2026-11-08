# Changelog

## 0.3.0

### Added
- `SCALE` exported
- `game.pointer`: mouse and touch, with positions in pixels and meters
- `game.touch`: on-screen buttons that press keyboard keys
- `Input.press()` and `Input.release()`
- Sharp rendering on high-density screens, with `maxPixelRatio`
- `game.width`, `game.height` and `game.resize()`
- Interpolated drawing, with the `interpolation` option
- `game.audio`: effects, music, volumes, and sounds made by code
- `game.gamepad`: physical pads, with custom layouts
- `Controls`: editable keyboard and gamepad bindings that can be saved
- `entity.setPosition()`, `getVelocity()` and `setVelocity()` on every entity
- `player.knockback()`, `setSpawn()` and `getSpawn()`, and `checkpoints` in `LevelData`
- `game.pause()`, `game.resume()` and `game.isPaused()`: freeze the game while it keeps drawing
- Collisions: the `collisionStart` and `collisionEnd` events, and `onCollisionStart()` and `onCollisionEnd()` on entities and components

### Changed
- `update(dt)` on entities and scenes receives the step in seconds, like components. It's optional on entities
- `Platform` (and `Ground`) is now a `Shape`
- `Controls` has `once()` and `off()`
- `Observable<Events>`: a base class that gives your own classes `on`, `once` and `off`
- `getAngle()` moved from `Shape` to `Entity`, so every entity has it
- Actions: `Input.isAction()`, and on-screen buttons and pads press `left`, `right`, `jump`, `dash` and `down` instead of keys
- `TouchButton.key` is now `press`, and gamepad mappings use actions: `{ buttons: { jump: [2] } }`
- `Input.setBindings()` is now `Input.setActionKeys()`
- `canvas.width` now includes the pixel ratio: use `game.width`
- Rapier 0.21
- A grounded player no longer presses into the floor, which made it stutter on Rapier 0.21
- The player rides the kinematic body under it explicitly, sideways and downwards

### Fixed
- The player no longer flies off when leaving a moving platform
- `game.destroy()` ends the current scene: `onExit()` and its cleanups run
- A canvas can be reused by a new game without doubling its size on high-density screens
- `game.resize()` also changes the displayed size of a canvas without CSS sizing
- `stop()` and `start()` from a listener no longer leave two loops running
- On-screen buttons and gamepads work with a player that has its own `keys`
- A key tapped during a fade no longer reaches the next scene
- `configure({ jumpHeight })` also changes wall jumps that use the player's height
- A `once` sensor fires `enter` only once when several entities enter together
- A component whose `onAttach()` throws isn't left attached
- `Controls.load()` keeps each input in a single action
- `Health.damage(NaN)` is ignored
- `validateLevel()` also checks platforms, shapes, boxes, hazards and coins
- The kill plane no longer removes a `Player`, which respawns instead
- On-screen buttons and pads held while the window loses focus work again on their next update
- `grid.size` must be above 0, instead of hanging the page
- Audio stays silent after `game.destroy()`
- `Game.create()` can try again after Rapier fails to load
- Using a destroyed entity throws a clear error, instead of breaking Rapier's memory. `getPosition()` and `getAngle()` keep working, with where it was

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
