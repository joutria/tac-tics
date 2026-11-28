/* Regions a run crosses, in order. The first is a town the Savia (Sap) ruined. Each region has arenas (the maps
   its battles use, with where the party and the foes start), the species that live there, and a boss. A region can
   take the first region's species and change them (gap 18: one rule table per region): another element, a name
   pattern, resistances and stats. Deeper nodes, and later regions, field foes stronger. */
import type { Pos } from "../engine/grid";
import type { GridMap } from "../engine/grid";
import type { UnitSpec } from "../engine/state";
import { MEADOW } from "./maps/meadow";
import { RUINS } from "./maps/ruins";
import { SHORE, SPILLWAY } from "./maps/reservoir";
import { HOLLOW } from "./maps/hollow";
import { FORGE, HEART, MINESHAFT } from "./maps/mines";
import { TEST_UNITS } from "./units";
import type { Element } from "./elements";
import type { Line } from "./rivals";
import type { RecruitSpot } from "../run/map";

export interface Arena {
  map: GridMap; hero: Pos; allies: Pos[]; foes: Pos[];
  /** Where a 2x2 brute (Region.brute) stands in an elite fight: the corner of four level, open tiles. */
  giant?: Pos;
}

export const ARENAS: Arena[] = [
  { map: MEADOW, hero: { x: 2, y: 6 }, allies: [{ x: 1, y: 6 }, { x: 2, y: 7 }, { x: 3, y: 6 }], foes: [{ x: 7, y: 1 }, { x: 8, y: 6 }, { x: 6, y: 8 }, { x: 9, y: 4 }], giant: { x: 2, y: 0 } },
  { map: RUINS, hero: { x: 2, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 2, y: 7 }, { x: 4, y: 8 }], foes: [{ x: 8, y: 1 }, { x: 6, y: 2 }, { x: 9, y: 6 }, { x: 5, y: 5 }], giant: { x: 8, y: 3 } },
];

/** Species spec without id or position; a battle gives each one a unique id. */
export type Species = Omit<UnitSpec, "id" | "pos">;

export const SPECIES: Species[] = TEST_UNITS.filter((u) => u.team === "foes").map(({ id: _id, pos: _pos, ...rest }) => rest);

export const HERO: UnitSpec = TEST_UNITS.find((u) => u.team === "heroes")!;

/** Per layer of the run map: foes get this much more HP and Str/Mag. */
export const DEPTH_HP = 0.04, DEPTH_STAT = 1;
export interface BossRule {
  /** Index into the region's species, made stronger by the numbers below... */
  species: number; hp: number; stat: number; mp: number; name: Line;
  /** ...or a unit of its own (a guardian), used as it is apart from depth scaling. */
  unit?: Species;
  /** A giant: its body is size x size tiles (see UnitSpec.size). Giants resist pushes instead of being heavy. */
  size?: number;
  /** Abilities the boss gains on top of its species'. */
  abilities?: string[];
  /** Its own lair, fought in instead of the region's arenas. foes[0] is the boss's corner. */
  arena?: Arena;
}

/** The Sap Hollow, the first region's boss lair (see maps/hollow.ts). */
export const HOLLOW_ARENA: Arena = {
  map: HOLLOW, hero: { x: 4, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 9 }],
  foes: [{ x: 4, y: 1 }, { x: 2, y: 1 }, { x: 7, y: 1 }, { x: 6, y: 4 }],
};
/** The boss: a species swollen by the Sap into a 2x2 giant, waiting in its lair. */
export const BOSS: BossRule = {
  species: 1, hp: 1.3, stat: 4, mp: 1, name: { es: "{name} Hinchado de Savia", en: "Sap-Swollen {name}" },
  size: 2, abilities: ["stomp"], arena: HOLLOW_ARENA,
};

/** How a region changes a species it borrows: "{name}" in `name` is the original name. */
export interface VariantRule {
  element?: Element;
  name: Line;
  res?: Partial<Record<Element, number>>;
  hp?: number;
  stat?: number;
  /** Abilities the species learns here. */
  abilities?: string[];
}

export interface Region {
  id: string;
  name: Line;
  arenas: Arena[];
  species: Species[];
  boss: BossRule;
  /** Applied to every species in `species`, which are borrowed from earlier regions. */
  variant?: VariantRule;
  /** Species that live only here, fielded as they are. */
  natives?: Species[];
  /** A 2x2 giant that leads the region's elite fights, in place of their first foe, where the arena has room
      (Arena.giant). Never Sap-marked: too big to slip away and turn rival. */
  brute?: Species;
  /** Companions met here, by map layer. */
  recruits: RecruitSpot[];
  /** Extra depth its foes fight at, on top of the usual climb per region: the last region's foes are the toughest. */
  depth?: number;
  /** Layer of the region's Floodgate, if it has one (a choice node that floods one path and freezes the other). */
  floodgate?: number;
}

/** A species as a region fields it, in the player's language. */
export function regionalSpecies(region: Region, lang: "es" | "en"): Species[] {
  const v = region.variant;
  if (!v) return [...region.species, ...(region.natives ?? [])];
  return [...region.species.map((sp) => ({
    ...structuredClone(sp),
    name: v.name[lang].replace("{name}", sp.name),
    element: v.element ?? sp.element,
    res: { ...sp.res, ...v.res },
    hp: sp.hp + (v.hp ?? 0), str: sp.str + (v.stat ?? 0), mag: sp.mag + (v.stat ?? 0),
    abilities: [...sp.abilities, ...(v.abilities ?? [])],
  })), ...(region.natives ?? [])];
}

/* Humanoid foes (art in public/art/folk/, tools/folk-art.py). The four fighters are people the Sap marked: looters
   and drifters who came for what the ruin left, and grudge-holders who make the best rivals. Goblins came down from
   the hills to the empty town; ratfolk live in the reservoir's pump tunnels. Stats sit beside the creatures they
   share a region with, so foe strength stays where it was. */
const TOWN_NATIVES: Species[] = [
  { name: "Brasa", team: "foes", element: "fire", look: "brasa", hp: 30, ap: 6, mp: 3, speed: 46, jump: 1, str: 4, mag: 10, agi: 12,
    res: { fire: 25 }, abilities: ["ember", "blaze"], ai: "skirmisher", marked: true },
  { name: "Peña", team: "foes", element: "stone", look: "pena", hp: 40, ap: 6, mp: 3, speed: 34, jump: 1, str: 11, mag: 0, agi: 6,
    res: { stone: 25 }, abilities: ["slam", "tremor"], ai: "bruiser", marked: true },
  { name: "Trasgo", team: "foes", element: "plant", look: "trasgo", hp: 32, ap: 6, mp: 3, speed: 44, jump: 1, str: 9, mag: 0, agi: 12,
    res: { plant: 20 }, abilities: ["bite", "snare"], ai: "bruiser", marked: true },
  { name: "Trasgo Chamán", team: "foes", element: "bolt", look: "trasgo-chaman", hp: 26, ap: 6, mp: 3, speed: 40, jump: 1, str: 0, mag: 11, agi: 10,
    res: { bolt: 20 }, abilities: ["spark", "jolt"], ai: "caster", marked: true },
];

/* The brutes (art in public/art/folk/, tools/folk-art.py): an ogre that took over the ruined town's square, and a
   troll from the reservoir's flooded tunnels. Slow and hard-hitting; party members can step around them. */
const OGRE: Species = {
  name: "Ogro", team: "foes", element: "stone", look: "ogro", size: 2, hp: 84, ap: 6, mp: 3, speed: 34, jump: 1, str: 15, mag: 0, agi: 4,
  res: { stone: 25 }, abilities: ["slam", "stomp"], ai: "bruiser",
};
const TROLL: Species = {
  name: "Trol", team: "foes", element: "plant", look: "trol", size: 2, hp: 92, ap: 6, mp: 3, speed: 32, jump: 1, str: 15, mag: 0, agi: 4,
  res: { plant: 25, water: 10 }, abilities: ["bite", "stomp"], ai: "bruiser",
};

const RESERVOIR_NATIVES: Species[] = [
  { name: "Relampín", team: "foes", element: "bolt", look: "relampin", hp: 28, ap: 6, mp: 4, speed: 52, jump: 1, str: 6, mag: 12, agi: 16,
    res: { bolt: 25 }, abilities: ["spark", "jolt"], ai: "skirmisher", marked: true },
  { name: "Carámbano", team: "foes", element: "ice", look: "carambano", hp: 40, ap: 6, mp: 3, speed: 34, jump: 1, str: 10, mag: 8, agi: 8,
    res: { ice: 30, water: 15 }, abilities: ["chill", "freeze"], ai: "bruiser", marked: true },
  { name: "Malva", team: "foes", element: "mush", look: "malva", hp: 30, ap: 6, mp: 3, speed: 42, jump: 1, str: 0, mag: 12, agi: 10,
    res: { mush: 25 }, abilities: ["wilt", "spores"], ai: "caster", marked: true },
  { name: "Marea", team: "foes", element: "ice", look: "marea", hp: 40, ap: 6, mp: 3, speed: 36, jump: 1, str: 10, mag: 4, agi: 8,
    res: { ice: 25, water: 10 }, abilities: ["frostbite", "chill"], ai: "bruiser", marked: true },
  { name: "Ratero", team: "foes", element: "water", look: "ratero", hp: 30, ap: 6, mp: 4, speed: 50, jump: 1, str: 7, mag: 0, agi: 16,
    res: { water: 20 }, abilities: ["splash", "undertow"], ai: "skirmisher", marked: true },
];

/** Broken Mira: the reservoir's guardian, frozen and swollen by the Sap. A boss of her own, not a swollen species. */
const BROKEN_MIRA: Species = {
  name: "Mira", team: "foes", element: "ice", look: "mira-broken", hp: 90, ap: 7, mp: 2, speed: 38, jump: 1, str: 6, mag: 22, agi: 6,
  res: { ice: 40, water: 30 }, abilities: ["glare", "shatter", "freeze"], ai: "caster", marked: true,
};

/* The Sap Mines (region 3): creatures of the furnaces and the deep galleries, from the Evolvlings crater and caves
   (art in public/art/creatures/, tools/creature-art.py). A little tougher than the reservoir's, as the last
   region should be. */
const MINE_NATIVES: Species[] = [
  { name: "Tiznajo", team: "foes", element: "fire", look: "tiznajo", hp: 40, ap: 6, mp: 4, speed: 50, jump: 1, str: 12, mag: 0, agi: 16,
    res: { fire: 25 }, abilities: ["cinder", "bite"], ai: "skirmisher", marked: true },
  { name: "Topacio", team: "foes", element: "stone", look: "topacio", hp: 52, ap: 6, mp: 3, speed: 32, jump: 1, str: 13, mag: 0, agi: 6,
    res: { stone: 30 }, abilities: ["slam", "tremor"], ai: "bruiser", marked: true },
  { name: "Petardín", team: "foes", element: "fire", look: "petardin", hp: 36, ap: 6, mp: 3, speed: 44, jump: 1, str: 0, mag: 14, agi: 12,
    res: { fire: 25 }, abilities: ["ember", "blast"], ai: "caster", marked: true },
  { name: "Colmillón", team: "foes", element: "stone", look: "colmillon", hp: 54, ap: 6, mp: 3, speed: 30, jump: 1, str: 14, mag: 0, agi: 6,
    res: { stone: 25, fire: 10 }, abilities: ["bite", "stomp"], ai: "bruiser", marked: true },
  { name: "Calavero", team: "foes", element: "stone", look: "calavero", hp: 38, ap: 6, mp: 3, speed: 40, jump: 1, str: 0, mag: 14, agi: 10,
    res: { stone: 25 }, abilities: ["rockfall", "ember"], ai: "caster", marked: true },
];

/** The mines' brute: the anvil beast that guards the lower galleries. */
const ANVIL: Species = {
  name: "Yunquerón", team: "foes", element: "fire", look: "yunqueron", size: 2, hp: 104, ap: 6, mp: 3, speed: 32, jump: 1, str: 18, mag: 0, agi: 4,
  res: { fire: 25, stone: 15 }, abilities: ["cinder", "stomp"], ai: "bruiser",
};

/** Forja, the forge's guardian, blackened by the Sap where it wells up. The run's last boss, in its own lair. */
const BLACKENED_FORJA: Species = {
  name: "Forja", team: "foes", element: "fire", look: "forja-sap", hp: 108, ap: 7, mp: 2, speed: 40, jump: 1, str: 10, mag: 24, agi: 6,
  res: { fire: 45, stone: 15 }, abilities: ["forgeBreath", "ember", "moltenCore"], ai: "caster", marked: true,
};
export const HEART_ARENA: Arena = {
  map: HEART, hero: { x: 4, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 9 }],
  foes: [{ x: 4, y: 1 }, { x: 2, y: 2 }, { x: 7, y: 2 }, { x: 5, y: 4 }],
};

export const REGIONS: Region[] = [
  { id: "town", name: { es: "El pueblo arrasado por la Savia", en: "The Sap-ruined town" }, arenas: ARENAS, species: SPECIES, boss: BOSS, natives: TOWN_NATIVES, brute: OGRE,
    recruits: [{ layer: 1, talk: "remanso.meet" }, { layer: 3, talk: "guijo.meet" }] },
  {
    id: "reservoir", name: { es: "El Embalse Quebrado", en: "The Broken Reservoir" },
    arenas: [
      { map: SHORE, hero: { x: 2, y: 8 }, allies: [{ x: 1, y: 8 }, { x: 3, y: 7 }, { x: 2, y: 9 }], foes: [{ x: 7, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 0 }, { x: 8, y: 3 }], giant: { x: 7, y: 4 } },
      { map: SPILLWAY, hero: { x: 4, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 9 }], foes: [{ x: 2, y: 0 }, { x: 5, y: 1 }, { x: 8, y: 0 }, { x: 6, y: 2 }], giant: { x: 2, y: 0 } },
    ],
    // The first region's foes, touched by the frozen lake: Ice instead of their element, and a cold bite.
    species: SPECIES,
    variant: { element: "ice", name: { es: "{name} Escarchado", en: "Frost {name}" }, res: { ice: 20 }, hp: 4, abilities: ["frostbite"] },
    natives: RESERVOIR_NATIVES, brute: TROLL,
    boss: { species: 0, hp: 1, stat: 0, mp: 0, name: { es: "Mira Quebrada", en: "Broken Mira" }, unit: BROKEN_MIRA },
    recruits: [{ layer: 1, talk: "centella.meet" }, { layer: 3, talk: "moheda.meet" }],
    floodgate: 2,
  },
  {
    id: "mines", name: { es: "Las Minas de la Savia", en: "The Sap Mines" },
    arenas: [
      { map: MINESHAFT, hero: { x: 4, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 9 }], foes: [{ x: 2, y: 1 }, { x: 6, y: 0 }, { x: 8, y: 2 }, { x: 5, y: 3 }], giant: { x: 4, y: 0 } },
      { map: FORGE, hero: { x: 4, y: 8 }, allies: [{ x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 9 }], foes: [{ x: 2, y: 1 }, { x: 7, y: 1 }, { x: 5, y: 2 }, { x: 7, y: 3 }], giant: { x: 4, y: 0 } },
    ],
    // The first region's foes, scorched by the furnaces: Fire instead of their element, and a burning claw.
    species: SPECIES,
    variant: { element: "fire", name: { es: "{name} de Ascua", en: "Ember {name}" }, res: { fire: 20 }, hp: 10, stat: 3, abilities: ["cinder"] },
    natives: MINE_NATIVES, brute: ANVIL,
    boss: { species: 0, hp: 1, stat: 0, mp: 0, name: { es: "Forja Ennegrecida", en: "Blackened Forja" }, unit: BLACKENED_FORJA, arena: HEART_ARENA },
    recruits: [{ layer: 1, talk: "eco.meet" }, { layer: 3, talk: "ceniza.meet" }],
    depth: 4,
  },
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
  /** Levels added to every rival when it is fought (Sap tiers). */
  rivalLevel?: number;
}
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { foeHp: 0.8, foeStat: -4, extraFoes: 0, healBonus: 0.15, rewinds: 3, coins: 1.25 },
  normal: { foeHp: 1, foeStat: 0, extraFoes: 0, healBonus: 0, rewinds: 1, coins: 1 },
  hard: { foeHp: 1.15, foeStat: 3, extraFoes: 1, healBonus: -0.1, rewinds: 0, coins: 0.85 },
};

/** Sap tiers (M4, plan doc gap 16 C): harder steps on top of Hard, opened one at a time by winning a Hard run at the
    highest tier open. Each tier keeps the twists of the ones below and adds its own, added to Hard's rules. */
export interface SapTier { name: Line; twist: Line; add: Partial<DifficultyRules> }
export const SAP_TIERS: SapTier[] = [
  { name: { es: "Savia I", en: "Sap I" }, add: { healBonus: -0.05 },
    twist: { es: "Hogueras frías: descansar y ganar cura un poco menos.", en: "Cold fires: rests and wins heal a little less." } },
  { name: { es: "Savia II", en: "Sap II" }, add: { foeStat: 2 },
    twist: { es: "Savia espesa: los enemigos pegan más fuerte.", en: "Thick Sap: foes hit harder." } },
  { name: { es: "Savia III", en: "Sap III" }, add: { coins: -0.15 },
    twist: { es: "Bolsas vacías: menos monedas por combate.", en: "Empty purses: fewer coins per battle." } },
  { name: { es: "Savia IV", en: "Sap IV" }, add: { foeHp: 0.1 },
    twist: { es: "Pieles duras: los enemigos aguantan más.", en: "Hard hides: foes take more to bring down." } },
  { name: { es: "Savia V", en: "Sap V" }, add: { rivalLevel: 1 },
    twist: { es: "Rivales inquietos: cada rival llega un nivel más fuerte.", en: "Restless rivals: every rival arrives a level stronger." } },
];

/** The rules of a difficulty, with Sap tiers 1..tier added on top (tiers only apply to Hard). */
export function rulesFor(difficulty: Difficulty, tier = 0): DifficultyRules {
  const r: DifficultyRules = { ...DIFFICULTY[difficulty] };
  if (difficulty !== "hard") return r;
  for (const t of SAP_TIERS.slice(0, tier)) {
    for (const [k, v] of Object.entries(t.add) as [keyof DifficultyRules, number][]) r[k] = (r[k] ?? 0) + v;
  }
  return r;
}
