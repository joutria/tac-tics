/* Battle state and the commands that change it.
   Every change to a battle goes through `applyCommand`. It never mutates its input and uses only the seeded
   random number stored in the state, so the same setup + the same command list always gives the same battle.
   That is what saves (quit and resume anywhere) and co-op (players send commands) are built on.

   Turn order is a timeline: each unit has a time (ct) for its next turn; the lowest goes next. A full turn
   pushes a unit's time back by its delay (faster units, shorter delay). A turn that spends no AP (only moving,
   or nothing) costs 70% of the delay, so it comes back sooner. Wait passes the turn to act right after the next
   character. Guard ends the turn like a full action and readies a free hit on the first enemy that steps next to
   the unit before its next turn (the move goes on unless the hit downs it). */
import type { Passive } from "../data/jobs";
import { ABILITIES } from "../data/abilities";
import type { Element } from "../data/elements";
import { abilityAvailable, castProblem, guardAbility, hurt, resolveCast, type Hit } from "./combat";
import { absorb, removeStatus, statusOf, tickDown, POISON_HEAL_FACTOR, type Status, type StatusId } from "./status";
import { bodyGap, cellsOf, coversPos, GridMap, NEIGHBOURS, nearestCell, Pos, samePos, standable, tileAt } from "./grid";
import { routeTo } from "./movement";
import { actionCost, actionsFor, manaCost, RULES } from "./rules";
import { BIG_BODY } from "./sight";
import { rngNext, seedFrom } from "./rng";
import { fireUnder, sapUnder, shockNear, soak, updateTiles, type TerrainFx } from "./terrain";
import { canSwim, inWater, nativeSwimmer, SWIM_EXTRA_MP } from "./swim";
import { cowering, escapeStateFor, FLEE_LOCK, isBorder, turnMp, yielding, type EscapeState } from "./escape";

export type Team = "heroes" | "foes";
export type Facing = "N" | "E" | "S" | "W";
export const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];
export type AiKind = "caster" | "bruiser" | "skirmisher";
/** How boldly a computer-controlled foe plays, on top of its AiKind (see ai.ts TEMPERS). Rolled per battle from
    the seed when the spec has none, so every fight mixes rushers, flankers and the odd one that holds its ground. */
export type Temper = "bold" | "flanker" | "steady" | "wary";
/** The odds of each temper by AiKind, in TEMPERS order. Bosses (heavy) are always steady. */
export const TEMPER_ODDS: Record<AiKind, [Temper, number][]> = {
  bruiser: [["bold", 0.5], ["flanker", 0.25], ["steady", 0.2], ["wary", 0.05]],
  skirmisher: [["flanker", 0.5], ["bold", 0.2], ["steady", 0.2], ["wary", 0.1]],
  caster: [["steady", 0.5], ["flanker", 0.2], ["bold", 0.15], ["wary", 0.15]],
};
/** Ambushers strike first, but their opening turn has this share of their AP (one attack, not two). */
export const AMBUSH_OPENER_AP = 0.5;
/** "spared": knelt and left the fight when the party spared it (see escape.ts, yielding). */
export type Life = "up" | "downed" | "dead" | "escaped" | "spared";
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
  temper?: Temper;
  /** Savia-marked: may retreat or flee, and becomes a rival if it gets away. */
  marked?: boolean;
  /** A rival from an earlier battle (see src/run/rivals.ts). Only the screen reads it. */
  rival?: boolean;
  /** A companion's refusal: with low approval, it will not strike a fleeing foe. */
  refuses?: "fleeing";
  /** A job's passive (data/jobs.ts). */
  passive?: Passive;
  /** HP it starts the battle with, if lower than full (a run carries the hero's HP between battles). */
  hpNow?: number;
  /** Too heavy to shove (bosses). */
  heavy?: boolean;
  /** A giant: its body is size x size tiles, with `pos` the corner with the lowest x and y (see grid.ts cellsOf).
      Giants are hit from any side, block sight like a wall, take a stronger push to move, crush crates and
      trample tall grass as they walk. */
  size?: number;
  /** This character's own quick action (data/abilities.ts), on top of the shared ones. */
  quick?: string;
  /** A rival's learned habit: it goes for units that can heal first. */
  hunts?: "healer";
  /** Its mana pool under Move + Act (default RULES.mana.max), and extra mana it regains each turn. */
  mana?: number;
  regen?: number;
  /** Poison hurts this much less per turn (Moheda's research, finished). */
  poisonWard?: number;
}

export interface Unit extends UnitSpec {
  maxHp: number;
  maxAp: number;
  maxMp: number;
  /** Mana for spells ("act" and "pips" turn rules only, see rules.ts; always 0 under "ap"). */
  mana: number;
  maxMana: number;
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
  /** Aim was used: the next ranged ability reaches 1 further. */
  aiming?: boolean;
  /** Attacked this turn: tall grass does not hide it until its next turn. */
  revealed?: boolean;
  /** Guarding until its next turn, with this ability: the first enemy to step next to it takes a free hit. */
  guard?: string;
  /** Dipped in fire (burn) or Sap (poison): the next attack gives enemies it hits that status. */
  dipped?: false | "burn" | "poison";
  rooted: boolean;
  /** Timeline position of the next turn; ties go to the lower `seq`. */
  ct: number;
  seq: number;
  waited: boolean;
  spentAp: boolean;
  moved: boolean;
  statuses: Status[];
  /** Just lost a turn to a stun: cannot be stunned again until its next turn ends. */
  stunGuard?: boolean;
  /** Set only while a Guard's free hit resolves (it deals GUARD_STRIKE of the damage). */
  guardStrike?: boolean;
  /** An ambusher's first turn: it gets AMBUSH_OPENER_AP of its AP. */
  opener?: boolean;
  /** Set only while a held-back cast resolves: a hit that would down it leaves it at 1 HP instead. */
  held?: boolean;
}

export interface BattleSetup {
  seed: string | number;
  map: GridMap;
  units: UnitSpec[];
  /** The foes sprang an ambush: every foe takes its first turn before anyone in the party. */
  ambush?: boolean;
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
  /** Last round the Sap sources grew (terrain.ts). */
  sapRound?: number;
}

export type Command =
  | { t: "move"; unit: string; to: Pos }
  /** `hold`: Hold back. A hit that would down someone stops at 1 HP, and nobody downed is finished off. */
  | { t: "cast"; unit: string; ability: string; target: Pos; hold?: boolean }
  | { t: "wait"; unit: string }
  /** End the turn on Guard (see the top of this file). `face`: the way it turns before the turn ends (FFTA's Wait). */
  | { t: "guard"; unit: string; face?: Facing }
  | { t: "endTurn"; unit: string; face?: Facing }
  /** A retreating or fleeing unit on the edge of the map leaves the battle. */
  | { t: "escape"; unit: string }
  /** After a win: what the party does with a foe still on the map, downed or yielding. `unit` is that foe. */
  | { t: "settle"; unit: string; choice: "spare" | "finish" };

export type BattleEvent =
  | { e: "moved"; unit: string; path: Pos[] }
  | { e: "cast"; unit: string; ability: string; target: Pos; hits: Hit[]; fx: TerrainFx[] }
  /** Walked into fire, or started a turn in it. */
  | { e: "caughtFire"; unit: string }
  | { e: "waited"; unit: string }
  | { e: "turnStarted"; unit: string; round: number }
  | { e: "died"; unit: string }
  | { e: "escapeState"; unit: string; state: EscapeState }
  | { e: "escaped"; unit: string }
  /** Knelt and left: spared by the party, during the fight or after it. */
  | { e: "spared"; unit: string }
  | { e: "refused"; unit: string; target: Pos }
  /** A status acting at the start of a turn (Burn, Poison, Regen). */
  | { e: "tick"; unit: string; status: StatusId; damage: number; heal: number; downed: boolean; died: boolean }
  | { e: "stunned"; unit: string }
  | { e: "guarded"; unit: string }
  /** A guarding unit's free hit on `target`, which stepped next to it; a "cast" event with the hits follows. */
  | { e: "guardHit"; unit: string; target: string }
  /** Started a turn next to charged water and was stunned by it. */
  | { e: "shocked"; unit: string }
  /** Ended a move or started a turn in Sap: Poison for the party, Regen for foes. */
  | { e: "sapped"; unit: string; status: "poison" | "regen" }
  /** A giant walked over crates (crushed) and tall grass (flattened). */
  | { e: "trampled"; unit: string; crushed: Pos[]; flattened: Pos[] };

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
export const unitAt = (s: BattleState, p: Pos) => s.units.find((u) => onMap(u) && ((u.size ?? 1) <= 1 ? samePos(u.pos, p) : coversPos(u.pos, u.size!, p)));
/** Tiles per side of a unit's body: 1, or 2 for a giant. */
export const sizeOf = (u: { size?: number }) => u.size ?? 1;
/** Every tile a unit's body covers. */
export const cellsOfUnit = (u: Unit | UnitSpec) => cellsOf(u.pos, sizeOf(u));
/** Steps between two units' bodies: 1 = next to each other. */
export const unitGap = (a: { pos: Pos; size?: number }, b: { pos: Pos; size?: number }) => bodyGap(a.pos, sizeOf(a), b.pos, sizeOf(b));
/** The tile of `u` closest to `p` (its own tile, for a unit of one tile). */
export const nearestOf = (u: { pos: Pos; size?: number }, p: Pos) => nearestCell(u.pos, sizeOf(u), p);
export const isFoe = (a: Unit, b: Unit) => a.team !== b.team;
/** For line of sight: standing units in the way, apart from `ignore` and whoever is on `target`. A giant's body
    rises BIG_BODY levels (it blocks like a wall). */
export const bodiesInWay = (s: BattleState, ignore: string[], target: Pos) => {
  const at = unitAt(s, target)?.id;
  return (p: Pos): boolean | number => {
    const o = unitAt(s, p);
    if (!o || o.life !== "up" || o.id === at || ignore.includes(o.id)) return false;
    return sizeOf(o) > 1 ? BIG_BODY : true;
  };
};

export function lockAt(s: BattleState, mover: Unit, p: Pos): number {
  let n = 0;
  const size = sizeOf(mover), seen = new Set<string>();
  for (const c of cellsOf(p, size)) for (const d of NEIGHBOURS) {
    const q = { x: c.x + d.x, y: c.y + d.y };
    if (size > 1 && coversPos(p, size, q)) continue;
    const u = unitAt(s, q);
    // A giant touches the same foe along two tiles; it still pins only once.
    if (!u || u.life !== "up" || !isFoe(u, mover) || seen.has(u.id)) continue;
    seen.add(u.id);
    // A fleeing unit is pinned by every adjacent enemy, hard; otherwise only by enemies at least as agile.
    if (mover.escape === "flee") n += FLEE_LOCK; else if (u.agi >= mover.agi) n++;
  }
  return n;
}

export function moveRules(s: BattleState, u: Unit) {
  return {
    mp: u.mp, jump: u.jump, size: sizeOf(u),
    ...(canSwim(u) ? { swim: nativeSwimmer(u) ? 0 : SWIM_EXTRA_MP } : {}),
    blocked: (p: Pos) => { const o = unitAt(s, p); return !!o && o.id !== u.id; },
    // Oil: one extra MP to walk out of it.
    lockAt: (p: Pos) => lockAt(s, u, p) + (tileAt(s.map, p)?.surface === "oil" ? 1 : 0),
  };
}

export function createBattle(setup: BattleSetup): BattleState {
  const ids = new Set<string>();
  for (const u of setup.units) {
    if (ids.has(u.id)) throw new Error(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    for (const a of u.abilities) if (!ABILITIES[a]) throw new Error(`unit ${u.id} has unknown ability ${a}`);
    if (!cellsOf(u.pos, u.size ?? 1).every((p) => standable(tileAt(setup.map, p)))) throw new Error(`unit ${u.id} starts on a tile it cannot stand on`);
  }
  let rng = seedFrom(setup.seed);
  const rolls = new Map<string, number>();
  for (const u of setup.units) { const [v, next] = rngNext(rng); rolls.set(u.id, v); rng = next; }
  // First turns: half a delay in, so faster units start first; equal speeds are ordered by a seeded roll.
  const order = [...setup.units].sort((a, b) => b.speed - a.speed || rolls.get(b.id)! - rolls.get(a.id)!);
  const units: Unit[] = order.map((u, i) => ({
    ...structuredClone(u), hp: Math.max(1, Math.min(u.hp, u.hpNow ?? u.hp)), maxHp: u.hp, maxAp: actionsFor(u), ap: actionsFor(u), maxMp: u.mp, maxMana: RULES.mode === "ap" ? 0 : u.mana ?? RULES.mana.max, mana: RULES.mode === "ap" ? 0 : Math.round((u.mana ?? RULES.mana.max) * RULES.mana.start), facing: u.team === "heroes" ? "S" : "N",
    life: "up", downedTurns: 0, baseHp: u.hp, revives: 0, downs: 0, escape: "none", cooldowns: {}, usedThisTurn: {}, rooted: false, statuses: [],
    ct: setup.ambush && u.team === "foes" ? i : Math.round(delayFor(u.speed) / 2) + (setup.ambush ? order.length : 0), seq: i, waited: false, spentAp: false, moved: false,
    ...(u.team === "foes" && !u.temper ? { temper: rollTemper(setup.seed, u) } : {}),
    ...(setup.ambush && u.team === "foes" ? { opener: true } : {}),
  }));
  const s: BattleState = {
    version: 2, rng, map: structuredClone(setup.map), units, clock: 0, seqCounter: units.length,
    active: "", turns: 0, winner: null, habits: { ranged: 0, melee: 0, elements: {} },
  };
  // A giant flattens the grass it starts on.
  for (const u of s.units) if (sizeOf(u) > 1) trample(s, u, []);
  advance(s, []);
  return s;
}

function rollTemper(seed: string | number, u: UnitSpec): Temper {
  if (u.heavy) return "steady";
  const [v] = rngNext(seedFrom(`${seed}:temper:${u.id}`));
  let acc = 0;
  for (const [t, p] of TEMPER_ODDS[u.ai ?? "skirmisher"]) { acc += p; if (v < acc) return t; }
  return "steady";
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
    delete u.guard; delete u.revealed;
    updateTiles(s);
    if (u.life === "downed") {
      u.downedTurns -= 1;
      if (u.downedTurns <= 0) { u.life = "dead"; events.push({ e: "died", unit: u.id }); s.winner = winnerOf(s); continue; }
      u.ct += delayFor(u.speed); u.seq = ++s.seqCounter;
      continue;
    }
    if (!u.waited) {
      if (shockNear(s, u)) events.push({ e: "shocked", unit: u.id });
      if (statusOf(u, "stun")) {
        removeStatus(u, "stun"); u.stunGuard = true;
        events.push({ e: "stunned", unit: u.id });
        u.ct += delayFor(u.speed); u.seq = ++s.seqCounter;
        continue;
      }
      soak(s, u);
      if (fireUnder(s, u)) events.push({ e: "caughtFire", unit: u.id });
      const sap = sapUnder(s, u);
      if (sap) events.push({ e: "sapped", unit: u.id, status: sap });
      if (startOfTurnTicks(s, u, events)) { s.winner = winnerOf(s); u.ct += delayFor(u.speed); u.seq = ++s.seqCounter; continue; }
      u.ap = u.opener ? Math.ceil(u.maxAp * AMBUSH_OPENER_AP) : u.maxAp;
      delete u.opener;
      u.mana = Math.min(u.maxMana, u.mana + (u.maxMana ? RULES.mana.regen + (u.regen ?? 0) : 0));
      u.mp = Math.max(0, turnMp(u) - (statusOf(u, "slow")?.power ?? 0));
      u.rooted = false;
      u.usedThisTurn = {};
      u.aiming = false; u.dipped = false;
      u.spentAp = false;
      u.moved = false;
    }
    s.turns += 1;
    events.push({ e: "turnStarted", unit: u.id, round: roundOf(s) });
    return;
  }
}

/** Regen, then Burn and Poison, at the start of a unit's turn. True when they knock it out (its turn is lost). */
function startOfTurnTicks(s: BattleState, u: Unit, events: BattleEvent[]): boolean {
  for (const id of ["regen", "burn", "poison"] as const) {
    const st = statusOf(u, id);
    if (!st || u.life !== "up") continue;
    const ev = { e: "tick" as const, unit: u.id, status: id, damage: 0, heal: 0, downed: false, died: false };
    if (id === "regen") {
      const amount = statusOf(u, "poison") ? Math.floor(st.power * POISON_HEAL_FACTOR) : st.power;
      ev.heal = Math.min(amount, u.maxHp - u.hp); u.hp += ev.heal;
    } else {
      ev.damage = absorb(u, id === "poison" ? Math.max(0, st.power - (u.poisonWard ?? 0)) : st.power);
      hurt(u, ev.damage, ev);
    }
    events.push(ev);
    if (ev.died) events.push({ e: "died", unit: u.id });
  }
  return u.life !== "up";
}

function facingOf(from: Pos, to: Pos): Facing {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

/** Foes the party can still spare or finish after winning: downed, or yielding and still standing. */
export const unsettled = (s: BattleState) =>
  s.winner === "heroes" ? s.units.filter((u) => u.team === "foes" && (u.life === "downed" || yielding(u))) : [];

export function applyCommand(prev: BattleState, cmd: Command): Result {
  if (cmd.t === "settle") {
    const s = structuredClone(prev);
    const u = unsettled(s).find((x) => x.id === cmd.unit);
    if (!u) return { ok: false, error: "only a downed or yielding foe can be settled, after a win" };
    u.life = cmd.choice === "spare" ? "spared" : "dead";
    return { ok: true, state: s, events: [cmd.choice === "spare" ? { e: "spared", unit: u.id } : { e: "died", unit: u.id }] };
  }
  if (prev.winner) return { ok: false, error: "battle is over" };
  const s = structuredClone(prev);
  const actor = activeUnit(s);
  if (cmd.unit !== actor.id) return { ok: false, error: `it is ${actor.id}'s turn, not ${cmd.unit}'s` };
  const events: BattleEvent[] = [];

  switch (cmd.t) {
    case "move": {
      const route = routeTo(s.map, actor.pos, cmd.to, moveRules(s, actor));
      if (!route) return { ok: false, error: "cannot reach that tile" };
      // Walk it step by step: stepping next to a guarding enemy draws its free hit, and a hit that downs the
      // walker ends the walk there.
      const walked: Pos[] = [], after: BattleEvent[] = [];
      let prevPos = actor.pos;
      for (const step of route.path) {
        walked.push(step);
        actor.facing = facingOf(prevPos, step);
        const was = actor.pos;
        actor.pos = { ...step };
        prevPos = step;
        if (sizeOf(actor) > 1) trample(s, actor, after);
        guardHits(s, actor, was, after);
        if (actor.life !== "up") break;
      }
      actor.mp -= route.cost;
      actor.moved = true;
      events.push({ e: "moved", unit: actor.id, path: walked }, ...after);
      s.winner = winnerOf(s);
      if (actor.life !== "up") return applyEnd(s, actor, events);
      soak(s, actor);
      if (fireUnder(s, actor)) events.push({ e: "caughtFire", unit: actor.id });
      const sap = sapUnder(s, actor);
      if (sap) events.push({ e: "sapped", unit: actor.id, status: sap });
      break;
    }
    case "cast": {
      const problem = castProblem(s, actor, cmd.ability, cmd.target);
      if (problem) return { ok: false, error: problem };
      const ab = ABILITIES[cmd.ability]!;
      // A companion who has fallen out with the player will not strike a fleeing foe: the order is refused and
      // the rest of their turn is lost (plan doc, "Companion values").
      const victim = unitAt(s, cmd.target);
      if (actor.refuses === "fleeing" && ab.damage && victim && isFoe(actor, victim) && victim.escape === "flee") {
        const r = applyCommand(prev, { t: "endTurn", unit: actor.id });
        if (!r.ok) return r;
        return { ok: true, state: r.state, events: [{ e: "refused", unit: actor.id, target: cmd.target }, ...r.events] };
      }
      const origin = nearestOf(actor, cmd.target);
      if (!samePos(cmd.target, origin)) actor.facing = facingOf(origin, cmd.target);
      const fx: TerrainFx[] = [];
      const hits = resolveCast(s, actor, ab, cmd.target, fx, !!cmd.hold);
      actor.ap -= actionCost(ab);
      actor.mana -= manaCost(ab);
      // A quick action is free: it does not count as spending AP, so a turn of moving plus a quick action still
      // comes back sooner. It does count as acting, so Wait is gone after it.
      if (!ab.quick) actor.spentAp = true;
      if (ab.damage || ab.push) actor.revealed = true;
      actor.usedThisTurn[ab.id] = (actor.usedThisTurn[ab.id] ?? 0) + 1;
      if (ab.quick) actor.usedThisTurn.quick = 1;
      if (ab.cooldown > 0 && RULES.cooldowns) actor.cooldowns[ab.id] = ab.cooldown + 1;
      if (actor.team === "heroes" && (ab.damage || ab.root || ab.push)) {
        const dist = Math.abs(cmd.target.x - origin.x) + Math.abs(cmd.target.y - origin.y);
        if (dist <= 1) s.habits.melee++; else s.habits.ranged++;
        s.habits.elements[ab.element] = (s.habits.elements[ab.element] ?? 0) + 1;
      }
      events.push({ e: "cast", unit: actor.id, ability: ab.id, target: cmd.target, hits, fx });
      for (const h of hits) if (h.died) events.push({ e: "died", unit: h.unit });
      for (const h of hits) if (h.spared) events.push({ e: "spared", unit: h.unit });
      s.winner = winnerOf(s);
      break;
    }
    case "wait": {
      if (actor.spentAp || actor.moved || actor.waited || actor.usedThisTurn.quick) return { ok: false, error: "can only wait before moving or acting, once per turn" };
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
    case "guard": {
      const id = guardAbility(actor);
      if (actor.escape !== "none" || !id) return { ok: false, error: "needs AP left for an attack that reaches next to you" };
      if (inWater(s.map, actor) && !nativeSwimmer(actor)) return { ok: false, error: "no footing while swimming" };
      if (cmd.face && !FACINGS.includes(cmd.face)) return { ok: false, error: "face N, E, S or W" };
      actor.guard = id;
      actor.spentAp = true;
      if (cmd.face) actor.facing = cmd.face;
      events.push({ e: "guarded", unit: actor.id });
      return applyEnd(s, actor, events);
    }
    case "endTurn": {
      if (cmd.face && !FACINGS.includes(cmd.face)) return { ok: false, error: "face N, E, S or W" };
      if (cmd.face) actor.facing = cmd.face;
      return applyEnd(s, actor, events);
    }
  }
  updateEscapes(s, events);
  s.winner = winnerOf(s);
  return { ok: true, state: s, events };
}

/** A giant's body on the ground: crates under it are crushed and tall grass is trampled flat. */
function trample(s: BattleState, giant: Unit, events: BattleEvent[]) {
  const crushed: Pos[] = [], flattened: Pos[] = [];
  for (const p of cellsOfUnit(giant)) {
    const t = tileAt(s.map, p);
    if (!t) continue;
    if (t.prop === "crate") { delete t.prop; delete t.propHp; crushed.push(p); }
    if (t.terrain === "tallgrass") { t.terrain = "grass"; flattened.push(p); }
  }
  if (crushed.length || flattened.length) events.push({ e: "trampled", unit: giant.id, crushed, flattened });
}

/** Enemies on Guard that `mover` just stepped next to (from `was`) strike it, each once. */
function guardHits(s: BattleState, mover: Unit, was: Pos, events: BattleEvent[]) {
  for (const g of s.units) {
    if (!g.guard || g.life !== "up" || !isFoe(g, mover) || statusOf(g, "stun") || mover.life !== "up") continue;
    const near = (p: Pos) => bodyGap(p, sizeOf(mover), g.pos, sizeOf(g)) === 1;
    if (!near(mover.pos) || near(was)) continue;
    const ab = ABILITIES[g.guard]!;
    delete g.guard;
    const at = nearestOf(mover, nearestOf(g, mover.pos));
    g.facing = facingOf(g.pos, at);
    const fx: TerrainFx[] = [];
    g.guardStrike = true;
    let hits: Hit[];
    try { hits = resolveCast(s, g, ab, { ...at }, fx); } finally { delete g.guardStrike; }
    events.push({ e: "guardHit", unit: g.id, target: mover.id }, { e: "cast", unit: g.id, ability: ab.id, target: { ...at }, hits, fx });
    for (const h of hits) if (h.died) events.push({ e: "died", unit: h.unit });
  }
}

function applyEnd(s: BattleState, actor: Unit, events: BattleEvent[]): Result {
  const delay = delayFor(actor.speed);
  actor.ct += actor.spentAp ? delay : Math.round(delay * MOVE_ONLY_FACTOR);
  actor.seq = ++s.seqCounter;
  actor.waited = false;
  actor.stunGuard = false;
  tickDown(actor);
  for (const k of Object.keys(actor.cooldowns)) {
    actor.cooldowns[k] = Math.max(0, actor.cooldowns[k]! - 1);
    if (!actor.cooldowns[k]) delete actor.cooldowns[k];
  }
  advance(s, events);
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

/** A side with nobody standing loses. Foes who yield without running (cowering) no longer count: once only they
    are left, the party has won, and it decides what to do with them (see `unsettled`). */
function winnerOf(s: BattleState): Team | null {
  const standing = (t: Team) => s.units.some((u) => u.team === t && u.life === "up" && !cowering(u));
  if (!standing("heroes")) return "foes";
  if (!standing("foes")) return "heroes";
  return null;
}
