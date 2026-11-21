/* Reach, explained: for one ability and one tile, how far the tile is, how far the ability reaches from where the
   caster stands (after height and Aim), and what stops it, if anything. The rules live in combat.ts (maxRange,
   castProblem); this only takes them apart so the board and the tooltips can show them. */
import type { Ability } from "../data/abilities";
import { manhattan, nearestCell, tileAt, type Pos } from "./grid";
import { sightBlocker } from "./sight";
import { maxRange } from "./combat";
import { bodiesInWay, sizeOf, type BattleState, type Unit } from "./state";

/** near = closer than the minimum; far = past the reach; low = inside the card's reach but lost to lower ground;
    sight = in reach, but the line of sight is cut. */
export type ReachProblem = "near" | "far" | "low" | "sight";

export interface Reach {
  /** Tiles from the caster (Manhattan). */
  dist: number;
  min: number;
  /** The reach printed on the card. */
  base: number;
  /** The reach from here to this tile, after height and Aim. */
  max: number;
  /** Reach gained (+) or lost (−) to height for this tile. */
  height: number;
  /** Reach gained from Aim. */
  aim: number;
  problem: ReachProblem | null;
  /** The tile that cuts the line of sight, when problem is "sight". */
  blocker?: Pos;
}

/** Whether height and Aim change this ability's reach at all (melee and Jump keep theirs). */
export const heightShapesReach = (ab: Ability) => ab.range[1] > 1 && !ab.jump;

export function reachAt(s: BattleState, u: Unit, ab: Ability, p: Pos, at: Pos = u.pos): Reach {
  const from = nearestCell(at, sizeOf(u), p); // a giant reaches from its closest tile
  const dist = manhattan(from, p), base = ab.range[1], min = ab.range[0];
  const max = maxRange(s, ab, from, p, u);
  const aim = heightShapesReach(ab) && u.aiming && !ab.quick ? 1 : 0;
  const height = max - base - aim;
  const out: Reach = { dist, min, base, max, height, aim, problem: null };
  if (dist < min) out.problem = "near";
  else if (dist > max) out.problem = dist <= base + aim ? "low" : "far";
  else if (ab.los && dist > 0) {
    const blocker = sightBlocker(s.map, from, p, bodiesInWay(s, [u.id], p));
    if (blocker && tileAt(s.map, p)) { out.problem = "sight"; out.blocker = blocker; }
  }
  return out;
}

/** The farthest any tile could be reached from `from` (the highest drop on the map counts), to bound searches. */
export function reachBound(s: BattleState, u: Unit, ab: Ability, from: Pos = u.pos): number {
  if (!heightShapesReach(ab)) return ab.range[1];
  const here = tileAt(s.map, from)?.h ?? 0;
  let low = here;
  for (const t of s.map.tiles) low = Math.min(low, t.h);
  return ab.range[1] + (here - low) + (u.aiming && !ab.quick ? 1 : 0);
}
