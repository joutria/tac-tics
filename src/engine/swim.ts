/* Swimming (Jose: make water swimmable). Water is not ground: nobody is placed in it and nothing is set down on it,
   but any one-tile unit can swim into it.
   - Stepping into water costs SWIM_EXTRA_MP more than a normal step. Giants are too heavy to swim.
   - A swimmer has no footing: it cannot Guard, Jump, Throw or blink away, and of its abilities it can only use
     close ones (reach 1, on one tile), Spare, and Water abilities.
   - Water puts out a Burn on anyone who swims into it, or starts a turn in it.
   - A bolt runs through the water a swimmer is in: swimmers take the chained share and starting a turn in charged
     water stuns more often (SWIM_SHOCK_CHANCE) than standing next to it.
   - Ice freezes a swimmer in place: the water under it turns to ice and it is rooted for its next turn.
   - A unit shoved into water splashes in and swims instead of slamming against it, and a fall into water is soft.
   - A rock or crate sent into water hits a swimmer there instead of sinking.
   - Water creatures (Water element: Ajolín, Remanso) are at home in it: no extra MP and no limits.
   Water is low ground, so a swimmer is usually under whoever stands on the bank. */
import type { Ability } from "../data/abilities";
import { tileAt, type GridMap, type Pos } from "./grid";

/** Extra MP for each step into water (a normal step costs 1). */
export const SWIM_EXTRA_MP = 1;
/** Chance that starting a turn in charged water stuns (next to it: terrain.ts SHOCK_CHANCE). */
export const SWIM_SHOCK_CHANCE = 0.6;

interface Swimmer { element: string; size?: number }

/** Only one-tile units swim. */
export const canSwim = (u: { size?: number }) => (u.size ?? 1) <= 1;
/** Water creatures swim freely. */
export const nativeSwimmer = (u: Swimmer) => u.element === "water";
/** The unit's tile (or `at`) is water. */
export const inWater = (m: GridMap, u: { pos: Pos; size?: number }, at: Pos = u.pos) => canSwim(u) && tileAt(m, at)?.terrain === "water";

/** Why `ab` cannot be used while swimming at `at`, or null. */
export function swimProblem(m: GridMap, u: Swimmer & { pos: Pos }, ab: Ability, at: Pos = u.pos): string | null {
  if (!inWater(m, u, at) || nativeSwimmer(u)) return null;
  if (ab.element === "water" || ab.spare) return null;
  if (ab.jump || ab.throwProp || ab.teleport) return "no footing while swimming";
  if (ab.range[1] > 1 || ab.area !== "single") return "only close moves while swimming";
  return null;
}
