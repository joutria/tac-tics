/* Escapes (M2). A Savia-marked foe that is losing can try to leave the battle through the edge of the map; one
   that makes it out becomes a rival (see the plan doc, "Rivals"). Nothing here happens before round 3.

   Tactical retreat: the foe has downed or killed one of the players' party and is under 50% HP. It moves 1 MP
   slower but takes 30% less damage while it backs off to the edge.
   Flee: under 5% HP. It gains 2 MP and runs for the edge, but takes 25% more damage, and every adjacent enemy
   pins it with Lock (2 extra MP each, whatever its Agility). Root stops it cold.
   The player sees both states, plus a "wavering" warning when a foe is close to either line. */
import { Pos } from "./grid";
import type { BattleState, Unit } from "./state";

export type EscapeState = "none" | "retreat" | "flee";

export const ESCAPE_FROM_ROUND = 3;
export const RETREAT_BELOW = 0.5;
export const FLEE_BELOW = 0.05;
/** How far above a line a foe starts to look shaky, as a share of max HP. */
export const WAVER_MARGIN = 0.1;

export const RETREAT_TAKEN = 0.7, FLEE_TAKEN = 1.25;
export const RETREAT_MP = -1, FLEE_MP = 2;
export const FLEE_LOCK = 2;

export const isBorder = (s: BattleState, p: Pos) => p.x === 0 || p.y === 0 || p.x === s.map.w - 1 || p.y === s.map.h - 1;

/** The state a unit should be in now. Flee wins over retreat, and a unit never steps back down. */
export function escapeStateFor(s: BattleState, u: Unit, round: number): EscapeState {
  if (!u.marked || u.life !== "up" || round < ESCAPE_FROM_ROUND) return u.escape;
  const ratio = u.hp / u.maxHp;
  if (ratio < FLEE_BELOW) return "flee";
  if (u.escape === "none" && u.downs > 0 && ratio < RETREAT_BELOW) return "retreat";
  return u.escape;
}

/** Close to a line (or past it but before round 3): the screen warns the player. */
export function wavering(u: Unit, round: number): boolean {
  if (!u.marked || u.life !== "up" || u.escape === "flee") return false;
  const ratio = u.hp / u.maxHp;
  const nearFlee = ratio < FLEE_BELOW + WAVER_MARGIN;
  const nearRetreat = u.escape === "none" && u.downs > 0 && ratio < RETREAT_BELOW + WAVER_MARGIN;
  if (round < ESCAPE_FROM_ROUND) return nearFlee || nearRetreat;
  return (nearFlee || nearRetreat) && !(u.escape === "retreat" && !nearFlee);
}

/** Damage taken is scaled by the escape state. */
export const takenFactor = (u: Unit) => (u.escape === "retreat" ? RETREAT_TAKEN : u.escape === "flee" ? FLEE_TAKEN : 1);

/** MP at the start of a turn. */
export function turnMp(u: Unit): number {
  if (u.rooted) return 0;
  if (u.escape === "retreat") return Math.max(1, u.maxMp + RETREAT_MP);
  if (u.escape === "flee") return u.maxMp + FLEE_MP;
  return u.maxMp;
}
