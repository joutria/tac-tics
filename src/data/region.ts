/* The first region: a town the Savia (Sap) ruined. Arenas are the maps its battles use, with where the party
   and the foes start. Species are the foes that live here; deeper nodes field them stronger. */
import type { Pos } from "../engine/grid";
import type { GridMap } from "../engine/grid";
import type { UnitSpec } from "../engine/state";
import { MEADOW } from "./maps/meadow";
import { RUINS } from "./maps/ruins";
import { TEST_UNITS } from "./units";

export interface Arena { map: GridMap; hero: Pos; allies: Pos[]; foes: Pos[] }

export const ARENAS: Arena[] = [
  { map: MEADOW, hero: { x: 2, y: 6 }, allies: [{ x: 1, y: 6 }, { x: 2, y: 7 }, { x: 3, y: 6 }], foes: [{ x: 7, y: 1 }, { x: 8, y: 6 }, { x: 6, y: 8 }, { x: 9, y: 4 }] },
  { map: RUINS, hero: { x: 2, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 2, y: 7 }, { x: 4, y: 8 }], foes: [{ x: 8, y: 1 }, { x: 6, y: 2 }, { x: 9, y: 6 }, { x: 5, y: 5 }] },
];

/** Species spec without id or position; a battle gives each one a unique id. */
export type Species = Omit<UnitSpec, "id" | "pos">;

export const SPECIES: Species[] = TEST_UNITS.filter((u) => u.team === "foes").map(({ id: _id, pos: _pos, ...rest }) => rest);

export const HERO: UnitSpec = TEST_UNITS.find((u) => u.team === "heroes")!;

/** Per layer of the run map: foes get this much more HP and Str/Mag. */
export const DEPTH_HP = 0.04, DEPTH_STAT = 1;
/** The boss: a species swollen by the Sap. */
export const BOSS = { species: 1, hp: 1.5, stat: 6, mp: 1, name: { es: "{name} Hinchado de Savia", en: "Sap-Swollen {name}" } };

/** Chosen when a run starts. Normal is the tuned baseline; Hard is closer to the game's "punish rushing in" goal. */
export type Difficulty = "easy" | "normal" | "hard";
export interface DifficultyRules {
  /** Foe HP multiplier and flat Str/Mag change. */
  foeHp: number; foeStat: number;
  /** Extra foes per plain battle from layer 2 on (still at most 4). */
  extraFoes: number;
  /** Added to the share of max HP that wins and rests give back. */
  healBonus: number;
  /** Rewinds per battle. */
  rewinds: number;
  /** Coins multiplier. */
  coins: number;
}
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { foeHp: 0.8, foeStat: -4, extraFoes: 0, healBonus: 0.15, rewinds: 3, coins: 1.25 },
  normal: { foeHp: 1, foeStat: 0, extraFoes: 0, healBonus: 0, rewinds: 1, coins: 1 },
  hard: { foeHp: 1.15, foeStat: 3, extraFoes: 1, healBonus: -0.1, rewinds: 0, coins: 0.85 },
};
