/* Line of sight between two tiles, with heights. The eye sits one level above the tile it stands on.
   A tile in between blocks the line when its top (height + obstacle) rises above the line at that point,
   or when a unit stands on it and the line passes through the unit's body. */
import { GridMap, Pos, sightBlock, tileAt } from "./grid";

const EYE = 1;
/** How many levels a giant's body rises: as tall as a tree, so nothing sees past it. */
export const BIG_BODY = 2;

/** The tiles the straight line from the centre of a to the centre of b passes through, ends excluded, in order.
    Each step is one tile, or two when the line passes exactly through a corner (a perfect diagonal): then it
    slips between them, and only blocks if both do. Integer maths only, so the result is the same in every
    direction and from either end (a can see b exactly when b can see a). */
export function tilesBetween(a: Pos, b: Pos): Pos[][] {
  const out: Pos[][] = [];
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x), sy = Math.sign(b.y - a.y);
  let x = a.x, y = a.y, ix = 0, iy = 0;
  while (ix < dx || iy < dy) {
    // Next vertical edge at t = (2ix+1)/(2dx), next horizontal at (2iy+1)/(2dy); compare without dividing.
    const cmp = (2 * ix + 1) * dy - (2 * iy + 1) * dx;
    if (dy === 0 || (dx > 0 && cmp < 0)) { x += sx; ix++; out.push([{ x, y }]); }
    else if (dx === 0 || cmp > 0) { y += sy; iy++; out.push([{ x, y }]); }
    else { out.push([{ x: x + sx, y }, { x, y: y + sy }]); x += sx; y += sy; ix++; iy++; out.push([{ x, y }]); }
  }
  out.pop(); // b itself
  return out;
}

/** `occupied` says whether a unit's body stands on a tile in between: true for one of normal height, or a number of
    levels (a giant is BIG_BODY tall, so it blocks sight like a wall). */
export function hasLineOfSight(m: GridMap, a: Pos, b: Pos, occupied: (p: Pos) => boolean | number = () => false): boolean {
  const ta = tileAt(m, a), tb = tileAt(m, b);
  if (!ta || !tb) return false;
  const from = ta.h + EYE, to = tb.h + EYE;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const blocks = (p: Pos) => {
    const tile = tileAt(m, p);
    if (!tile) return false; // off the map, beside a corner the line only grazes
    const t = Math.hypot(p.x - a.x, p.y - a.y) / dist;
    const lineH = from + (to - from) * t;
    let top = tile.h + sightBlock(tile);
    const body = occupied(p);
    if (body) top = Math.max(top, tile.h + (typeof body === "number" ? body : EYE));
    return top >= lineH;
  };
  for (const step of tilesBetween(a, b)) if (step.every(blocks)) return false;
  return true;
}
