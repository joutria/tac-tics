/* Battle goals on the run map (engine/goals.ts has the rules). Which plain fights carry one, the survivor and the
   courier, and what a met goal pays. Numbers are first drafts, tuned with `npm run simulate:run`. */
import type { Line } from "./rivals";
import type { Species } from "./region";
import type { GoalKind } from "../engine/goals";

export const GOAL = {
  /** Share of plain fights (layer 1 on, not ambushes or flooded fights) that carry a goal. */
  chance: 0.4,
  /** A survive goal: rounds to hold out, and extra foes on top of the usual count (still at most 4). */
  surviveRounds: 5, surviveExtraFoes: 1,
  /** A survive goal met: the foes still standing when they fall back count this much towards coins and XP. */
  surviveStandingShare: 0.5,
  /** A survive goal held clean (nobody in the party fell): Sap shards picked from the foes' fallback. */
  surviveShards: 1,
  /** A catch goal met: the courier's satchel of Sap shards, plus coins (times REWARD.purse, scaled by depth). */
  catchShards: 1, catchCoins: 0.6,
  /** A protect goal met: the survivor hands over a gift (like a spared foe's), and the meters lean to Mercy. */
  protectMercy: 4,
};

/** The survivor of a protect goal: weak, slow, and the foes' first target. HP grows with depth like a foe's. */
export interface Survivor { look: string; name: Line; /** As it reads inside a sentence ("the wounded villager"). */ the: Line }
export const SURVIVORS: Survivor[] = [
  { look: "aldeano", name: { es: "Aldeano herido", en: "Wounded villager" }, the: { es: "el aldeano herido", en: "the wounded villager" } },
  { look: "anciana", name: { es: "Anciana atrapada", en: "Trapped elder" }, the: { es: "la anciana atrapada", en: "the trapped elder" } },
];
export const SURVIVOR_STATS: Omit<Species, "name" | "look"> = {
  team: "heroes", element: "neutral", hp: 40, ap: 6, mp: 3, speed: 36, jump: 1, str: 0, mag: 0, agi: 4, res: {}, abilities: [],
};

/** The courier of a catch goal: frail and slow on its feet, but fleeing gives it 2 more MP. It never fights. */
export const COURIER: Species = {
  name: "Correo de la Savia", team: "foes", element: "water", look: "ratero", hp: 24, ap: 6, mp: 2, speed: 40, jump: 1, str: 0, mag: 0, agi: 6,
  res: {}, abilities: [], ai: "skirmisher",
};
export const COURIER_NAME: Line = { es: "Correo de la Savia", en: "Sap courier" };

/** What the party is told at the end, by goal and outcome ({the} / {The}: the survivor, see Survivor.the). */
export const GOAL_LINES: Record<GoalKind, { met: Line; failed: Line }> = {
  protect: {
    met: { es: "{The} os da las gracias con lo poco que salvó.", en: "{The} thanks you with what little was saved." },
    failed: { es: "No pudisteis salvar a {the}.", en: "You couldn't save {the}." },
  },
  survive: {
    met: { es: "Aguantasteis: los enemigos se repliegan.", en: "You held out: the foes fall back." },
    failed: { es: "Aguantasteis, pero no sin caídas. Nadie paga por una línea que se rompió.", en: "You held, but not without falls. Nobody pays for a line that broke." },
  },
  catch: {
    met: { es: "La bolsa del correo está llena de esquirlas de Savia.", en: "The courier's satchel is full of Sap shards." },
    failed: { es: "El correo se escapó con su carga de Savia.", en: "The courier got away with its load of Sap." },
  },
};
