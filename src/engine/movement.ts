/* Where a unit can walk this turn. Each step to a neighbouring tile costs 1 MP. A step may climb at most
   `jump` levels and drop at most `jump + 1` levels. Other units block the tile (no passing through). */
import { GridMap, NEIGHBOURS, Pos, TERRAIN, tileAt } from "./grid";

export interface MoveRules {
  mp: number;
  jump: number;
  /** Tiles taken by other units. */
  blocked: (p: Pos) => boolean;
}

const key = (p: Pos) => `${p.x},${p.y}`;

export function canStep(m: GridMap, from: Pos, to: Pos, jump: number): boolean {
  const a = tileAt(m, from), b = tileAt(m, to);
  if (!a || !b || !TERRAIN[b.terrain].walkable) return false;
  const rise = b.h - a.h;
  return rise <= jump && -rise <= jump + 1;
}

/** Every tile reachable with the unit's MP, with its cost and the path to it (start excluded). */
export function reachable(m: GridMap, start: Pos, rules: MoveRules): Map<string, { cost: number; path: Pos[] }> {
  const out = new Map<string, { cost: number; path: Pos[] }>();
  const queue: { p: Pos; path: Pos[] }[] = [{ p: start, path: [] }];
  const seen = new Set([key(start)]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.path.length >= rules.mp) continue;
    for (const d of NEIGHBOURS) {
      const n = { x: cur.p.x + d.x, y: cur.p.y + d.y };
      const k = key(n);
      if (seen.has(k) || rules.blocked(n) || !canStep(m, cur.p, n, rules.jump)) continue;
      seen.add(k);
      const path = [...cur.path, n];
      out.set(k, { cost: path.length, path });
      queue.push({ p: n, path });
    }
  }
  return out;
}

export function pathTo(m: GridMap, start: Pos, goal: Pos, rules: MoveRules): Pos[] | null {
  return reachable(m, start, rules).get(key(goal))?.path ?? null;
}
