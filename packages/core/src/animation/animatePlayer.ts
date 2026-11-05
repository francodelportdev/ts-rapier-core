import type { Player, PlayerState } from "../entities/Player";
import type { Sprite } from "./Sprite";

/**
 * Makes a sprite follow a player: it plays the clip of each state and mirrors to the facing
 * direction. By default, clips are named like the states ("idle", "run", "jump", "fall",
 * "dash", "wallSlide"); `clips` renames them, and a state without a clip plays "idle".
 * It returns a function that stops following.
 */
export function animatePlayer(player: Player, sprite: Sprite, clips: Partial<Record<PlayerState, string>> = {}): () => void {
  const animator = sprite.animator;
  if (animator === undefined) throw new Error("animatePlayer() needs a sprite with an animator");
  const play = (state: PlayerState) => {
    const name = clips[state] ?? state;
    try {
      animator.play(name);
    } catch {
      animator.play(clips.idle ?? "idle");
    }
  };
  player.setSprite(sprite);
  sprite.setFlipX(() => player.getFacing() < 0);
  play(player.getState());
  return player.on("stateChange", ({ to }) => play(to));
}
