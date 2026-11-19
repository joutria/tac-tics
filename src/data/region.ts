/* The first region: a town the Savia (Sap) ruined. Arenas are the maps its battles use, with where the party
   and the foes start. Species are the foes that live here; deeper nodes field them stronger. */
import type { Pos } from "../engine/grid";
import type { GridMap } from "../engine/grid";
import type { UnitSpec } from "../engine/state";
import { MEADOW } from "./maps/meadow";
import { RUINS } from "./maps/ruins";
import { TEST_UNITS } from "./units";

export interface Arena { map: GridMap; hero: Pos; foes: Pos[] }

export const ARENAS: Arena[] = [
  { map: MEADOW, hero: { x: 2, y: 6 }, foes: [{ x: 7, y: 1 }, { x: 8, y: 6 }, { x: 6, y: 8 }, { x: 9, y: 4 }] },
  { map: RUINS, hero: { x: 2, y: 8 }, foes: [{ x: 8, y: 1 }, { x: 6, y: 2 }, { x: 9, y: 6 }, { x: 5, y: 5 }] },
];

/** Species spec without id or position; a battle gives each one a unique id. */
export type Species = Omit<UnitSpec, "id" | "pos">;

export const SPECIES: Species[] = TEST_UNITS.filter((u) => u.team === "foes").map(({ id: _id, pos: _pos, ...rest }) => rest);

export const HERO: UnitSpec = TEST_UNITS.find((u) => u.team === "heroes")!;

/** Per layer of the run map: foes get this much more HP and Str/Mag. */
export const DEPTH_HP = 0.06, DEPTH_STAT = 2;
/** The boss: a species swollen by the Sap. */
export const BOSS = { species: 1, hp: 2.2, stat: 15, mp: 1, name: { es: "{name} Hinchado de Savia", en: "Sap-Swollen {name}" } };
