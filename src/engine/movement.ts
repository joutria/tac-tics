/* Where a unit can walk this turn.
   Each step to a neighbouring tile costs 1 MP. A step may climb at most `jump` levels and drop at most
   `jump + 1`. Other units block the tile. Lock: a step that leaves a tile next to standing foes costs 1 extra MP
   for each of those foes whose Agility is at least the walker's (a slippery unit escapes, a slow one is pinned). */
import { GridMap, NEIGHBOURS, Pos, TERRAIN, tileAt } from "./grid";

export interface MoveRules {
  mp: number;
  jump: number;
  /** Tiles taken by other units (standing or downed). */
  blocked: (p: Pos) => boolean;
  /** Extra MP to leave this tile (Lock). Defaults to 0. */
  lockAt?: (p: Pos) => number;
}

export interface Route { cost: number; path: Pos[] }

const key = (p: Pos) => `${p.x},${p.y}`;

export function canStep(m: GridMap, from: Pos, to: Pos, jump: number): boolean {
  const a = tileAt(m, from), b = tileAt(m, to);
  if (!a || !b || !TERRAIN[b.terrain].walkable) return false;
  const rise = b.h - a.h;
  return rise <= jump && -rise <= jump + 1;
}

/** Every tile reachable with the unit's MP, with the cheapest cost and the path to it (start excluded). */
export function reachable(m: GridMap, start: Pos, rules: MoveRules): Map<string, Route> {
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
      const cost = cur.cost + leave;
      if (cost > rules.mp || rules.blocked(n) || !canStep(m, cur.p, n, rules.jump)) continue;
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
