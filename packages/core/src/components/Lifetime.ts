import { Component } from "./Component";

/** Removes its entity from the game after some time, for projectiles and effects. */
export class Lifetime extends Component {
  private remaining: number;

  constructor(seconds: number) {
    super();
    this.remaining = seconds;
  }

  public override update(dt: number): void {
    this.remaining -= dt;
    if (this.remaining > 0) return;
    const { entity } = this;
    const game = entity.getGame();
    if (game !== null) game.removeEntity(entity);
    else entity.destroy();
  }
}
