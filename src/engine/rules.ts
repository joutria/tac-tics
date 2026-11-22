/* Turn rules: how much a unit can do in one turn, and what spells cost. A PROTOTYPE switch for comparing the
   Dofus-style AP turn the game ships with against FFTA-style turns (one Move and one Act, spells paid with mana).

   - "ap"   (default, the game as it is): 6 AP a turn, every card costs its AP, cooldowns gate the big ones.
   - "act"  (FFTA style): one Move and one Act a turn, any order, plus the free quick action. Every card is one
            Act. The unit's basic attack (a damaging card with no cooldown) costs no mana; every other card costs
            mana, which refills a little at the start of each turn. Damage and healing are scaled up, since a turn
            now holds one hit instead of two.
   - "pips" (hybrid): two action pips a turn. Light cards (2-3 AP) take one pip, heavy ones (4 AP) take both.
            Spells cost mana as in "act", so two basic attacks are still a full turn, but two spells rarely are.

   The battle reads RULES as it plays; nothing about it is saved, so the browser game always uses "ap" unless
   `?rules=act` (or pips) is in the address, and the simulators set it from `--rules`. */
import type { Ability } from "../data/abilities";

export type RulesMode = "ap" | "act" | "pips";

export interface Rules {
  mode: RulesMode;
  /** Multiplies the party's ability damage (not falls, slams, burns or blasts). */
  damage: number;
  /** Multiplies the foes' ability damage. Foes often move and strike once even with 6 AP, so one Act a turn costs
      them less than it costs the party, and they need less of a boost. */
  foeDamage: number;
  /** Multiplies all ability healing. */
  heal: number;
  /** Mana pool, the share of it a unit starts a battle with, and what it gets back at the start of each turn. */
  mana: { max: number; start: number; regen: number };
  /** Keep cooldowns on top of mana (false = mana is the only limit). */
  cooldowns: boolean;
  /** Heavy units (bosses, giants) get this many Acts a turn in "act" mode. */
  bossActs: number;
}

export const DEFAULT_RULES: Rules = { mode: "ap", damage: 1, foeDamage: 1, heal: 1, mana: { max: 20, start: 0.5, regen: 5 }, cooldowns: true, bossActs: 1 };
/** The tuned starting points for each mode, used when only `mode` is given. */
export const PRESETS: Record<RulesMode, Partial<Rules>> = {
  ap: {},
  act: { damage: 1.7, foeDamage: 1.45, heal: 1.4, bossActs: 1 },
  pips: { damage: 1.15, foeDamage: 1.1, heal: 1.1 },
};

export const RULES: Rules = structuredClone(DEFAULT_RULES);

export function setRules(r: Partial<Rules> & { mode?: RulesMode }) {
  const mode = r.mode ?? RULES.mode;
  Object.assign(RULES, structuredClone(DEFAULT_RULES), PRESETS[mode], r, { mode });
}

/** The basic attack: damaging, no cooldown, not a quick action. It never costs mana. */
export const isBasic = (ab: Ability) => !!ab.damage && ab.cooldown === 0 && !ab.quick;

/** What a card takes out of the turn's action budget (AP, Acts or pips). */
export function actionCost(ab: Ability): number {
  if (RULES.mode === "ap" || ab.quick) return ab.ap;
  if (RULES.mode === "act") return 1;
  return ab.ap >= 4 ? 2 : 1;
}

/** The turn's action budget for a unit whose spec has `ap` AP. */
export function actionsFor(spec: { ap: number; heavy?: boolean }): number {
  if (RULES.mode === "ap") return spec.ap;
  if (RULES.mode === "act") return spec.heavy ? RULES.bossActs : 1;
  return 2;
}

/** Mana a card costs: none for the basic attack, Help up and Spare; otherwise its old AP and cooldown together
    (a 3 AP card with cooldown 1 costs 8, a 4 AP card with cooldown 3 costs 14). Always 0 in "ap" mode. */
export function manaCost(ab: Ability): number {
  if (RULES.mode === "ap" || ab.quick || isBasic(ab) || ab.revive || ab.spare) return 0;
  return ab.ap * 2 + ab.cooldown * 2;
}

export const usesMana = () => RULES.mode !== "ap";
