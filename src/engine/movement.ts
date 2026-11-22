/* Where a unit can walk this turn.
   Each step to a neighbouring tile costs 1 MP. A step may climb at most `jump` levels and drop at most
   `jump + 1`. Other units block the tile. A unit that can swim may also step into water, for extra MP (swim.ts). Lock: a step that leaves a tile next to standing foes costs 1 extra MP
   for each of those foes whose Agility is at least the walker's (a slippery unit escapes, a slow one is pinned).
   A giant (size 2) moves its whole body one tile at a time: every tile it steps onto must take it, and each of its
   tiles keeps to the climb and drop limits. It walks straight through crates (they break) and tall grass (it is
   trampled flat), see state.ts. */
import { cellsOf, GridMap, NEIGHBOURS, Pos, standable, swimmable, TERRAIN, tileAt, type Tile } from "./grid";

export interface MoveRules {
  mp: number;
  jump: number;
  /** Tiles taken by other units (standing or downed). */
  blocked: (p: Pos) => boolean;
  /** Extra MP to leave this tile (Lock). Defaults to 0. */
  lockAt?: (p: Pos) => number;
  /** Tiles per side of the walker's body (2 for giants). Positions are its corner with the lowest x and y. */
  size?: number;
  /** Can swim: the extra MP for each step into water (0 for water creatures). Unset: water is closed to it. */
  swim?: number;
}

export interface Route { cost: number; path: Pos[] }

const key = (p: Pos) => `${p.x},${p.y}`;

export function canStep(m: GridMap, from: Pos, to: Pos, jump: number, swim = false): boolean {
  const a = tileAt(m, from), b = tileAt(m, to);
  if (!a || !b || !(standable(b) || (swim && swimmable(b)))) return false;
  const rise = b.h - a.h;
  return rise <= jump && -rise <= jump + 1;
}

/** A tile a giant's body can move onto: anything standable, or a crate it will crush. */
const giantFloor = (t: Tile | undefined): t is Tile => !!t && TERRAIN[t.terrain].walkable && (!t.prop || t.prop === "crate");

/** One step of a whole body (corner `from` to corner `to`): each of its tiles must take the step on its own. */
export function canStepBody(m: GridMap, from: Pos, to: Pos, jump: number, size = 1, swim = false): boolean {
  if (size <= 1) return canStep(m, from, to, jump, swim);
  const dx = to.x - from.x, dy = to.y - from.y;
  return cellsOf(from, size).every((c) => {
    const a = tileAt(m, c), b = tileAt(m, { x: c.x + dx, y: c.y + dy });
    if (!a || !giantFloor(b)) return false;
    const rise = b.h - a.h;
    return rise <= jump && -rise <= jump + 1;
  });
}

/** Every tile reachable with the unit's MP, with the cheapest cost and the path to it (start excluded). */
export function reachable(m: GridMap, start: Pos, rules: MoveRules): Map<string, Route> {
  const size = rules.size ?? 1;
  const best = new Map<string, Route>([[key(start), { cost: 0, path: [] }]]);
  // Small maps: a simple priority list is plenty. Ties keep insertion order, so results are deterministic.
  const open: { p: Pos; cost: number; path: Pos[] }[] = [{ p: start, cost: 0, path: [] }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift()!;
    if (cur.cost > (best.get(key(cur.p))?.cost ?? Infinity)) continue;
    const leave = 1 + (rules.lockAt?.(cur.p) ?? 0);
    for (const d of NEIGHBOURS) {
      const n = { x: cur.p.x + d.x, y: cur.p.y + d.y };
      const cost = cur.cost + leave + (rules.swim !== undefined && tileAt(m, n)?.terrain === "water" ? rules.swim : 0);
      if (cost > rules.mp || cellsOf(n, size).some(rules.blocked) || !canStepBody(m, cur.p, n, rules.jump, size, rules.swim !== undefined)) continue;
      const k = key(n);
      if (cost >= (best.get(k)?.cost ?? Infinity)) continue;
      const path = [...cur.path, n];
      best.set(k, { cost, path });
      open.push({ p: n, cost, path });
    }
  }
  best.delete(key(start));
  return best;
}

export function routeTo(m: GridMap, start: Pos, goal: Pos, rules: MoveRules): Route | null {
  return reachable(m, start, rules).get(key(goal)) ?? null;
}
