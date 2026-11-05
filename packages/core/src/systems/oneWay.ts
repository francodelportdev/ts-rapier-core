import type RAPIER from "@dimforge/rapier2d-compat";
import type { Point } from "../core/Point";


/**
 * One-way surfaces, per world: collider handle → outline in world space.
 *
 * Collision filters run inside Rapier's WebAssembly code, where calling back into Rapier
 * (`collider.parent()`, `castRay()`, ...) fails silently. So everything the filter needs is
 * stored here, in plain JavaScript, when the platform is created.
 */
const surfaces = new WeakMap<RAPIER.World, Map<number, { outline: Point[]; closed: boolean }>>();

/**
 * Registers a fixed collider as a one-way platform. `outline` is its shape in world space:
 * a closed polygon, or an open chain of points for polylines (`closed: false`).
 */
export function registerOneWay(world: RAPIER.World, collider: RAPIER.Collider, outline: Point[], closed = true): void {
  let map = surfaces.get(world);
  if (map === undefined) {
    map = new Map();
    surfaces.set(world, map);
  }
  map.set(collider.handle, { outline, closed });
}

export function unregisterOneWay(world: RAPIER.World, collider: RAPIER.Collider): void {
  surfaces.get(world)?.delete(collider.handle);
}

/** True if the collider is a one-way platform. Safe to call inside collision filters. */
export function isOneWay(world: RAPIER.World, collider: RAPIER.Collider): boolean {
  return surfaces.get(world)?.has(collider.handle) ?? false;
}

/** How far above a one-way surface the character's bottom may be and still stand on it, in meters. */
const TOLERANCE = 0.05;

/** Highest point of the outline on the vertical line at `x`, or null if the line misses it. */
function topAt(outline: readonly Point[], closed: boolean, x: number): number | null {
  let top: number | null = null;
  const edges = closed ? outline.length : outline.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
    const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    if (top === null || y > top) top = y;
  }
  return top;
}

/**
 * True if a one-way collider should block a character whose bottom edge is at `bottom` and
 * spans `left`..`right`: only when the character is above its top surface. Below it or beside
 * it, the character passes through. Safe to call inside collision filters.
 */
export function oneWayBlocks(world: RAPIER.World, collider: RAPIER.Collider, left: number, right: number, bottom: number): boolean {
  const surface = surfaces.get(world)?.get(collider.handle);
  if (surface === undefined) return true;
  for (const x of [left, (left + right) / 2, right]) {
    const top = topAt(surface.outline, surface.closed, x);
    if (top !== null && top <= bottom + TOLERANCE) return true;
  }
  return false;
}

/** Local points → world space, for a body at (x, y) rotated by `angle` radians. */
export function toWorld(points: readonly Point[], x: number, y: number, angle: number): Point[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => ({ x: x + p.x * cos - p.y * sin, y: y + p.x * sin + p.y * cos }));
}
