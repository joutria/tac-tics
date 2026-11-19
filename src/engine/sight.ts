/* Line of sight between two tiles, with heights. The eye sits one level above the tile it stands on.
   A tile in between blocks the line when its top (height + obstacle) rises above the line at that point,
   or when a unit stands on it and the line passes through the unit's body. */
import { GridMap, Pos, sightBlock, samePos, tileAt } from "./grid";

const EYE = 1;

/** Tiles the straight line from a to b crosses, ends excluded, in order. */
export function tilesBetween(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 4;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
    // A sample exactly on a corner rounds both ways; Math.round picks one side, which keeps it deterministic.
    if (samePos(p, a) || samePos(p, b)) continue;
    if (!out.some((q) => samePos(q, p))) out.push(p);
  }
  return out;
}

export function hasLineOfSight(m: GridMap, a: Pos, b: Pos, occupied: (p: Pos) => boolean = () => false): boolean {
  const ta = tileAt(m, a), tb = tileAt(m, b);
  if (!ta || !tb) return false;
  const from = ta.h + EYE, to = tb.h + EYE;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  for (const p of tilesBetween(a, b)) {
    const tile = tileAt(m, p)!;
    const t = Math.hypot(p.x - a.x, p.y - a.y) / dist;
    const lineH = from + (to - from) * t;
    let top = tile.h + sightBlock(tile);
    if (occupied(p)) top = Math.max(top, tile.h + EYE);
    if (top >= lineH) return false;
  }
  return true;
}
