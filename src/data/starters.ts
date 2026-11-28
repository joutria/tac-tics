/* Starting heroes (plan doc: "Pick a starting hero (one at first, more unlock later)"). Every run is led by one of
   them, picked at the camp between runs. They stay unnamed, like the first one (Jose: "the hero"): the camp and the
   sheet call them by what they are. Each has its own element, cards and pair of jobs (data/jobs.ts), one for each
   way a run can lean. In battle they all are the unit with id "hero": the run ends when that unit falls. */
import type { Line } from "./rivals";
import type { UnitSpec } from "../engine/state";
import type { Milestone } from "./camp";
import type { Job, Lean } from "./jobs";
import { TEST_UNITS } from "./units";

export type StarterId = "light" | "vanguard" | "scout";

export interface Starter {
  id: StarterId;
  name: Line;
  desc: Line;
  /** Locked until this milestone; null for the one every player has. */
  needs: Milestone | null;
  /** The base spec, before levels, perks and gear (run/hero.ts heroSpec). Its id is always "hero". */
  spec: UnitSpec;
  /** The job each lean offers halfway through the first region. */
  jobs: Record<Lean, Job>;
}

const LIGHT = TEST_UNITS.find((u) => u.id === "hero")!;

export const STARTERS: Record<StarterId, Starter> = {
  light: {
    id: "light", needs: null, spec: LIGHT, jobs: { beacon: "beacon", blaze: "blaze" },
    name: { es: "El héroe de la Luz", en: "The hero of Light" },
    desc: { es: "Media distancia y Magia. Rayos, un destello en cruz y una cura. Como la primera vez.", en: "Mid range and Magic. Rays, a cross-shaped flare and a heal. Like the first time." },
  },
  vanguard: {
    id: "vanguard", needs: "firstRun", jobs: { beacon: "bastion", blaze: "fury" },
    name: { es: "La Vanguardia", en: "The Vanguard" },
    desc: { es: "Cuerpo a cuerpo, Fuego y Fuerza. Mucha vida, una carga y un grito que escuda a quien tenga al lado.", en: "Close quarters, Fire and Strength. Lots of HP, a charge, and a war cry that shields whoever stands beside her." },
    spec: {
      id: "hero", name: "Vanguard", team: "heroes", element: "fire", look: "vanguard", pos: { x: 2, y: 6 },
      hp: 84, ap: 6, mp: 3, mana: 18, speed: 44, jump: 1, str: 15, mag: 0, agi: 8, res: { fire: 20, stone: 10 },
      abilities: ["cleave", "charge", "kindle", "warcry"], quick: "hurl",
    },
  },
  scout: {
    id: "scout", needs: "region1", jobs: { beacon: "warden", blaze: "hunter" },
    name: { es: "El Batidor", en: "The Scout" },
    desc: { es: "Larga distancia, Aire y Fuerza. Flechas desde lejos, raíces que inmovilizan y una ráfaga que empuja.", en: "Long range, Air and Strength. Arrows from afar, a pinning shot and a gust that pushes." },
    spec: {
      id: "hero", name: "Scout", team: "heroes", element: "air", look: "scout", pos: { x: 2, y: 6 },
      hp: 74, ap: 6, mp: 4, mana: 20, speed: 54, jump: 2, str: 14, mag: 4, agi: 14, res: { air: 20 },
      abilities: ["arrow", "volley", "pin", "gust", "salve"], quick: "zip",
    },
  },
};

export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];
/** A starter by id; anything unknown (or an old save without one) is the hero of Light. */
export const starterOf = (id: string | undefined): Starter => STARTERS[id as StarterId] ?? STARTERS.light;
