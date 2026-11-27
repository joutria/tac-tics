/* A run: one trip through a region's map with the hero, from the first node to the boss.
   The run ends when the hero falls for good (plan doc gap 10) or when the boss is beaten.

   Between battles the hero grows: XP and levels, a perk pick every second level, coins and Savia shards, a
   choice of 1 of 3 rewards after each win, and a shop (gaps 12 to 14).

   Like a battle, a run is deterministic: the map, every battle's seed and foes, every reward and every rival come
   from the run seed and what happened before. The run save keeps the current battle's own save inside it. */
import { ITEMS, PERKS, REWARD, SHOP, type Rarity } from "../data/gear";
import { DEPTH_HP, DEPTH_STAT, HERO, rulesFor, SAP_TIERS, REGIONS, regionalSpecies, type Difficulty, type Region, type Species } from "../data/region";
import { rngInt, rngNext, seedFrom } from "../engine/rng";
import { cellsOf, coversPos, standable, tileAt, type GridMap, type Pos } from "../engine/grid";
import type { BattleSave } from "../engine/save";
import type { BattleSetup, BattleState, UnitSpec } from "../engine/state";
import { equip, gainXp, heroSpec, newProgress, take, type HeroProgress } from "./hero";
import { aheadOf, choices, generateMap, MAP_LAYERS, placeFloodgate, placeQuest, placeRival, setFloodgate, type RunMap, type RunNode } from "./map";
import { COMPANIONS, LESSON_APPROVAL, QUESTS, TALKS, type Lesson } from "../data/companions";
import { JOB_LAYER, type Job } from "../data/jobs";
import type { Line } from "../data/rivals";
import { memberSpec, newMember, react, readDeeds, readyForLesson, type Deeds, type Member } from "./party";
import { activeRivals, afterBattle, readStyle, rivalFromCompanion, rivalSpec, runEnder, type Rival } from "./rivals";
import { NEMESIS, nemesisLine, RETURN, returnLine } from "./legacy";
import type { Kit } from "../data/camp";
import { HELP_LINES, MERCY, type HelpKind } from "../data/mercy";
import { unsettled } from "../engine/state";
import { ALIGN, SHIFT, type Align, type Meter, type Side } from "../data/alignment";
import { alignOf, battleShift, lockIn, shiftAlign, twinBar } from "./alignment";
import { twinOf } from "../data/twins";
import { ABILITIES, COMBO_CASTER, type ComboId } from "../data/abilities";
import { COURIER, COURIER_NAME, GOAL, GOAL_LINES, SURVIVOR_STATS, SURVIVORS } from "../data/goals";
import { GOAL_KINDS, goalStatus, type Goal, type GoalKind } from "../engine/goals";

export const RUN_VERSION = 5;
/** Share of max HP a rest node gives back. */
export const REST_HEAL = 0.5;
/** Foes in a plain battle per layer (min, max), before companions add one each. */
export const FOES_BY_LAYER: [number, number][] = [[1, 1], [1, 2], [2, 2], [2, 2], [2, 3], [2, 3], [2, 3]];
/** Share of max HP the hero gets back after winning a battle. */
export const AFTER_WIN_HEAL = 0.3;
/** Share of max HP everyone gets back when a run moves on to the next region. */
export const REGION_REST = 0.5;
/** Companions who fight beside the hero; others met later wait at camp (they heal, but see no battles). */
export const MAX_FIELDED = 3;
/** A rest's cleansing fire: burn this many Savia shards to heal the whole party to full. */
export const ALTAR = { shards: 2 };

export type RewardOption = { t: "item"; id: string } | { t: "coins"; n: number } | { t: "heal"; n: number } | { t: "shards"; n: number };

/** Something the player has to answer before moving on: a reward, a perk, or a shop to browse. */
export type Offer =
  /** `gift`: handed over by a foe the party spared (its name), instead of the battle's usual reward. */
  | { kind: "reward"; options: RewardOption[]; gift?: string }
  | { kind: "perk"; options: string[] }
  /** `discount`: a spared foe minds the stall (its name) and takes MERCY.discount off. */
  | { kind: "shop"; stock: string[]; discount?: string }
  /** A conversation (data/companions.ts TALKS); after a choice, its reply shows until the player moves on. */
  | { kind: "talk"; id: string; reply?: Line }
  /** A rest's cleansing fire: burn shards (choice 0) or keep them (choice 1). */
  | { kind: "altar" }
  /** The hero's job: the one the run leans towards, or both on a tie. */
  | { kind: "job"; options: Job[] }
  /** A companion's personal quest: its lesson moment (choices from questChoices), then the reply. */
  | { kind: "quest"; companion: string; reply?: Line }
  /** The Floodgate: flood one of `paths` (the ways on) and freeze the rest; with one way on, flood it (0) or
      freeze it (1). */
  | { kind: "floodgate"; paths: number[] };

export interface RunState {
  version: number;
  seed: string;
  difficulty: Difficulty;
  /** Sap tier on top of Hard (data/region.ts SAP_TIERS), 0 or absent for none. */
  tier?: number;
  /** Index into REGIONS of the region being crossed; `map` is its node map. */
  region: number;
  map: RunMap;
  /** Last node finished; null before the first one. */
  at: number | null;
  /** Nodes finished, in order. */
  path: number[];
  /** The hero's HP between battles (a battle starts with it; the revive scars last one battle only). */
  heroHp: number;
  hero: HeroProgress;
  coins: number;
  shards: number;
  rivals: Rival[];
  /** Companions met this run, including those who left, fell or turned. */
  party: Member[];
  /** What companions said after the last battle or rest. */
  remarks: Line[];
  /** Answered first to last before the map opens again. */
  offers: Offer[];
  /** The battle being fought, if any. */
  battle?: BattleSave & { node: number };
  /** What the last battle gave, for the screen. */
  spoils?: { coins: number; xp: number; shards: number; levels: number; align?: Align };
  over: null | "won" | "lost";
  /** How the run has played, towards the hero's job: Beacon protects and spares, Blaze finishes. */
  leanings?: Record<Job, number>;
  /** Foes the party spared this run. They never become rivals, and they come back to help (see `helpAt`). */
  spared?: SparedFoe[];
  /** The hero's alignment meters, Mercy/Severity and Purity/Sap, each -100..100 (run/alignment.ts). */
  align?: Align;
  /** Sides locked in so far (ALIGN.lockAt): the other side's signature twins stay closed for the run. */
  alignLock?: Partial<Record<Meter, Side>>;
  /** Saves from before the meters: Mercy points from sparing. Moved into `align` on load. */
  mercy?: number;
  /** A spared foe helping at the stop being entered. */
  help?: { node: number; region: number; foe: string; kind: HelpKind };
  /** Combos the party's quests have unlocked (data/abilities.ts COMBOS). */
  combos?: string[];
  /** Poison hurts the party this much less per turn (Moheda's research, finished). */
  poisonWard?: number;
  /** The starting kit the run set out with (data/camp.ts). */
  kit?: string;
  /** A lost run: the rival (its id in `rivals`) who ended it. It becomes the next run's nemesis (run/legacy.ts). */
  endedBy?: string;
}

export interface SparedFoe {
  /** Unit id it had in the battle where it was spared. */
  id: string;
  name: string;
  /** Its spec in that battle, to fight beside the party later. */
  spec: UnitSpec;
  region: number;
  /** Has already come back to help (each spared foe helps once). */
  helped?: boolean;
}

/** What else a run takes from the legacy (run/legacy.ts): a companion back as a rival, and a keepsake perk. */
export interface Bonds { returning?: Rival; keepsake?: string; tier?: number }

/** A new run. `nemesis` is the rival who ended the last one (legacy.ts carriedNemesis): it waits on the map. */
export function newRun(seed: string, difficulty: Difficulty = "normal", nemesis?: Rival, kit?: Kit, bonds: Bonds = {}): RunState {
  const run: RunState = {
    version: RUN_VERSION, seed, difficulty, region: 0, map: regionMap(seed, 0), at: null, path: [], heroHp: HERO.hp, hero: newProgress(),
    coins: 0, shards: 0, rivals: [], party: [], remarks: [], offers: [], over: null,
  };
  if (nemesis) {
    run.rivals.push(structuredClone(nemesis));
    placeRival(run.map, null, nemesis.id, `${seed}:nemesis`, NEMESIS.layer);
    run.remarks.push(nemesisLine("arrives", nemesis));
  }
  // A companion whose story ended badly last time waits further on, Sap-marked.
  if (bonds.returning) {
    run.rivals.push(structuredClone(bonds.returning));
    placeRival(run.map, null, bonds.returning.id, `${seed}:returned`, RETURN.layer);
    run.remarks.push(returnLine("arrives", bonds.returning.base.name));
  }
  if (bonds.keepsake && PERKS[bonds.keepsake]?.keepsake) run.hero.perks.push(bonds.keepsake);
  if (difficulty === "hard" && bonds.tier) run.tier = Math.min(SAP_TIERS.length, bonds.tier);
  // The kit picked at the camp (data/camp.ts): what the hero sets out with.
  if (kit) {
    for (const id of kit.items ?? []) gainItem(run, id);
    run.coins += kit.coins ?? 0;
    run.shards += kit.shards ?? 0;
    run.kit = kit.id;
  }
  return run;
}

/** The first region keeps the plain seed, so runs started before regions existed keep their maps. */
const regionSeed = (seed: string, region: number) => (region ? `${seed}:region:${region}` : seed);
/** A region's node map, with its Floodgate if it has one. */
function regionMap(seed: string, region: number): RunMap {
  const r = REGIONS[region]!, map = generateMap(regionSeed(seed, region), r.recruits);
  if (r.floodgate !== undefined) placeFloodgate(map, r.floodgate, regionSeed(seed, region));
  return map;
}
export const regionOf = (run: RunState): Region => REGIONS[run.region ?? 0]!;
export const isLastRegion = (run: RunState) => (run.region ?? 0) >= REGIONS.length - 1;
/** Depth added per region already crossed. Less than a whole map: each region starts a little above where the
    last one's middle was, since the party has grown too. */
export const REGION_DEPTH = 2;
/** How deep a node is for scaling foes and rewards: later regions continue from the earlier ones. */
export const depthOf = (run: RunState, node: RunNode) => node.layer + (run.region ?? 0) * REGION_DEPTH;

/** A save from before regions existed: it was in the first one. */
export function upgradeRun(saved: RunState): RunState {
  let run = saved.version === 4 ? { ...saved, version: RUN_VERSION, region: 0 } : saved;
  // Sparing counted Mercy points before the meters existed: they become the Mercy meter.
  if (run.mercy !== undefined && !run.align) {
    run = { ...run, align: { mercy: Math.min(ALIGN.max, run.mercy), purity: 0 } };
    delete run.mercy;
  }
  return run;
}

/** The hero as it fights: worn twins swap in only while the meters (and level and job) allow them. */
export const heroOf = (run: RunState) => heroSpec(HERO, run.hero, (tw, abilities) => !twinBar(run, tw, abilities));
/** Companions who fight in the next battle. */
export const fielded = (run: RunState) => run.party.filter((m) => m.status === "with" || m.status === "leaving").slice(0, MAX_FIELDED);
export const memberMaxHp = (run: RunState, m: Member) => memberSpec(m, run.hero.level, { x: 0, y: 0 }).hp;
export const heroMaxHp = (run: RunState) => heroOf(run).hp;

export const nextNodes = (run: RunState): RunNode[] => (run.over || run.offers.length ? [] : choices(run.map, run.at));

/** Which arena a node uses: picked from the seed so revisiting the save gives the same one. */
export function arenaFor(run: RunState, node: RunNode) {
  const lair = node.kind === "boss" ? regionOf(run).boss.arena : undefined;
  if (lair) return lair;
  const arenas = regionOf(run).arenas;
  const [i] = rngInt(seedFrom(`${regionSeed(run.seed, run.region ?? 0)}:arena:${node.id}`), 0, arenas.length - 1);
  return arenas[i]!;
}

export const rulesOf = (run: RunState) => rulesFor(run.difficulty ?? "normal", run.tier ?? 0);

function foeSpec(run: RunState, sp: Species, id: string, pos: UnitSpec["pos"], layer: number): UnitSpec {
  const d = rulesOf(run);
  return {
    ...structuredClone(sp), id, pos: { ...pos },
    hp: Math.round(sp.hp * (1 + DEPTH_HP * layer) * d.foeHp),
    str: Math.max(0, sp.str + DEPTH_STAT * layer + d.foeStat), mag: Math.max(0, sp.mag + DEPTH_STAT * layer + d.foeStat),
  };
}

/** The battle a node holds. Plain battles field 2 or 3 foes, elites 4, the boss one swollen foe plus 2. */
export function battleSetup(run: RunState, nodeId: number, lang: "es" | "en"): BattleSetup {
  const node = run.map.nodes[nodeId]!;
  const arena = arenaFor(run, node);
  const region = regionOf(run), species = regionalSpecies(region, lang), depth = depthOf(run, node);
  const rs = regionSeed(run.seed, run.region ?? 0);
  let rng = seedFrom(`${rs}:foes:${node.id}`);
  const pick = () => { let i: number; [i, rng] = rngInt(rng, 0, species.length - 1); return species[i]!; };
  // Foes per fight: one to start, two through the middle, up to three late, plus one more for each companion
  // fighting beside the hero, so the party is never simply outnumbered and never simply outnumbers.
  const [lo, hi] = FOES_BY_LAYER[Math.min(node.layer, FOES_BY_LAYER.length - 1)]!;
  let count: number; [count, rng] = rngInt(rng, lo, hi);
  if (node.kind === "elite") count = hi + 1;
  if (node.kind === "boss") count = 2;
  if (node.layer >= 2 && node.kind !== "boss") count += rulesOf(run).extraFoes;
  const goalKind = goalAt(run, node);
  if (goalKind === "survive") count += GOAL.surviveExtraFoes;
  count = Math.min(4, count + fielded(run).length);
  // A flooded fight: the rising water carried one foe off.
  if (node.flood === "flooded") count = Math.max(1, count - FLOOD.foesFewer);
  const units: UnitSpec[] = [{ ...heroOf(run), pos: { ...arena.hero }, hpNow: run.heroHp }];
  fielded(run).forEach((m, i) => { if (arena.allies[i]) units.push(memberSpec(m, run.hero.level, arena.allies[i]!, run.shards)); });
  addCombos(run, units);
  if (run.poisonWard) for (const u of units) u.poisonWard = run.poisonWard;
  for (let i = 0; i < count; i++) {
    const pos = arena.foes[i]!;
    const id = run.region ? `r${run.region}n${node.id}-${i}` : `n${node.id}-${i}`;
    const rival = i === 0 && node.rival ? run.rivals.find((r) => r.id === node.rival && !r.settled) : undefined;
    if (rival) { units.push({ ...rivalSpec({ ...rival, level: rival.level + (rulesOf(run).rivalLevel ?? 0) }, lang, pos) }); continue; }
    if (node.kind === "boss" && i === 0) {
      const boss = region.boss, sp = boss.unit ?? species[boss.species]!;
      const f = foeSpec(run, sp, id, pos, depth);
      // A giant is not "heavy" (unshovable): it shrugs off part of every push instead (combat.ts GIANT_PUSH_RESIST).
      units.push({ ...f, name: boss.name[lang].replace("{name}", sp.name), hp: Math.round(f.hp * boss.hp), str: f.str + boss.stat, mag: f.mag + boss.stat, mp: f.mp + boss.mp,
        ...(boss.size && boss.size > 1 ? { size: boss.size } : { heavy: true }),
        ...(boss.abilities ? { abilities: [...f.abilities, ...boss.abilities] } : {}) });
      continue;
    }
    // An elite fight is led by the region's brute, a 2x2 giant, where the arena has room for it.
    if (node.kind === "elite" && i === 0 && region.brute && arena.giant) { units.push(foeSpec(run, region.brute, id, arena.giant, depth)); continue; }
    units.push(foeSpec(run, pick(), id, pos, depth));
  }
  const help = run.help && run.help.node === nodeId && run.help.region === (run.region ?? 0) ? run.help : undefined;
  const helper = help?.kind === "join" ? run.spared?.find((f) => f.id === help.foe) : undefined;
  if (helper) units.push(helperSpec(helper, arena, units));
  const goal = goalKind ? addGoal(run, node, goalKind, arena.map, units, depth, lang) : undefined;
  const map = node.flood ? floodMap(arena.map, node.flood, units.flatMap((u) => cellsOf(u.pos, u.size ?? 1)), seedFrom(`${rs}:flood:${node.id}`)) : arena.map;
  if (goal) return { seed: `${rs}:battle:${node.id}`, map, units, goal };
  if (!isAmbush(run, node) || help?.kind === "warn") return { seed: `${rs}:battle:${node.id}`, map, units };
  placeAmbush(map, units, seedFrom(`${rs}:ambush-spots:${node.id}`));
  return { seed: `${rs}:battle:${node.id}`, map, units, ambush: true };
}

/** The Floodgate's effects: a flooded fight has FLOOD.foesFewer foe fewer, a frozen one pays FLOOD.frozenCoins
    times the coins. `spread` is the share of dry low ground next to the water that floods. */
export const FLOOD = { foesFewer: 1, frozenCoins: 1.25, spread: 0.5 };

/** An arena after the Floodgate. Frozen: every pool turns to ice (walkable). Flooded: the ice melts, and some of the
    flat ground next to the water goes under, never where a unit starts or where something stands. */
export function floodMap(map: GridMap, kind: "flooded" | "frozen", keep: Pos[], seed: number): GridMap {
  const out = structuredClone(map);
  out.id = `${map.id}-${kind}`;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < map.w && y < map.h ? map.tiles[y * map.w + x] : undefined);
  let rng = seed;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = out.tiles[y * map.w + x]!, was = map.tiles[y * map.w + x]!;
    if (kind === "frozen") { if (was.terrain === "water") t.terrain = "ice"; continue; }
    if (was.terrain === "ice") { t.terrain = "water"; continue; }
    if ((was.terrain !== "grass" && was.terrain !== "dirt") || was.h !== 0 || was.prop || was.surface) continue;
    if (keep.some((p) => p.x === x && p.y === y)) continue;
    const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = at(x + dx!, y + dy!); return n?.terrain === "water" || n?.terrain === "ice"; });
    if (!wet) continue;
    let v: number; [v, rng] = rngNext(rng);
    if (v < FLOOD.spread) t.terrain = "water";
  }
  return out;
}

/** The combos the party has unlocked, on whoever casts them, for battles their partner fights in too. */
function addCombos(run: RunState, units: UnitSpec[]) {
  for (const id of run.combos ?? []) {
    const ab = ABILITIES[id], caster = units.find((u) => u.id === COMBO_CASTER[id as ComboId]);
    if (!ab?.combo || !caster || !units.some((u) => u.id === ab.combo!.partner)) continue;
    if (!caster.abilities.includes(id)) caster.abilities = [...caster.abilities, id];
  }
}

/** The goal a plain fight carries, if any (engine/goals.ts): seeded per node, so the signposts can show it before the
    party picks a path. Never on an ambush, a flooded or frozen fight, the first layer, or any other kind of node. */
export function goalAt(run: RunState, node: RunNode): GoalKind | undefined {
  if (node.kind !== "battle" || node.layer < 1 || node.flood || node.rival || node.quest || isAmbush(run, node)) return undefined;
  const rs = regionSeed(run.seed, run.region ?? 0);
  let [v, rng] = rngNext(seedFrom(`${rs}:goal:${node.id}`));
  if (v >= GOAL.chance) return undefined;
  let i: number; [i, rng] = rngInt(rng, 0, GOAL_KINDS.length - 1);
  return GOAL_KINDS[i];
}

/** Puts a goal's survivor or courier on the field and returns the goal. The survivor stands in the open between the
    two sides; the courier starts as far from every edge as the map allows (clear of the party), so it has a way to run. */
function addGoal(run: RunState, node: RunNode, kind: GoalKind, map: GridMap, units: UnitSpec[], depth: number, lang: "es" | "en"): Goal {
  if (kind === "survive") return { kind, rounds: GOAL.surviveRounds };
  const rs = regionSeed(run.seed, run.region ?? 0);
  const taken = (p: Pos) => units.some((u) => coversPos(u.pos, u.size ?? 1, p));
  const gap = (p: Pos, team: "heroes" | "foes") => Math.min(99, ...units.filter((u) => u.team === team).map((u) => Math.abs(u.pos.x - p.x) + Math.abs(u.pos.y - p.y)));
  const edge = (p: Pos) => Math.min(p.x, p.y, map.w - 1 - p.x, map.h - 1 - p.y);
  let best: { p: Pos; score: number } | null = null;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const p = { x, y };
    if (!standable(tileAt(map, p)) || taken(p) || tileAt(map, p)!.terrain === "water") continue;
    const hg = gap(p, "heroes"), fg = gap(p, "foes");
    if (hg < 3 || (kind === "protect" && fg < 3)) continue;
    // Survivor: about as far from both sides, nearer the party if anything. Courier: deep inside the map.
    const score = kind === "protect" ? -Math.abs(hg - fg) - 0.1 * hg + 0.2 * edge(p) : edge(p) * 10 - fg * 0.5;
    if (!best || score > best.score) best = { p, score };
  }
  const pos = best?.p ?? units.find((u) => u.team === "heroes")!.pos;
  const hp = (base: number) => Math.round(base * (1 + DEPTH_HP * depth));
  if (kind === "protect") {
    const [i] = rngInt(seedFrom(`${rs}:survivor:${node.id}`), 0, SURVIVORS.length - 1);
    const sv = SURVIVORS[i]!;
    units.push({ ...structuredClone(SURVIVOR_STATS), id: "ward", name: sv.name[lang], look: sv.look, pos: { ...pos }, hp: hp(SURVIVOR_STATS.hp), ward: true });
    return { kind, ward: "ward" };
  }
  const id = run.region ? `r${run.region}n${node.id}-courier` : `n${node.id}-courier`;
  units.push({ ...structuredClone(COURIER), id, name: COURIER_NAME[lang], pos: { ...pos }, hp: hp(COURIER.hp), runner: true });
  return { kind, runner: id };
}

/** Share of plain fights and elites (from layer 1 on) where the foes lie in wait. Rivals and bosses never hide:
    they want to be seen. */
export const AMBUSH_CHANCE = 0.3;
export function isAmbush(run: RunState, node: RunNode): boolean {
  if ((node.kind !== "battle" && node.kind !== "elite") || node.layer < 1) return false;
  const [v] = rngNext(seedFrom(`${regionSeed(run.seed, run.region ?? 0)}:ambush:${node.id}`));
  return v < AMBUSH_CHANCE;
}

/** An ambush: the foes start close to the party (2 or 3 tiles from the nearest member, never next to one) and on
    its flanks, taking turns left, right and behind. */
function placeAmbush(map: GridMap, units: UnitSpec[], seed: number) {
  const party = units.filter((u) => u.team === "heroes"), foes = units.filter((u) => u.team === "foes");
  const cx = party.reduce((a, u) => a + u.pos.x, 0) / party.length, cy = party.reduce((a, u) => a + u.pos.y, 0) / party.length;
  const near = (p: Pos) => Math.min(...party.map((u) => Math.abs(u.pos.x - p.x) + Math.abs(u.pos.y - p.y)));
  const spots: { p: Pos; side: number; roll: number }[] = [];
  let rng = seed;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const p = { x, y }, d = near(p);
    if (d < 2 || d > 3 || !standable(tileAt(map, p))) continue;
    // Sides: 0 left of the party, 1 right of it, 2 behind it (further from the foes' usual side, the top).
    const side = y > cy + 1 ? 2 : x < cx ? 0 : 1;
    let roll: number; [roll, rng] = rngNext(rng);
    spots.push({ p, side, roll });
  }
  const used: Pos[] = [];
  foes.forEach((f, i) => {
    if ((f.size ?? 1) > 1) return; // a giant is too big to hide: it waits where it stands
    const want = [0, 1, 2, 0][i % 4]!;
    const free = spots.filter((s) => !used.some((u) => u.x === s.p.x && u.y === s.p.y) && !used.some((u) => Math.abs(u.x - s.p.x) + Math.abs(u.y - s.p.y) < 2));
    const pick = free.filter((s) => s.side === want).sort((a, b) => a.roll - b.roll)[0] ?? free.sort((a, b) => a.roll - b.roll)[0];
    if (!pick) return; // no room: this foe keeps its usual spot
    f.pos = { ...pick.p }; used.push(pick.p);
  });
}

/** A spared foe fighting beside the party for one battle: on a free ally spot, or the free tile nearest the hero. */
function helperSpec(f: SparedFoe, arena: ReturnType<typeof arenaFor>, units: UnitSpec[]): UnitSpec {
  const taken = (p: Pos) => units.some((u) => coversPos(u.pos, u.size ?? 1, p));
  let pos = arena.allies.find((p) => !taken(p));
  if (!pos) {
    let best: { p: Pos; d: number } | null = null;
    for (let y = 0; y < arena.map.h; y++) for (let x = 0; x < arena.map.w; x++) {
      const p = { x, y }, d = Math.abs(x - arena.hero.x) + Math.abs(y - arena.hero.y);
      if (!standable(tileAt(arena.map, p)) || taken(p) || arena.foes.some((q) => q.x === x && q.y === y)) continue;
      if (!best || d < best.d) best = { p, d };
    }
    pos = best?.p ?? arena.hero;
  }
  const spec: UnitSpec = { ...structuredClone(f.spec), id: `ally-${f.id}`, team: "heroes", pos: { ...pos } };
  delete spec.marked; delete spec.rival; delete spec.hunts; delete spec.hpNow; delete spec.refuses;
  delete spec.size; // a spared giant comes back at normal size, as a giant rival does (rivals.ts)
  return spec;
}

/** Which spared foe, if any, comes back to help at `node`, and how. Each helps once; the more the party has spared,
    the likelier it is. Fights: it warns of an ambush (calling it off) or joins in; shops: it sells cheaper. */
export function helpAt(run: RunState, node: RunNode): RunState["help"] {
  const waiting = (run.spared ?? []).filter((f) => !f.helped);
  if (!waiting.length || relapses(run)) return undefined;
  const fight = node.kind === "battle" || node.kind === "elite" || node.kind === "rival" || node.kind === "boss";
  if (!fight && node.kind !== "shop") return undefined;
  const [v] = rngNext(seedFrom(`${regionSeed(run.seed, run.region ?? 0)}:help:${node.id}`));
  if (v >= Math.min(MERCY.helpMax, MERCY.helpPer * waiting.length)) return undefined;
  const kind: HelpKind = node.kind === "shop" ? "discount" : isAmbush(run, node) ? "warn" : "join";
  return { node: node.id, region: run.region ?? 0, foe: waiting[0]!.id, kind };
}

/** A spared foe can be pulled back by the Sap only when the hero is Sap-touched (Purity/Sap meter at -ALIGN.mark
    or lower): then spared foes stop coming back to help. With Purity, spared stays spared. */
export const relapses = (run: RunState) => alignOf(run).purity <= -ALIGN.mark;

/** The line said when a spared foe helps. */
export function helpLine(run: RunState, lang: keyof Line): string {
  const h = run.help, f = h && run.spared?.find((x) => x.id === h.foe);
  return h && f ? HELP_LINES[h.kind][lang].replace("{name}", f.name) : "";
}

/** Goes to a node the player can go to: rests heal, shops open, battles start. */
export function enterNode(run: RunState, nodeId: number, lang: "es" | "en"): RunState {
  if (!nextNodes(run).some((n) => n.id === nodeId)) throw new Error(`node ${nodeId} is not open`);
  const next = structuredClone(run);
  const node = next.map.nodes[nodeId]!;
  delete next.spoils;
  next.remarks = [];
  delete next.help;
  const help = helpAt(next, node);
  if (help) {
    next.help = help;
    next.spared!.find((f) => f.id === help.foe)!.helped = true;
    if (help.kind === "discount") next.remarks.push({ es: helpLine(next, "es"), en: helpLine(next, "en") });
  }
  if (node.kind === "rest" || node.kind === "shop" || node.kind === "recruit" || node.kind === "quest" || node.kind === "floodgate") {
    if (node.kind === "rest") {
      next.heroHp = Math.min(heroMaxHp(next), next.heroHp + Math.round(heroMaxHp(next) * (REST_HEAL + rulesOf(next).healBonus)));
      for (const m of next.party) {
        // Companions who have had enough leave at a rest, taking their things.
        if (m.status === "leaving") { m.status = "left"; continue; }
        if (m.status === "with") m.hp = Math.min(memberMaxHp(next, m), m.hp + Math.round(memberMaxHp(next, m) * (REST_HEAL + rulesOf(next).healBonus)));
      }
      if (next.shards >= ALTAR.shards) next.offers.push({ kind: "altar" });
      // Past the town, the camps hold survivors of the storm fire Centella lit.
      if ((next.region ?? 0) >= 1) seeIt(next, "centella");
    } else if (node.kind === "shop") {
      const by = help?.kind === "discount" ? next.spared!.find((f) => f.id === help.foe)!.name : undefined;
      next.offers.push({ kind: "shop", stock: shopStock(next, nodeId), ...(by ? { discount: by } : {}) });
    }
    else if (node.recruit) {
      const talk = TALKS[node.recruit]!;
      // Not while they wait ahead as a rival: once spared, they can be asked along again.
      const away = activeRivals(next.rivals).some((r) => r.returned === talk.companion);
      if (COMPANIONS[talk.companion] && !away && !next.party.some((m) => m.id === talk.companion)) next.offers.push({ kind: "talk", id: node.recruit });
    } else if (node.quest) {
      const m = next.party.find((x) => x.id === node.quest);
      if (m && m.status === "with" && !m.lesson) next.offers.push({ kind: "quest", companion: m.id });
    } else if (node.kind === "floodgate") {
      const paths = [...node.next].sort((a, b) => next.map.nodes[a]!.col - next.map.nodes[b]!.col);
      next.offers.push({ kind: "floodgate", paths });
    }
    next.at = nodeId; next.path.push(nodeId);
    placeQuests(next);
    offerJob(next);
    return next;
  }
  next.battle = { version: 2, setup: battleSetup(next, nodeId, lang), commands: [], rewindsUsed: 0, node: nodeId };
  return next;
}

/** Closes the current battle: spoils, HP, rivals, then the perk picks and the reward to choose. */
export function finishBattle(run: RunState, battleEnd: BattleState): RunState {
  const b = run.battle;
  if (!b || !battleEnd.winner) throw new Error("no finished battle");
  // Foes left unsettled after a win (no choice was made) are finished.
  const end = structuredClone(battleEnd);
  for (const u of unsettled(end)) u.life = "dead";
  const next = structuredClone(run);
  delete next.battle;
  next.rivals = afterBattle(next.rivals, b.setup, b.commands, end);
  // The hero is the first unit of the setup; the battle can reorder its units, so look it up by id.
  const heroId = b.setup.units[0]!.id;
  const hero = end.units.find((u) => u.id === heroId)!;
  if (end.winner === "foes" || hero.life !== "up") {
    next.over = "lost"; next.heroHp = 0;
    // Whoever ended the run follows the hero into the next one.
    const ender = runEnder(next.rivals, b.setup, b.commands, end);
    if (ender) {
      if (!next.rivals.some((r) => r.id === ender.id)) next.rivals.push(ender);
      const kept = next.rivals.find((r) => r.id === ender.id)!;
      kept.depth = Math.max(kept.depth ?? 0, depthOf(next, next.map.nodes[b.node]!));
      next.endedBy = ender.id;
      next.remarks = [nemesisLine("carries", ender)];
    }
    return next;
  }
  const node = next.map.nodes[b.node]!;
  next.at = b.node; next.path.push(b.node);
  // A nemesis settled at last: the chase is over, and its Sap mark crumbles into shards.
  const nemesisDone = next.rivals.find((r) => r.nemesis && r.settled && !run.rivals.find((o) => o.id === r.id)?.settled);
  const returnDone = next.rivals.find((r) => r.returned && r.settled && !run.rivals.find((o) => o.id === r.id)?.settled);

  const beaten = end.units.filter((u) => u.team === "foes" && (u.life === "dead" || u.life === "downed" || u.life === "spared"));
  const spared = end.units.filter((u) => u.team === "foes" && u.life === "spared" && !u.runner);
  const shards = node.kind === "boss" ? REWARD.bossShards : node.kind === "elite" ? REWARD.eliteShards
    : node.kind === "rival" && beaten.some((u) => u.rival) ? REWARD.rivalShards : 0;

  // Companions: the fallen are lost for the run; the rest carry their HP and react to what they saw.
  const deeds = readDeeds(b.setup, b.commands);
  if (shards > 0) deeds.shardsGained = 1;
  lean(next, { beacon: deeds.helpUp + deeds.letEscape + deeds.noneDowned + deeds.spare, blaze: deeds.killFleeing + deeds.rivalBeaten + deeds.finishDowned + deeds.finishYielding });
  next.remarks = [];
  // Guijo's alternative good path: ready (approval high) and his lesson not yet taken, he watches an ally bleed out
  // in a fight that was won, and holds. It is not the forbidden deed then: it is what he had to learn.
  const guijo = fielded(next).find((m) => m.id === "guijo");
  const guijoUp = guijo && end.units.find((u) => u.id === "guijo")?.life !== "dead";
  const guijoDeeds = guijo && guijoUp && !guijo.lesson && guijo.approval >= LESSON_APPROVAL && deeds.allyBledOut > 0 ? { ...deeds, allyBledOut: 0 } : null;
  if (guijoDeeds) { guijo!.lesson = "alt"; next.remarks.push(QUESTS.guijo!.alt!.choices.alt!.reply); unlock(next, "guijo", "alt"); }
  // A rival finished while Centella waited at camp: her own hunt can only end at the burned village now.
  const centella = next.party.find((m) => m.id === "centella" && m.status === "with" && !m.lesson);
  if (centella && deeds.rivalBeaten > 0 && !fielded(next).includes(centella)) centella.altPath = true;
  // The alignment meters: sparing and helping up against finishing, the tagged twins used, rivals settled.
  const alignBefore = alignOf(next);
  const crossed = shiftAlign(next, battleShift(b.setup, b.commands, end, deeds));
  const after = alignOf(next);
  for (const m of fielded(next)) {
    const u = end.units.find((x) => x.id === m.id);
    if (!u) continue;
    if (u.life === "dead") { m.status = "fallen"; continue; }
    const max = memberMaxHp(next, m);
    m.hp = Math.min(max, Math.max(1, u.hp) + Math.round(max * Math.max(0, AFTER_WIN_HEAL + rulesOf(next).healBonus)));
    const { member, remarks } = react(m, m.id === "guijo" && guijoDeeds ? guijoDeeds : deeds);
    Object.assign(m, member);
    next.remarks.push(...remarks);
    if (m.status === "turned") {
      const spec = memberSpec(m, next.hero.level, u.pos);
      next.rivals.push(rivalFromCompanion(spec, HERO.name, readStyle(b.setup, b.commands), `${next.seed}:${b.node}`));
    }
  }

  // What the flaws cost, seen with their own eyes.
  const saw = (id: string) => fielded(next).some((m) => m.id === id);
  const fellNow = end.units.some((u) => u.team === "heroes" && u.life === "dead" && next.party.some((m) => m.id === u.id));
  if (node.kind === "rival" && next.rivals.find((r) => r.id === node.rival)?.cause.kind === "escaped" && saw("remanso")) seeIt(next, "remanso");
  if ((deeds.allyBledOut || fellNow) && saw("guijo")) seeIt(next, "guijo");
  if (deeds.sapRemedy && saw("moheda")) seeIt(next, "moheda");

  // Spoils: every foe put down (not the ones that got away), scaled by depth and the kind of node.
  const mult = (1 + REWARD.perLayer * depthOf(next, node)) * (node.kind === "boss" ? REWARD.bossMult : node.kind === "elite" ? REWARD.eliteMult : node.kind === "rival" ? REWARD.rivalMult : 1);
  // A goal (engine/goals.ts): a met one pays its prize; a failed one only costs it.
  const goal = b.setup.goal, goalDone = goal ? goalStatus(end) : undefined;
  const held = goal?.kind === "survive" && goalDone === "met" ? end.units.filter((u) => u.team === "foes" && u.life === "up" && !u.runner).length * GOAL.surviveStandingShare : 0;
  const counted = beaten.filter((u) => !u.runner).length + held;
  const purse = goal?.kind === "catch" && goalDone === "met" ? Math.round(REWARD.purse * GOAL.catchCoins * (1 + REWARD.perLayer * depthOf(next, node))) : 0;
  const goalShards = goal?.kind === "catch" && goalDone === "met" ? GOAL.catchShards : 0;
  const coins = Math.round(counted * REWARD.coinsPerFoe * mult * rulesOf(next).coins * (node.flood === "frozen" ? FLOOD.frozenCoins : 1)) + purse;
  const xp = Math.round(counted * REWARD.xpPerFoe * mult);
  next.coins += coins; next.shards += shards + goalShards;
  const before = heroMaxHp(next);
  const grown = gainXp(next.hero, xp, `${next.seed}:${b.node}`);
  next.hero = grown.progress;
  next.spoils = { coins, xp, shards: shards + goalShards, levels: grown.levels, align: { mercy: after.mercy - alignBefore.mercy, purity: after.purity - alignBefore.purity } };
  next.remarks.push(...crossed);
  const ward = goal?.kind === "protect" ? b.setup.units.find((u) => u.id === goal.ward) : undefined;
  if (goal && goalDone) {
    const line = GOAL_LINES[goal.kind][goalDone === "met" ? "met" : "failed"];
    const sv = SURVIVORS.find((x) => x.look === ward?.look) ?? SURVIVORS[0]!;
    const fill = (text: string, l: "es" | "en") => text.replace("{the}", sv.the[l]).replace("{The}", sv.the[l][0]!.toUpperCase() + sv.the[l].slice(1));
    if (line.en && goalDone !== "open") next.remarks.push({ es: fill(line.es, "es"), en: fill(line.en, "en") });
    if (goal.kind === "protect" && goalDone === "met") next.remarks.push(...shiftAlign(next, { mercy: GOAL.protectMercy }));
  }
  if (nemesisDone) { next.shards += NEMESIS.shards; next.remarks.push(nemesisLine("settled", nemesisDone)); }
  if (returnDone) next.remarks.push(returnLine(returnDone.settled === "spared" ? "spared" : "finished", returnDone.base.name));
  // Spared, they walk with the hero again, warily (starting approval, their lines known from last time).
  if (returnDone?.settled === "spared" && COMPANIONS[returnDone.returned!] && !next.party.some((m) => m.id === returnDone.returned)) {
    next.party.push(newMember(returnDone.returned!, 0, true)); placeQuests(next);
  }
  // Catching your breath after a win gives a little back; levels raise max HP and current HP alike.
  const max = heroMaxHp(next);
  next.heroHp = Math.min(max, hero.hp + (max - before) + Math.round(max * Math.max(0, AFTER_WIN_HEAL + rulesOf(next).healBonus)));
  for (const pair of grown.perkChoices) next.offers.push({ kind: "perk", options: pair });

  // Rivals wait on a node ahead. One that got away again, or whose node the party can no longer reach,
  // moves to a new one; a new rival takes its first.
  const ahead = aheadOf(next.map, next.at);
  for (const r of activeRivals(next.rivals)) {
    const at = next.map.nodes.find((n) => n.rival === r.id);
    if (at && ahead.has(at.id)) continue;
    if (at) { at.rival = undefined; if (at.id !== b.node) at.kind = "battle"; }
    placeRival(next.map, next.at, r.id, `${next.seed}:${next.region ?? 0}:${next.path.length}`);
  }
  if (node.kind === "boss") {
    if (ALIGN.lockAt === "regionEnd") next.remarks.push(...lockIn(next));
    if (isLastRegion(next)) { next.over = "won"; next.offers = []; return next; }
    // On to the next region: a fresh map, the party and everything carried, and a breather.
    next.region = (next.region ?? 0) + 1;
    next.map = regionMap(next.seed, next.region);
    next.at = null; next.path = [];
    next.heroHp = Math.min(heroMaxHp(next), next.heroHp + Math.round(heroMaxHp(next) * REGION_REST));
    for (const m of fielded(next)) m.hp = Math.min(memberMaxHp(next, m), m.hp + Math.round(memberMaxHp(next, m) * REGION_REST));
    for (const r of activeRivals(next.rivals)) placeRival(next.map, null, r.id, `${next.seed}:region:${next.region}:${r.id}`);
  }
  placeQuests(next);
  // Sparing pays at once: each spared foe hands something over, before the battle's own reward.
  for (const u of spared) {
    const spec = b.setup.units.find((x) => x.id === u.id)!;
    (next.spared ??= []).push({ id: u.id, name: u.name, spec: structuredClone(spec), region: next.region ?? 0 });
    next.offers.push({ kind: "reward", options: giftOptions(next, node), gift: u.name });
  }
  // A survivor kept alive hands something over too.
  if (ward && goalDone === "met") next.offers.push({ kind: "reward", options: giftOptions(next, node), gift: ward.name });
  next.offers.push({ kind: "reward", options: rewardOptions(next, node) });
  offerJob(next);
  return next;
}

/** What a spared foe hands over: coins, a Savia shard, or a patch-up. */
function giftOptions(run: RunState, node: RunNode): RewardOption[] {
  return [
    { t: "coins", n: Math.round(REWARD.purse * MERCY.giftCoins * (1 + REWARD.perLayer * depthOf(run, node))) },
    { t: "shards", n: MERCY.giftShards },
    { t: "heal", n: Math.round(heroMaxHp(run) * MERCY.giftHeal) },
  ];
}

/** Companions travelling with the party react to something done on the run map. */
function lean(run: RunState, by: Record<Job, number>) {
  const l = run.leanings ?? { beacon: 0, blaze: 0 };
  run.leanings = { beacon: l.beacon + by.beacon, blaze: l.blaze + by.blaze };
}

/** Halfway through the first region (after a node on JOB_LAYER or later), once: the job the run leans towards. */
function offerJob(run: RunState) {
  if (run.hero.job || (run.region ?? 0) > 0 || run.at === null || run.offers.some((o) => o.kind === "job")) return;
  if (run.map.nodes[run.at]!.layer < JOB_LAYER) return;
  const l = run.leanings ?? { beacon: 0, blaze: 0 };
  const options: Job[] = l.beacon > l.blaze ? ["beacon"] : l.blaze > l.beacon ? ["blaze"] : ["beacon", "blaze"];
  run.offers.push({ kind: "job", options });
}

/** The choices a companion's lesson moment offers: the sacrifice only once they are ready for it. */
export function questChoices(run: RunState, companion: string): Lesson[] {
  return questView(run, companion).choices.map((c) => c.lesson);
}

/** Moheda's alternative good path costs her this share of max HP for the rest of the run. */
export const ALT_HP_CUT = 0.2;

/** A quest as it plays out now: its usual lesson, or its alternative good path (M3 draft, "Alternative good"):
    - Remanso: no rival the party let go is still out there, so the test is his mill (he must break its dam).
    - Centella: a rival was finished while she waited at camp, so the test is facing the village she burned.
    - Moheda: not yet seen what her remedies cost, but trusted (approval high): she can test the last sample on
      herself instead of a patient.
    Guijo's alternative happens in battle (finishBattle). */
export function questView(run: RunState, companion: string) {
  const q = QUESTS[companion]!, m = run.party.find((x) => x.id === companion);
  const trusted = !!m && m.approval >= LESSON_APPROVAL, ready = !!m && readyForLesson(m);
  const pick = (lessons: Lesson[], alt = false) => lessons.map((lesson) => ({ lesson, ...((alt && q.alt?.choices[lesson]) || q.choices[lesson as Exclude<Lesson, "alt">]) }));
  if (companion === "remanso" && !run.rivals.some((r) => !r.settled && r.cause.kind === "escaped"))
    return { lines: q.alt!.lines!, notReady: q.alt!.notReady!, ready: trusted, alt: true, choices: pick(trusted ? ["alt", "hold"] : ["hold"], true) };
  if (companion === "centella" && m?.altPath)
    return { lines: q.alt!.lines!, notReady: q.notReady, ready, alt: true, choices: pick(ready ? ["alt", "hold", "double"] : ["hold", "double"], true) };
  if (companion === "moheda" && !ready && trusted)
    return { lines: q.lines, notReady: q.notReady, ready: true, alt: true, choices: pick(["alt", "hold", "double"], true) };
  return { lines: q.lines, notReady: q.notReady, ready, alt: false, choices: pick(ready ? ["sacrifice", "hold", "double"] : ["hold", "double"]) };
}

/** What a lesson unlocks: a combo, and Moheda's poison ward. */
function unlock(run: RunState, companion: string, lesson: Lesson) {
  const u = QUESTS[companion]?.unlocks?.[lesson];
  if (!u) return;
  if (u.combo && !(run.combos ??= []).includes(u.combo)) run.combos.push(u.combo);
  if (u.poisonWard) run.poisonWard = Math.max(run.poisonWard ?? 0, u.poisonWard);
  run.remarks.push(u.line);
}

/** A companion sees what their flaw costs: said once, remembered for their quest. */
function seeIt(run: RunState, id: string) {
  const m = run.party.find((x) => x.id === id);
  if (!m || m.status !== "with" || m.seen || m.lesson) return;
  m.seen = true;
  run.remarks.push(QUESTS[id]!.seen);
}

/** Keeps each pending quest on a node the party can still reach; one cut off by the path taken moves ahead. */
function placeQuests(run: RunState) {
  const ahead = aheadOf(run.map, run.at);
  for (const m of run.party) {
    const node = run.map.nodes.find((n) => n.quest === m.id);
    const pending = m.status === "with" && !m.lesson && !!QUESTS[m.id];
    if (node && pending && ahead.has(node.id)) continue;
    if (node && node.id !== run.at) { node.quest = undefined; node.kind = "battle"; }
    if (pending) placeQuest(run.map, run.at, m.id, `${run.seed}:${run.region ?? 0}:${run.path.length}`);
  }
}

const NO_STYLE = { element: null, range: null, opener: null, protects: false };

function witness(run: RunState, deeds: Partial<Deeds>) {
  for (const m of run.party) {
    if (m.status !== "with" && m.status !== "leaving") continue;
    const { member, remarks } = react(m, deeds);
    Object.assign(m, member);
    run.remarks.push(...remarks);
    // Turning on the party away from a battle: the rival remembers no fighting style yet.
    if ((m.status as Member["status"]) === "turned") {
      const spec = memberSpec(m, run.hero.level, { x: 0, y: 0 });
      run.rivals.push(rivalFromCompanion(spec, HERO.name, NO_STYLE, `${run.seed}:${run.region ?? 0}:${run.path.length}`));
      placeRival(run.map, run.at, spec.id, `${run.seed}:${run.region ?? 0}:${run.path.length}:${spec.id}`);
    }
  }
}

/** Items the hero does not own yet, of a rarity. */
const unowned = (run: RunState, rarity: Rarity) =>
  Object.values(ITEMS).filter((it) => it.rarity === rarity && !run.hero.bag.includes(it.id) && !Object.values(run.hero.gear).includes(it.id)).map((it) => it.id);

/** 1 of 3 after a win: an item (rarer deeper in, and after hard fights), then coins, then a heal or shards. */
function rewardOptions(run: RunState, node: RunNode): RewardOption[] {
  let rng = seedFrom(`${run.seed}:reward:${node.id}`);
  const roll = () => { let v: number; [v, rng] = rngNext(rng); return v; };
  const tough = node.kind !== "battle";
  const rarity: Rarity = roll() < (tough ? 0.25 : 0.05) + Math.min(depthOf(run, node), 10) * 0.04 ? "epic" : roll() < (tough ? 0.6 : 0.3) + Math.min(depthOf(run, node), 10) * 0.05 ? "rare" : "common";
  const options: RewardOption[] = [];
  const pool = unowned(run, rarity).length ? unowned(run, rarity) : unowned(run, "common");
  if (pool.length) options.push({ t: "item", id: pool[Math.floor(roll() * pool.length)]! });
  options.push({ t: "coins", n: Math.round(REWARD.purse * (1 + REWARD.perLayer * depthOf(run, node))) });
  options.push(roll() < 0.25 ? { t: "shards", n: 1 } : { t: "heal", n: Math.round(heroMaxHp(run) * REWARD.patchUp) });
  return options;
}

function shopStock(run: RunState, nodeId: number): string[] {
  let rng = seedFrom(`${run.seed}:shop:${nodeId}`);
  const pool = [...unowned(run, "common"), ...unowned(run, "rare"), ...unowned(run, "epic")];
  const stock: string[] = [];
  while (stock.length < SHOP.stock && pool.length) {
    let i: number; [i, rng] = rngInt(rng, 0, pool.length - 1);
    stock.push(pool.splice(i, 1)[0]!);
  }
  return stock;
}

/** Epic items cost Savia shards; the rest cost coins. */
export const priceOf = (itemId: string) => ({ amount: ITEMS[itemId]!.price, currency: ITEMS[itemId]!.rarity === "epic" ? "shards" as const : "coins" as const });

/** The price at the shop the party is in: a spared foe minding the stall takes MERCY.discount off (at least 1). */
export function priceIn(run: RunState, itemId: string) {
  const p = priceOf(itemId), shop = run.offers[0];
  if (shop?.kind !== "shop" || !shop.discount) return p;
  return { ...p, amount: Math.max(1, Math.round(p.amount * (1 - MERCY.discount))) };
}

/** Answers the first offer: picks a reward or a perk by its index. */
export function choose(run: RunState, index: number): RunState {
  const offer = run.offers[0];
  if (!offer || offer.kind === "shop") throw new Error("nothing to choose");
  const next = structuredClone(run);
  if (offer.kind === "altar") {
    next.offers.shift();
    if (index !== 0) return next;
    // Burning shards heals everyone to full; the companions who care about the Savia see it.
    next.shards -= ALTAR.shards;
    next.heroHp = heroMaxHp(next);
    for (const m of next.party) if (m.status === "with") m.hp = memberMaxHp(next, m);
    witness(next, { destroyShards: 1 });
    lean(next, { beacon: 2, blaze: 0 });
    next.remarks.push(...shiftAlign(next, { purity: SHIFT.burnShards }));
    offerJob(next);
    return next;
  }
  if (offer.kind === "job") {
    const job = offer.options[index];
    if (!job) throw new Error("no such job");
    next.offers.shift();
    const before = heroMaxHp(next);
    next.hero.job = job;
    next.heroHp += heroMaxHp(next) - before;
    witness(next, job === "beacon" ? { jobBeacon: 1 } : { jobBlaze: 1 });
    return next;
  }
  if (offer.kind === "quest") {
    if (offer.reply) { next.offers.shift(); return next; }
    const pick = questView(run, offer.companion).choices[index];
    if (!pick) throw new Error("no such choice");
    const lesson = pick.lesson;
    const q = QUESTS[offer.companion]!, m = next.party.find((x) => x.id === offer.companion)!;
    m.lesson = lesson;
    (next.offers[0] as { reply?: Line }).reply = pick.reply;
    if (lesson === "double" && q.doubleLeaves) m.status = "left";
    // Centella stays behind at the village; Moheda stays weaker.
    if (lesson === "alt" && offer.companion === "centella") m.status = "stayed";
    if (lesson === "alt" && offer.companion === "moheda") { m.hpCut = ALT_HP_CUT; m.hp = Math.min(m.hp, memberMaxHp(next, m)); }
    next.remarks = [];
    unlock(next, offer.companion, lesson);
    return next;
  }
  if (offer.kind === "floodgate") {
    const single = offer.paths.length === 1;
    const first = single ? offer.paths[0]! : offer.paths[index];
    if (first === undefined || (single && index > 1)) throw new Error("no such choice");
    next.offers.shift();
    setFloodgate(next.map, next.at!, first, single ? (index === 0 ? "flooded" : "frozen") : undefined);
    return next;
  }
  if (offer.kind === "talk") {
    // First answer: the choice and its reply; second answer (index ignored): close the conversation.
    if (offer.reply) { next.offers.shift(); return next; }
    const talk = TALKS[offer.id]!;
    const pick = talk.choices[index];
    if (!pick) throw new Error("no such choice");
    (next.offers[0] as { reply?: Line }).reply = pick.reply;
    if (pick.joins) { next.party.push(newMember(talk.companion, pick.approval, !!pick.reveals)); placeQuests(next); }
    return next;
  }
  next.offers.shift();
  if (offer.kind === "perk") {
    const id = offer.options[index];
    if (!id || !PERKS[id]) throw new Error("no such perk");
    const before = heroMaxHp(next);
    next.hero.perks.push(id);
    next.heroHp += heroMaxHp(next) - before;
    return next;
  }
  const r = offer.options[index];
  if (!r) throw new Error("no such reward");
  if (r.t === "item") gainItem(next, r.id);
  if (r.t === "coins") next.coins += r.n;
  if (r.t === "shards") next.shards += r.n;
  if (r.t === "heal") next.heroHp = Math.min(heroMaxHp(next), next.heroHp + r.n);
  return next;
}

function gainItem(run: RunState, id: string) {
  const before = heroMaxHp(run);
  run.hero = take(run.hero, id);
  run.heroHp = Math.max(1, Math.min(heroMaxHp(run), run.heroHp + heroMaxHp(run) - before));
}

/** Shop: buys one item in stock, if the purse allows. */
export function buy(run: RunState, itemId: string): RunState {
  const offer = run.offers[0];
  if (offer?.kind !== "shop" || !offer.stock.includes(itemId)) throw new Error("not for sale here");
  const { amount, currency } = priceIn(run, itemId);
  if (run[currency] < amount) throw new Error(`not enough ${currency}`);
  const next = structuredClone(run);
  next[currency] -= amount;
  if (currency === "shards") { witness(next, { spendShards: 1 }); next.remarks.push(...shiftAlign(next, { purity: SHIFT.spendShards })); }
  (next.offers[0] as { stock: string[] }).stock = offer.stock.filter((x) => x !== itemId);
  gainItem(next, itemId);
  return next;
}

/** Shop: a healer patches the hero up for coins. */
export function shopHeal(run: RunState): RunState {
  if (run.offers[0]?.kind !== "shop") throw new Error("no shop here");
  if (run.coins < SHOP.healPrice) throw new Error("not enough coins");
  const next = structuredClone(run);
  next.coins -= SHOP.healPrice;
  next.heroHp = Math.min(heroMaxHp(next), next.heroHp + Math.round(heroMaxHp(next) * SHOP.heal));
  return next;
}

export function leaveShop(run: RunState): RunState {
  if (run.offers[0]?.kind !== "shop") throw new Error("no shop here");
  const next = structuredClone(run);
  next.offers.shift();
  return next;
}

/** Wears an item from the bag (any time on the map). */
export function wear(run: RunState, itemId: string): RunState {
  const next = structuredClone(run);
  const before = heroMaxHp(next);
  next.hero = equip(next.hero, itemId);
  next.heroHp = Math.max(1, Math.min(heroMaxHp(next), next.heroHp + heroMaxHp(next) - before));
  return next;
}

/** Swaps a card for its twin (`on`) or back, for free, between stops. A twin the meters do not allow yet can't be
    picked; one already worn falls back to its original in battle until they allow it again (see heroOf). */
export function wearTwin(run: RunState, base: string, on: boolean): RunState {
  const tw = twinOf(base);
  if (!tw) throw new Error(`${base} has no twin`);
  if (run.battle) throw new Error("twins can only be swapped between stops");
  const abilities = heroSpec(HERO, run.hero).abilities;
  if (on && twinBar(run, tw, abilities)) throw new Error(`${tw.twin} is not open`);
  const next = structuredClone(run);
  const list = (next.hero.twins ?? []).filter((x) => x !== base);
  if (on) list.push(base);
  next.hero.twins = list;
  return next;
}
