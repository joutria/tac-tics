/* Battle state and the commands that change it.
   Every change to a battle goes through `applyCommand`. It never mutates its input and uses only the seeded
   random number stored in the state, so the same setup + the same command list always gives the same battle.
   That is what saves (quit and resume anywhere) and co-op (players send commands) are built on.

   Turn order is a timeline: each unit has a time (ct) for its next turn; the lowest goes next. A full turn
   pushes a unit's time back by its delay (faster units, shorter delay). A turn that spends no AP (only moving,
   or nothing) costs 70% of the delay, so it comes back sooner. Wait passes the turn to act right after the next
   character. */
import { ABILITIES } from "../data/abilities";
import type { Element } from "../data/elements";
import { abilityAvailable, castProblem, resolveCast, type Hit } from "./combat";
import { GridMap, NEIGHBOURS, Pos, samePos, tileAt, TERRAIN } from "./grid";
import { routeTo } from "./movement";
import { rngNext, seedFrom } from "./rng";
import { escapeStateFor, FLEE_LOCK, isBorder, turnMp, type EscapeState } from "./escape";

export type Team = "heroes" | "foes";
export type Facing = "N" | "E" | "S" | "W";
export type AiKind = "caster" | "bruiser" | "skirmisher";
export type Life = "up" | "downed" | "dead" | "escaped";
/** Still on the battlefield (standing or downed). */
export const onMap = (u: { life: Life }) => u.life === "up" || u.life === "downed";

export interface UnitSpec {
  id: string;
  name: string;
  team: Team;
  element: Element;
  /** Sprite key for the renderer. */
  look: string;
  pos: Pos;
  hp: number;
  ap: number;
  mp: number;
  speed: number;
  jump: number;
  str: number;
  mag: number;
  /** Agility: escapes Lock and pins slower foes. */
  agi: number;
  /** Resistance in % per element. */
  res: Partial<Record<Element, number>>;
  abilities: string[];
  /** How a computer-controlled unit plays. */
  ai?: AiKind;
  /** Savia-marked: may retreat or flee, and becomes a rival if it gets away. */
  marked?: boolean;
  /** A rival from an earlier battle (see src/run/rivals.ts). Only the screen reads it. */
  rival?: boolean;
  /** HP it starts the battle with, if lower than full (a run carries the hero's HP between battles). */
  hpNow?: number;
  /** A rival's learned habit: it goes for units that can heal first. */
  hunts?: "healer";
}

export interface Unit extends UnitSpec {
  maxHp: number;
  maxAp: number;
  maxMp: number;
  facing: Facing;
  life: Life;
  /** Own turns left before a downed unit dies. */
  downedTurns: number;
  /** Max HP at the start of the battle; each Help up takes a slice of it away for the rest of the battle. */
  baseHp: number;
  /** Times this unit has been helped up this battle. After the last one allowed, its next fall is for good. */
  revives: number;
  /** Enemies this unit has downed or killed this battle (a retreat needs at least one). */
  downs: number;
  escape: EscapeState;
  /** Turns of cooldown left per ability (counts down at the end of the unit's own turns). */
  cooldowns: Record<string, number>;
  usedThisTurn: Record<string, number>;
  rooted: boolean;
  /** Timeline position of the next turn; ties go to the lower `seq`. */
  ct: number;
  seq: number;
  waited: boolean;
  spentAp: boolean;
  moved: boolean;
}

export interface BattleSetup {
  seed: string | number;
  map: GridMap;
  units: UnitSpec[];
}

export interface BattleState {
  version: 2;
  rng: number;
  map: GridMap;
  units: Unit[];
  /** Timeline time of the current turn. */
  clock: number;
  seqCounter: number;
  active: string;
  /** Turns taken so far, all units together. */
  turns: number;
  winner: Team | null;
  /** What the players have been doing, so foes can adapt within the fight. */
  habits: { ranged: number; melee: number; elements: Partial<Record<Element, number>> };
}

export type Command =
  | { t: "move"; unit: string; to: Pos }
  | { t: "cast"; unit: string; ability: string; target: Pos }
  | { t: "wait"; unit: string }
  | { t: "endTurn"; unit: string }
  /** A retreating or fleeing unit on the edge of the map leaves the battle. */
  | { t: "escape"; unit: string };

export type BattleEvent =
  | { e: "moved"; unit: string; path: Pos[] }
  | { e: "cast"; unit: string; ability: string; target: Pos; hits: Hit[] }
  | { e: "waited"; unit: string }
  | { e: "turnStarted"; unit: string; round: number }
  | { e: "died"; unit: string }
  | { e: "escapeState"; unit: string; state: EscapeState }
  | { e: "escaped"; unit: string };

export type Result =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; error: string };

/** Ticks between two full turns: speed 50 acts every 100 ticks. */
export const delayFor = (speed: number) => Math.round((100 * 50) / Math.max(1, speed));
export const MOVE_ONLY_FACTOR = 0.7;
export const roundOf = (s: BattleState) => Math.floor(s.clock / 100) + 1;

export const unitById = (s: BattleState, id: string) => s.units.find((u) => u.id === id)!;
export const activeUnit = (s: BattleState): Unit => unitById(s, s.active);
/** The unit on a tile, standing or downed (bodies block the tile). */
export const unitAt = (s: BattleState, p: Pos) => s.units.find((u) => onMap(u) && samePos(u.pos, p));
export const isFoe = (a: Unit, b: Unit) => a.team !== b.team;

export function lockAt(s: BattleState, mover: Unit, p: Pos): number {
  let n = 0;
  for (const d of NEIGHBOURS) {
    const u = unitAt(s, { x: p.x + d.x, y: p.y + d.y });
    if (!u || u.life !== "up" || !isFoe(u, mover)) continue;
    // A fleeing unit is pinned by every adjacent enemy, hard; otherwise only by enemies at least as agile.
    if (mover.escape === "flee") n += FLEE_LOCK; else if (u.agi >= mover.agi) n++;
  }
  return n;
}

export function moveRules(s: BattleState, u: Unit) {
  return {
    mp: u.mp, jump: u.jump,
    blocked: (p: Pos) => { const o = unitAt(s, p); return !!o && o.id !== u.id; },
    lockAt: (p: Pos) => lockAt(s, u, p),
  };
}

export function createBattle(setup: BattleSetup): BattleState {
  const ids = new Set<string>();
  for (const u of setup.units) {
    if (ids.has(u.id)) throw new Error(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    for (const a of u.abilities) if (!ABILITIES[a]) throw new Error(`unit ${u.id} has unknown ability ${a}`);
    const tile = tileAt(setup.map, u.pos);
    if (!tile || !TERRAIN[tile.terrain].walkable) throw new Error(`unit ${u.id} starts on a tile it cannot stand on`);
  }
  let rng = seedFrom(setup.seed);
  const rolls = new Map<string, number>();
  for (const u of setup.units) { const [v, next] = rngNext(rng); rolls.set(u.id, v); rng = next; }
  // First turns: half a delay in, so faster units start first; equal speeds are ordered by a seeded roll.
  const order = [...setup.units].sort((a, b) => b.speed - a.speed || rolls.get(b.id)! - rolls.get(a.id)!);
  const units: Unit[] = order.map((u, i) => ({
    ...structuredClone(u), hp: Math.max(1, Math.min(u.hp, u.hpNow ?? u.hp)), maxHp: u.hp, maxAp: u.ap, maxMp: u.mp, facing: u.team === "heroes" ? "S" : "N",
    life: "up", downedTurns: 0, baseHp: u.hp, revives: 0, downs: 0, escape: "none", cooldowns: {}, usedThisTurn: {}, rooted: false,
    ct: Math.round(delayFor(u.speed) / 2), seq: i, waited: false, spentAp: false, moved: false,
  }));
  const s: BattleState = {
    version: 2, rng, map: structuredClone(setup.map), units, clock: 0, seqCounter: units.length,
    active: "", turns: 0, winner: null, habits: { ranged: 0, melee: 0, elements: {} },
  };
  advance(s, []);
  return s;
}

/** The order of the next `count` turns, for the turn bar. */
export function upcomingTurns(s: BattleState, count: number): string[] {
  const sim = s.units.filter(onMap).map((u) => ({ id: u.id, ct: u.ct, seq: u.seq, d: delayFor(u.speed) }));
  const out: string[] = [];
  let seq = s.seqCounter;
  while (out.length < count && sim.length) {
    sim.sort((a, b) => a.ct - b.ct || a.seq - b.seq);
    const n = sim[0]!;
    out.push(n.id);
    n.ct += n.d; n.seq = ++seq;
  }
  return out;
}

function nextInLine(s: BattleState, exclude?: string): Unit | undefined {
  return s.units.filter((u) => onMap(u) && u.id !== exclude).sort((a, b) => a.ct - b.ct || a.seq - b.seq)[0];
}

/** Starts the next turn. Downed units spend their turns counting down instead of acting. */
function advance(s: BattleState, events: BattleEvent[]) {
  for (let guard = 0; guard < 1000 && !s.winner; guard++) {
    const u = nextInLine(s);
    if (!u) return;
    s.clock = u.ct;
    s.active = u.id;
    if (u.life === "downed") {
      u.downedTurns -= 1;
      if (u.downedTurns <= 0) { u.life = "dead"; events.push({ e: "died", unit: u.id }); s.winner = winnerOf(s); continue; }
      u.ct += delayFor(u.speed); u.seq = ++s.seqCounter;
      continue;
    }
    if (!u.waited) {
      u.ap = u.maxAp;
      u.mp = turnMp(u);
      u.rooted = false;
      u.usedThisTurn = {};
      u.spentAp = false;
      u.moved = false;
    }
    s.turns += 1;
    events.push({ e: "turnStarted", unit: u.id, round: roundOf(s) });
    return;
  }
}

function facingOf(from: Pos, to: Pos): Facing {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

export function applyCommand(prev: BattleState, cmd: Command): Result {
  if (prev.winner) return { ok: false, error: "battle is over" };
  const s = structuredClone(prev);
  const actor = activeUnit(s);
  if (cmd.unit !== actor.id) return { ok: false, error: `it is ${actor.id}'s turn, not ${cmd.unit}'s` };
  const events: BattleEvent[] = [];

  switch (cmd.t) {
    case "move": {
      const route = routeTo(s.map, actor.pos, cmd.to, moveRules(s, actor));
      if (!route) return { ok: false, error: "cannot reach that tile" };
      const last = route.path[route.path.length - 1]!, before = route.path[route.path.length - 2] ?? actor.pos;
      actor.facing = facingOf(before, last);
      actor.pos = { ...last };
      actor.mp -= route.cost;
      actor.moved = true;
      events.push({ e: "moved", unit: actor.id, path: route.path });
      break;
    }
    case "cast": {
      const problem = castProblem(s, actor, cmd.ability, cmd.target);
      if (problem) return { ok: false, error: problem };
      const ab = ABILITIES[cmd.ability]!;
      if (!samePos(cmd.target, actor.pos)) actor.facing = facingOf(actor.pos, cmd.target);
      const hits = resolveCast(s, actor, ab, cmd.target);
      actor.ap -= ab.ap;
      actor.spentAp = true;
      actor.usedThisTurn[ab.id] = (actor.usedThisTurn[ab.id] ?? 0) + 1;
      if (ab.cooldown > 0) actor.cooldowns[ab.id] = ab.cooldown + 1;
      if (actor.team === "heroes" && (ab.damage || ab.root || ab.push)) {
        const dist = Math.abs(cmd.target.x - actor.pos.x) + Math.abs(cmd.target.y - actor.pos.y);
        if (dist <= 1) s.habits.melee++; else s.habits.ranged++;
        s.habits.elements[ab.element] = (s.habits.elements[ab.element] ?? 0) + 1;
      }
      events.push({ e: "cast", unit: actor.id, ability: ab.id, target: cmd.target, hits });
      for (const h of hits) if (h.died) events.push({ e: "died", unit: h.unit });
      s.winner = winnerOf(s);
      break;
    }
    case "wait": {
      if (actor.spentAp || actor.moved || actor.waited) return { ok: false, error: "can only wait before moving or acting, once per turn" };
      const next = nextInLine(s, actor.id);
      if (!next) return { ok: false, error: "nobody to wait for" };
      actor.ct = next.ct;
      actor.seq = ++s.seqCounter;
      actor.waited = true;
      events.push({ e: "waited", unit: actor.id });
      advance(s, events);
      break;
    }
    case "escape": {
      if (actor.escape === "none") return { ok: false, error: "only a retreating or fleeing unit can escape" };
      // It has to reach the edge first and leave on a later turn, which gives the player one turn to stop it.
      if (!isBorder(s, actor.pos) || actor.moved) return { ok: false, error: "escape from a tile on the edge of the map, at the start of a turn" };
      actor.life = "escaped";
      events.push({ e: "escaped", unit: actor.id });
      advance(s, events);
      break;
    }
    case "endTurn": {
      const delay = delayFor(actor.speed);
      actor.ct += actor.spentAp ? delay : Math.round(delay * MOVE_ONLY_FACTOR);
      actor.seq = ++s.seqCounter;
      actor.waited = false;
      for (const k of Object.keys(actor.cooldowns)) {
        actor.cooldowns[k] = Math.max(0, actor.cooldowns[k]! - 1);
        if (!actor.cooldowns[k]) delete actor.cooldowns[k];
      }
      advance(s, events);
      break;
    }
  }
  updateEscapes(s, events);
  s.winner = winnerOf(s);
  return { ok: true, state: s, events };
}

export { abilityAvailable };

/** After every command: marked foes that crossed a line change state (and the screen is told). */
function updateEscapes(s: BattleState, events: BattleEvent[]) {
  const round = roundOf(s);
  for (const u of s.units) {
    const next = escapeStateFor(s, u, round);
    if (next === u.escape) continue;
    u.escape = next;
    events.push({ e: "escapeState", unit: u.id, state: next });
  }
}

function winnerOf(s: BattleState): Team | null {
  const standing = (t: Team) => s.units.some((u) => u.team === t && u.life === "up");
  if (!standing("heroes")) return "foes";
  if (!standing("foes")) return "heroes";
  return null;
}
