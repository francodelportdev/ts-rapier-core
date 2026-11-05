/** Rapier packs both halves into 32 bits, so there are at most 16 layers. */
const MAX_LAYERS = 16;

/** Every layer. The default for both `layers` and `mask`. */
export const ALL_LAYERS = 0xffff;

/**
 * What an entity is, and what it collides with, as bit masks. Two entities collide only if
 * each one's `layers` is in the other's `mask`: both have to agree.
 */
export interface CollisionFilter {
  /** The layers the entity belongs to. */
  layers: number;
  /** The layers it collides with. */
  mask: number;
}

/** A filter as a Rapier interaction group: memberships in the high 16 bits, filter in the low 16. */
export function toInteractionGroups({ layers, mask }: CollisionFilter): number {
  return (((layers & ALL_LAYERS) << 16) | (mask & ALL_LAYERS)) >>> 0;
}

export interface Layers<TName extends string> {
  /** The bit of a layer. */
  bit(name: TName): number;
  /** A filter: belongs to `layer` (or several), and collides with `collidesWith`. */
  filter(layer: TName | readonly TName[], collidesWith: readonly TName[]): CollisionFilter;
}

/**
 * Names your collision layers.
 *
 * ```ts
 * const layers = defineLayers(["world", "player", "enemy"]);
 * new Player(world, { collision: layers.filter("player", ["world", "enemy"]) });
 * ```
 */
export function defineLayers<const TName extends string>(names: readonly TName[]): Layers<TName> {
  if (names.length > MAX_LAYERS) throw new Error(`At most ${MAX_LAYERS} collision layers are available`);
  if (new Set(names).size !== names.length) throw new Error("Collision layer names must be unique");
  const bit = (name: TName): number => {
    const index = names.indexOf(name);
    if (index === -1) throw new Error(`Unknown collision layer "${name}"`);
    return 1 << index;
  };
  const combine = (list: readonly TName[]): number => list.reduce((bits, name) => bits | bit(name), 0);
  return {
    bit,
    filter: (layer, collidesWith) => ({
      layers: combine(typeof layer === "string" ? [layer as TName] : (layer as readonly TName[])),
      mask: combine(collidesWith),
    }),
  };
}
