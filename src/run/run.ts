/* A run: one trip through a region's map with the hero, from the first node to the boss.
   The run ends when the hero falls for good (plan doc gap 10) or when the boss is beaten.

   Between battles the hero grows: XP and levels, a perk pick every second level, coins and Savia shards, a
   choice of 1 of 3 rewards after each win, and a shop (gaps 12 to 14).

   Like a battle, a run is deterministic: the map, every battle's seed and foes, every reward and every rival come
   from the run seed and what happened before. The run save keeps the current battle's own save inside it. */
import { ITEMS, PERKS, REWARD, SHOP, type Rarity } from "../data/gear";
import { DEPTH_HP, DEPTH_STAT, DIFFICULTY, HERO, REGIONS, regionalSpecies, type Difficulty, type Region, type Species } from "../data/region";
import { rngInt, rngNext, seedFrom } from "../engine/rng";
import type { BattleSave } from "../engine/save";
import type { BattleSetup, BattleState, UnitSpec } from "../engine/state";
import { equip, gainXp, heroSpec, newProgress, take, type HeroProgress } from "./hero";
import { aheadOf, choices, generateMap, MAP_LAYERS, placeQuest, placeRival, type RunMap, type RunNode } from "./map";
import { COMPANIONS, QUESTS, TALKS, type Lesson } from "../data/companions";
import { JOB_LAYER, type Job } from "../data/jobs";
import type { Line } from "../data/rivals";
import { memberSpec, newMember, react, readDeeds, readyForLesson, type Deeds, type Member } from "./party";
import { activeRivals, afterBattle, readStyle, rivalFromCompanion, rivalSpec, type Rival } from "./rivals";

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
  | { kind: "reward"; options: RewardOption[] }
  | { kind: "perk"; options: string[] }
  | { kind: "shop"; stock: string[] }
  /** A conversation (data/companions.ts TALKS); after a choice, its reply shows until the player moves on. */
  | { kind: "talk"; id: string; reply?: Line }
  /** A rest's cleansing fire: burn shards (choice 0) or keep them (choice 1). */
  | { kind: "altar" }
  /** The hero's job: the one the run leans towards, or both on a tie. */
  | { kind: "job"; options: Job[] }
  /** A companion's personal quest: its lesson moment (choices from questChoices), then the reply. */
  | { kind: "quest"; companion: string; reply?: Line };

export interface RunState {
  version: number;
  seed: string;
  difficulty: Difficulty;
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
  spoils?: { coins: number; xp: number; shards: number; levels: number };
  over: null | "won" | "lost";
  /** How the run has played, towards the hero's job: Beacon protects and spares, Blaze finishes. */
  leanings?: Record<Job, number>;
}

export function newRun(seed: string, difficulty: Difficulty = "normal"): RunState {
  return {
    version: RUN_VERSION, seed, difficulty, region: 0, map: generateMap(regionSeed(seed, 0), REGIONS[0]!.recruits), at: null, path: [], heroHp: HERO.hp, hero: newProgress(),
    coins: 0, shards: 0, rivals: [], party: [], remarks: [], offers: [], over: null,
  };
}

/** The first region keeps the plain seed, so runs started before regions existed keep their maps. */
const regionSeed = (seed: string, region: number) => (region ? `${seed}:region:${region}` : seed);
export const regionOf = (run: RunState): Region => REGIONS[run.region ?? 0]!;
export const isLastRegion = (run: RunState) => (run.region ?? 0) >= REGIONS.length - 1;
/** Depth added per region already crossed. Less than a whole map: each region starts a little above where the
    last one's middle was, since the party has grown too. */
export const REGION_DEPTH = 2;
/** How deep a node is for scaling foes and rewards: later regions continue from the earlier ones. */
export const depthOf = (run: RunState, node: RunNode) => node.layer + (run.region ?? 0) * REGION_DEPTH;

/** A save from before regions existed: it was in the first one. */
export function upgradeRun(saved: RunState): RunState {
  if (saved.version === 4) return { ...saved, version: RUN_VERSION, region: 0 };
  return saved;
}

export const heroOf = (run: RunState) => heroSpec(HERO, run.hero);
/** Companions who fight in the next battle. */
export const fielded = (run: RunState) => run.party.filter((m) => m.status === "with" || m.status === "leaving").slice(0, MAX_FIELDED);
export const memberMaxHp = (run: RunState, m: Member) => memberSpec(m, run.hero.level, { x: 0, y: 0 }).hp;
export const heroMaxHp = (run: RunState) => heroOf(run).hp;

export const nextNodes = (run: RunState): RunNode[] => (run.over || run.offers.length ? [] : choices(run.map, run.at));

/** Which arena a node uses: picked from the seed so revisiting the save gives the same one. */
function arenaFor(run: RunState, node: RunNode) {
  const arenas = regionOf(run).arenas;
  const [i] = rngInt(seedFrom(`${regionSeed(run.seed, run.region ?? 0)}:arena:${node.id}`), 0, arenas.length - 1);
  return arenas[i]!;
}

export const rulesOf = (run: RunState) => DIFFICULTY[run.difficulty ?? "normal"];

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
  count = Math.min(4, count + fielded(run).length);
  const units: UnitSpec[] = [{ ...heroOf(run), pos: { ...arena.hero }, hpNow: run.heroHp }];
  fielded(run).forEach((m, i) => { if (arena.allies[i]) units.push(memberSpec(m, run.hero.level, arena.allies[i]!, run.shards)); });
  for (let i = 0; i < count; i++) {
    const pos = arena.foes[i]!;
    const id = run.region ? `r${run.region}n${node.id}-${i}` : `n${node.id}-${i}`;
    const rival = i === 0 && node.rival ? run.rivals.find((r) => r.id === node.rival && !r.settled) : undefined;
    if (rival) { units.push({ ...rivalSpec(rival, lang, pos) }); continue; }
    if (node.kind === "boss" && i === 0) {
      const boss = region.boss, sp = boss.unit ?? species[boss.species]!;
      const f = foeSpec(run, sp, id, pos, depth);
      units.push({ ...f, name: boss.name[lang].replace("{name}", sp.name), hp: Math.round(f.hp * boss.hp), str: f.str + boss.stat, mag: f.mag + boss.stat, mp: f.mp + boss.mp, heavy: true });
      continue;
    }
    units.push(foeSpec(run, pick(), id, pos, depth));
  }
  return { seed: `${rs}:battle:${node.id}`, map: arena.map, units };
}

/** Goes to a node the player can go to: rests heal, shops open, battles start. */
export function enterNode(run: RunState, nodeId: number, lang: "es" | "en"): RunState {
  if (!nextNodes(run).some((n) => n.id === nodeId)) throw new Error(`node ${nodeId} is not open`);
  const next = structuredClone(run);
  const node = next.map.nodes[nodeId]!;
  delete next.spoils;
  next.remarks = [];
  if (node.kind === "rest" || node.kind === "shop" || node.kind === "recruit" || node.kind === "quest") {
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
    } else if (node.kind === "shop") next.offers.push({ kind: "shop", stock: shopStock(next, nodeId) });
    else if (node.recruit) {
      const talk = TALKS[node.recruit]!;
      if (COMPANIONS[talk.companion] && !next.party.some((m) => m.id === talk.companion)) next.offers.push({ kind: "talk", id: node.recruit });
    } else if (node.quest) {
      const m = next.party.find((x) => x.id === node.quest);
      if (m && m.status === "with" && !m.lesson) next.offers.push({ kind: "quest", companion: m.id });
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
export function finishBattle(run: RunState, end: BattleState): RunState {
  const b = run.battle;
  if (!b || !end.winner) throw new Error("no finished battle");
  const next = structuredClone(run);
  delete next.battle;
  next.rivals = afterBattle(next.rivals, b.setup, b.commands, end);
  // The hero is the first unit of the setup; the battle can reorder its units, so look it up by id.
  const heroId = b.setup.units[0]!.id;
  const hero = end.units.find((u) => u.id === heroId)!;
  if (end.winner === "foes" || hero.life !== "up") { next.over = "lost"; next.heroHp = 0; return next; }
  const node = next.map.nodes[b.node]!;
  next.at = b.node; next.path.push(b.node);

  const beaten = end.units.filter((u) => u.team === "foes" && (u.life === "dead" || u.life === "downed"));
  const shards = node.kind === "boss" ? REWARD.bossShards : node.kind === "elite" ? REWARD.eliteShards
    : node.kind === "rival" && beaten.some((u) => u.rival) ? REWARD.rivalShards : 0;

  // Companions: the fallen are lost for the run; the rest carry their HP and react to what they saw.
  const deeds = readDeeds(b.setup, b.commands);
  if (shards > 0) deeds.shardsGained = 1;
  lean(next, { beacon: deeds.helpUp + deeds.letEscape + deeds.noneDowned, blaze: deeds.killFleeing + deeds.rivalBeaten + deeds.finishDowned });
  next.remarks = [];
  for (const m of fielded(next)) {
    const u = end.units.find((x) => x.id === m.id);
    if (!u) continue;
    if (u.life === "dead") { m.status = "fallen"; continue; }
    const max = memberMaxHp(next, m);
    m.hp = Math.min(max, Math.max(1, u.hp) + Math.round(max * Math.max(0, AFTER_WIN_HEAL + rulesOf(next).healBonus)));
    const { member, remarks } = react(m, deeds);
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
  const coins = Math.round(beaten.length * REWARD.coinsPerFoe * mult * rulesOf(next).coins);
  const xp = Math.round(beaten.length * REWARD.xpPerFoe * mult);
  next.coins += coins; next.shards += shards;
  const before = heroMaxHp(next);
  const grown = gainXp(next.hero, xp, `${next.seed}:${b.node}`);
  next.hero = grown.progress;
  next.spoils = { coins, xp, shards, levels: grown.levels };
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
    if (isLastRegion(next)) { next.over = "won"; next.offers = []; return next; }
    // On to the next region: a fresh map, the party and everything carried, and a breather.
    next.region = (next.region ?? 0) + 1;
    next.map = generateMap(regionSeed(next.seed, next.region), regionOf(next).recruits);
    next.at = null; next.path = [];
    next.heroHp = Math.min(heroMaxHp(next), next.heroHp + Math.round(heroMaxHp(next) * REGION_REST));
    for (const m of fielded(next)) m.hp = Math.min(memberMaxHp(next, m), m.hp + Math.round(memberMaxHp(next, m) * REGION_REST));
    for (const r of activeRivals(next.rivals)) placeRival(next.map, null, r.id, `${next.seed}:region:${next.region}:${r.id}`);
  }
  placeQuests(next);
  next.offers.push({ kind: "reward", options: rewardOptions(next, node) });
  offerJob(next);
  return next;
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
  const m = run.party.find((x) => x.id === companion);
  return m && readyForLesson(m) ? ["sacrifice", "hold", "double"] : ["hold", "double"];
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
    const lesson = questChoices(run, offer.companion)[index];
    if (!lesson) throw new Error("no such choice");
    const q = QUESTS[offer.companion]!, m = next.party.find((x) => x.id === offer.companion)!;
    m.lesson = lesson;
    (next.offers[0] as { reply?: Line }).reply = q.choices[lesson].reply;
    if (lesson === "double" && q.doubleLeaves) m.status = "left";
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
  const { amount, currency } = priceOf(itemId);
  if (run[currency] < amount) throw new Error(`not enough ${currency}`);
  const next = structuredClone(run);
  next[currency] -= amount;
  if (currency === "shards") witness(next, { spendShards: 1 });
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
