/* Battle state and the commands that change it.
   Every change to a battle goes through `applyCommand`. It never mutates its input and uses only the seeded
   random number stored in the state, so the same setup + the same command list always gives the same battle.
   That is what saves (quit and resume anywhere) and co-op (players send commands) are built on. */
import type { Element } from "../data/elements";
import { GridMap, Pos, samePos, tileAt, TERRAIN } from "./grid";
import { pathTo } from "./movement";
import { rngNext, seedFrom } from "./rng";

export type Team = "heroes" | "foes";
export type Facing = "N" | "E" | "S" | "W";

export interface UnitSpec {
  id: string;
  name: string;
  team: Team;
  element: Element;
  /** Sprite or portrait key for the renderer. */
  look: string;
  pos: Pos;
  hp: number;
  ap: number;
  mp: number;
  speed: number;
  jump: number;
}

export interface Unit extends UnitSpec {
  maxHp: number;
  maxAp: number;
  maxMp: number;
  facing: Facing;
}

export interface BattleSetup {
  seed: string | number;
  map: GridMap;
  units: UnitSpec[];
}

export interface BattleState {
  version: 1;
  rng: number;
  map: GridMap;
  units: Unit[];
  /** Unit ids in initiative order. */
  order: string[];
  /** Index into `order` of the unit whose turn it is. */
  turn: number;
  round: number;
  winner: Team | null;
}

export type Command =
  | { t: "move"; unit: string; to: Pos }
  | { t: "face"; unit: string; dir: Facing }
  | { t: "endTurn"; unit: string };

export type BattleEvent =
  | { e: "moved"; unit: string; path: Pos[] }
  | { e: "faced"; unit: string; dir: Facing }
  | { e: "turnStarted"; unit: string; round: number };

export type Result =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; error: string };

export function createBattle(setup: BattleSetup): BattleState {
  const ids = new Set<string>();
  for (const u of setup.units) {
    if (ids.has(u.id)) throw new Error(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    const tile = tileAt(setup.map, u.pos);
    if (!tile || !TERRAIN[tile.terrain].walkable) throw new Error(`unit ${u.id} starts on a tile it cannot stand on`);
  }
  let rng = seedFrom(setup.seed);
  const units: Unit[] = setup.units.map((u) => ({
    ...structuredClone(u), maxHp: u.hp, maxAp: u.ap, maxMp: u.mp, facing: u.team === "heroes" ? "S" : "N",
  }));
  // Initiative: higher speed first; ties broken by a seeded roll so they differ per run but replay the same.
  const rolls = new Map<string, number>();
  for (const u of units) { const [v, next] = rngNext(rng); rolls.set(u.id, v); rng = next; }
  const order = [...units].sort((a, b) => b.speed - a.speed || rolls.get(b.id)! - rolls.get(a.id)!).map((u) => u.id);
  return { version: 1, rng, map: structuredClone(setup.map), units, order, turn: 0, round: 1, winner: null };
}

export const activeUnit = (s: BattleState): Unit => s.units.find((u) => u.id === s.order[s.turn])!;
export const unitAt = (s: BattleState, p: Pos) => s.units.find((u) => u.hp > 0 && samePos(u.pos, p));

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
      const path = pathTo(s.map, actor.pos, cmd.to, {
        mp: actor.mp, jump: actor.jump, blocked: (p) => !!unitAt(s, p) && !samePos(p, actor.pos),
      });
      if (!path || path.length === 0) return { ok: false, error: "cannot reach that tile" };
      const last = path[path.length - 1]!, before = path[path.length - 2] ?? actor.pos;
      actor.facing = facingOf(before, last);
      actor.pos = { ...last };
      actor.mp -= path.length;
      events.push({ e: "moved", unit: actor.id, path });
      break;
    }
    case "face": {
      actor.facing = cmd.dir;
      events.push({ e: "faced", unit: actor.id, dir: cmd.dir });
      break;
    }
    case "endTurn": {
      const alive = (id: string) => s.units.some((u) => u.id === id && u.hp > 0);
      let next = s.turn;
      do {
        next = (next + 1) % s.order.length;
        if (next === 0) s.round += 1;
      } while (!alive(s.order[next]!) && next !== s.turn);
      s.turn = next;
      const u = activeUnit(s);
      u.ap = u.maxAp;
      u.mp = u.maxMp;
      events.push({ e: "turnStarted", unit: u.id, round: s.round });
      break;
    }
  }
  s.winner = winnerOf(s);
  return { ok: true, state: s, events };
}

function winnerOf(s: BattleState): Team | null {
  const heroes = s.units.some((u) => u.team === "heroes" && u.hp > 0);
  const foes = s.units.some((u) => u.team === "foes" && u.hp > 0);
  if (heroes && !foes) return "heroes";
  if (foes && !heroes) return "foes";
  return null;
}
