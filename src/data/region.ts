/* Regions a run crosses, in order. The first is a town the Savia (Sap) ruined. Each region has arenas (the maps
   its battles use, with where the party and the foes start), the species that live there, and a boss. A region can
   take the first region's species and change them (gap 18: one rule table per region): another element, a name
   pattern, resistances and stats. Deeper nodes, and later regions, field foes stronger. */
import type { Pos } from "../engine/grid";
import type { GridMap } from "../engine/grid";
import type { UnitSpec } from "../engine/state";
import { MEADOW } from "./maps/meadow";
import { RUINS } from "./maps/ruins";
import { TEST_UNITS } from "./units";
import type { Element } from "./elements";
import type { Line } from "./rivals";

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
export interface BossRule { species: number; hp: number; stat: number; mp: number; name: Line }
/** The boss: a species swollen by the Sap. */
export const BOSS: BossRule = { species: 1, hp: 1.5, stat: 6, mp: 1, name: { es: "{name} Hinchado de Savia", en: "Sap-Swollen {name}" } };

/** How a region changes a species it borrows: "{name}" in `name` is the original name. */
export interface VariantRule {
  element?: Element;
  name: Line;
  res?: Partial<Record<Element, number>>;
  hp?: number;
  stat?: number;
}

export interface Region {
  id: string;
  name: Line;
  arenas: Arena[];
  species: Species[];
  boss: BossRule;
  /** Applied to every species of this region. */
  variant?: VariantRule;
}

/** A species as a region fields it, in the player's language. */
export function regionalSpecies(region: Region, lang: "es" | "en"): Species[] {
  const v = region.variant;
  if (!v) return region.species;
  return region.species.map((sp) => ({
    ...structuredClone(sp),
    name: v.name[lang].replace("{name}", sp.name),
    element: v.element ?? sp.element,
    res: { ...sp.res, ...v.res },
    hp: sp.hp + (v.hp ?? 0), str: sp.str + (v.stat ?? 0), mag: sp.mag + (v.stat ?? 0),
  }));
}

export const REGIONS: Region[] = [
  { id: "town", name: { es: "El pueblo arrasado por la Savia", en: "The Sap-ruined town" }, arenas: ARENAS, species: SPECIES, boss: BOSS },
];

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
