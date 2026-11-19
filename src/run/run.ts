/* A run: one trip through a region's map with the hero, from the first node to the boss.
   The run ends when the hero falls for good (plan doc gap 10) or when the boss is beaten.

   Like a battle, a run is deterministic: the map, every battle's seed and foes, and every rival come from the
   run seed and what happened in earlier battles. The run save keeps the current battle's own save inside it. */
import { ARENAS, BOSS, DEPTH_HP, DEPTH_STAT, HERO, SPECIES, type Species } from "../data/region";
import { rngInt, seedFrom } from "../engine/rng";
import type { BattleSave } from "../engine/save";
import type { BattleSetup, BattleState, UnitSpec } from "../engine/state";
import { aheadOf, choices, generateMap, placeRival, type RunMap, type RunNode } from "./map";
import { activeRivals, afterBattle, rivalSpec, type Rival } from "./rivals";

export const RUN_VERSION = 1;
/** Share of max HP a rest node gives back. */
export const REST_HEAL = 0.4;
/** Share of max HP the hero gets back after winning a battle. */
export const AFTER_WIN_HEAL = 0.3;

export interface RunState {
  version: number;
  seed: string;
  map: RunMap;
  /** Last node finished; null before the first one. */
  at: number | null;
  /** Nodes finished, in order. */
  path: number[];
  /** The hero's HP between battles (a battle starts with it; the revive scars last one battle only). */
  heroHp: number;
  rivals: Rival[];
  /** The battle being fought, if any. */
  battle?: BattleSave & { node: number };
  over: null | "won" | "lost";
}

export function newRun(seed: string): RunState {
  return { version: RUN_VERSION, seed, map: generateMap(seed), at: null, path: [], heroHp: HERO.hp, rivals: [], over: null };
}

export const nextNodes = (run: RunState): RunNode[] => (run.over ? [] : choices(run.map, run.at));

/** Which arena a node uses: picked from the seed so revisiting the save gives the same one. */
function arenaFor(run: RunState, node: RunNode) {
  const [i] = rngInt(seedFrom(`${run.seed}:arena:${node.id}`), 0, ARENAS.length - 1);
  return ARENAS[i]!;
}

function foeSpec(sp: Species, id: string, pos: UnitSpec["pos"], layer: number): UnitSpec {
  return {
    ...structuredClone(sp), id, pos: { ...pos },
    hp: Math.round(sp.hp * (1 + DEPTH_HP * layer)), str: sp.str + DEPTH_STAT * layer, mag: sp.mag + DEPTH_STAT * layer,
  };
}

/** The battle a node holds. Plain battles field 2 or 3 foes, elites 4, the boss one swollen foe plus 2. */
export function battleSetup(run: RunState, nodeId: number, lang: "es" | "en"): BattleSetup {
  const node = run.map.nodes[nodeId]!;
  const arena = arenaFor(run, node);
  let rng = seedFrom(`${run.seed}:foes:${node.id}`);
  const pick = () => { let i: number; [i, rng] = rngInt(rng, 0, SPECIES.length - 1); return SPECIES[i]!; };
  // The first two layers stay at two foes while the party finds its feet.
  let count: number; [count, rng] = rngInt(rng, 2, node.layer < 2 ? 2 : 3);
  if (node.kind === "elite") count = 4;
  if (node.kind === "boss") count = 3;
  const units: UnitSpec[] = [{ ...structuredClone(HERO), pos: { ...arena.hero }, hpNow: run.heroHp }];
  for (let i = 0; i < count; i++) {
    const pos = arena.foes[i]!;
    const id = `n${node.id}-${i}`;
    const rival = i === 0 && node.rival ? run.rivals.find((r) => r.id === node.rival && !r.settled) : undefined;
    if (rival) { units.push({ ...rivalSpec(rival, lang, pos) }); continue; }
    if (node.kind === "boss" && i === 0) {
      const sp = SPECIES[BOSS.species]!;
      const f = foeSpec(sp, id, pos, node.layer);
      units.push({ ...f, name: BOSS.name[lang].replace("{name}", sp.name), hp: Math.round(f.hp * BOSS.hp), str: f.str + BOSS.stat, mag: f.mag + BOSS.stat, mp: f.mp + BOSS.mp });
      continue;
    }
    units.push(foeSpec(pick(), id, pos, node.layer));
  }
  return { seed: `${run.seed}:battle:${node.id}`, map: arena.map, units };
}

/** Starts the battle on a node the player can go to. */
export function enterNode(run: RunState, nodeId: number, lang: "es" | "en"): RunState {
  if (!nextNodes(run).some((n) => n.id === nodeId)) throw new Error(`node ${nodeId} is not open`);
  const next = structuredClone(run);
  const node = next.map.nodes[nodeId]!;
  if (node.kind === "rest") {
    next.heroHp = Math.min(HERO.hp, next.heroHp + Math.round(HERO.hp * REST_HEAL));
    next.at = nodeId; next.path.push(nodeId);
    return next;
  }
  next.battle = { version: 2, setup: battleSetup(next, nodeId, lang), commands: [], rewindsUsed: 0, node: nodeId };
  return next;
}

/** Closes the current battle: HP carries on, rivals learn or are settled, new rivals take a node ahead. */
export function finishBattle(run: RunState, end: BattleState): RunState {
  const b = run.battle;
  if (!b || !end.winner) throw new Error("no finished battle");
  const next = structuredClone(run);
  delete next.battle;
  next.rivals = afterBattle(next.rivals, b.setup, b.commands, end);
  const hero = end.units.find((u) => u.team === "heroes")!;
  if (end.winner === "foes" || hero.life !== "up") { next.over = "lost"; next.heroHp = 0; return next; }
  // Catching your breath after a win gives a little back.
  next.heroHp = Math.min(HERO.hp, hero.hp + Math.round(HERO.hp * AFTER_WIN_HEAL));
  next.at = b.node; next.path.push(b.node);
  // Rivals wait on a node ahead. One that got away again, or whose node the party can no longer reach,
  // moves to a new one; a new rival takes its first.
  const ahead = aheadOf(next.map, next.at);
  for (const r of activeRivals(next.rivals)) {
    const node = next.map.nodes.find((n) => n.rival === r.id);
    if (node && ahead.has(node.id)) continue;
    if (node) { node.rival = undefined; if (node.id !== b.node) node.kind = "battle"; }
    placeRival(next.map, next.at, r.id, `${next.seed}:${next.path.length}`);
  }
  if (next.map.nodes[b.node]!.kind === "boss") next.over = "won";
  return next;
}
