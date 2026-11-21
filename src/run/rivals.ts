/* Rivals: foes who remember you (plan doc, "Rivals").

   A Savia-marked foe becomes a rival when it escapes a battle on its own (one the party spares never does), or when it is still standing after downing one
   of the party in a battle the party lost. It keeps the spec it had, gets an epithet and a title from what
   happened, and reads how the party fought: the element used most, near or far, the opening move, and whether
   anyone was healed. Each time it meets the party again it brings one counter to what it read last time, and it
   gains a level.

   Everything here is a pure function of the battle (setup, commands, final state) and the seeded random, so a
   run save that keeps the rival list replays exactly, and co-op agrees on it. */
import { ABILITIES } from "../data/abilities";
import { ELEMENTS, type Element } from "../data/elements";
import { EPITHETS, TAUNTS, TITLES, type Line } from "../data/rivals";
import { rngInt, seedFrom } from "../engine/rng";
import { applyCommand, createBattle, type BattleSetup, type BattleState, type Command, type UnitSpec } from "../engine/state";

export type Counter = "resist" | "closer" | "slippery" | "hunter";

/** How the party fought one battle, as a rival saw it. */
export interface Style {
  /** Element of the party's damaging casts used most, if any. */
  element: Element | null;
  /** Most damaging casts from 2+ tiles away ("far") or adjacent ("close"). */
  range: "close" | "far" | null;
  /** First ability the party cast. */
  opener: string | null;
  /** The party healed or helped someone up. */
  protects: boolean;
}

export interface Rival {
  /** Unit id it had in the battle where it became a rival; it keeps it so it replaces that foe. */
  id: string;
  /** Its spec when it became a rival (position is set by each battle). */
  base: UnitSpec;
  epithet: number;
  cause: { kind: "escaped" | "felled" | "betrayed"; hero: string };
  level: number;
  /** Battles fought against the party since it became a rival. */
  meetings: number;
  /** What it read of the party, most recent last. */
  memory: Style[];
  /** One per meeting, in order. Each is applied once (resist stacks per element). */
  counters: { kind: Counter; element?: Element }[];
  /** Set once the party settles it: beaten and finished, or beaten and spared (it never comes back as a rival). */
  settled?: "finished" | "spared";
  /** A nemesis: it ended an earlier run and followed the hero into this one (runs it has carried over). */
  nemesis?: number;
  /** How deep (run/run.ts depthOf) the node was where it ended a run: its stats carry that depth's scaling. */
  depth?: number;
}

export const RIVAL_LEVEL_HP = 0.1, RIVAL_LEVEL_STAT = 5;
export const RESIST_STEP = 25, RESIST_CAP = 60;
export const CLOSER_MP = 1, SLIPPERY_AGI = 6;

/** Replays a battle and reads the party's style from its casts. */
export function readStyle(setup: BattleSetup, commands: Command[]): Style {
  let s = createBattle(setup);
  const elements = new Map<Element, number>();
  let near = 0, far = 0, opener: string | null = null, protects = false;
  for (const c of commands) {
    if (c.t === "cast") {
      const caster = s.units.find((u) => u.id === c.unit)!;
      const ab = ABILITIES[c.ability]!;
      if (caster.team === "heroes") {
        opener ??= c.ability;
        if (ab.heal || ab.revive) protects = true;
        if (ab.damage) {
          elements.set(ab.element, (elements.get(ab.element) ?? 0) + 1);
          if (Math.abs(caster.pos.x - c.target.x) + Math.abs(caster.pos.y - c.target.y) <= 1) near++; else far++;
        }
      }
    }
    const r = applyCommand(s, c);
    if (!r.ok) throw new Error(`readStyle: command refused: ${r.error}`);
    s = r.state;
  }
  // Ties go to the element seen first, so the result does not depend on Map quirks.
  let element: Element | null = null, best = 0;
  for (const [e, n] of elements) if (n > best) { element = e; best = n; }
  return { element, range: near + far === 0 ? null : far >= near ? "far" : "close", opener, protects };
}

/** The counter a rival brings after seeing `style`. Prefers one it does not have yet. */
export function pickCounter(r: Pick<Rival, "counters">, style: Style): { kind: Counter; element?: Element } {
  const has = (k: Counter, e?: Element) => r.counters.some((c) => c.kind === k && c.element === e);
  const options: { kind: Counter; element?: Element }[] = [];
  if (style.element && style.element !== "neutral") options.push({ kind: "resist", element: style.element });
  if (style.range === "far") options.push({ kind: "closer" });
  if (style.range === "close") options.push({ kind: "slippery" });
  if (style.protects) options.push({ kind: "hunter" });
  const fresh = options.find((o) => o.kind === "resist" || !has(o.kind));
  return fresh ?? options[0] ?? { kind: "slippery" };
}

/** After a battle: new rivals from escaped foes (or winners), and meetings for rivals that were there. */
export function afterBattle(rivals: Rival[], setup: BattleSetup, commands: Command[], end: BattleState): Rival[] {
  const out = rivals.map((r) => structuredClone(r));
  const style = readStyle(setup, commands);
  const heroName = setup.units.find((u) => u.team === "heroes")?.name ?? "";
  let rng = seedFrom(`${setup.seed}:rivals`);
  for (const u of end.units) {
    if (u.team !== "foes" || !u.marked) continue;
    const known = out.find((r) => r.id === u.id && !r.settled);
    const getsAway = u.life === "escaped" || (end.winner === "foes" && u.life === "up" && u.downs > 0);
    if (known) {
      known.meetings += 1;
      known.memory.push(style);
      if (getsAway) { known.level += 1; known.counters.push(pickCounter(known, style)); }
      else known.settled = u.life === "spared" ? "spared" : "finished";
      continue;
    }
    if (!getsAway) continue;
    const spec = setup.units.find((x) => x.id === u.id)!;
    let epithet: number; [epithet, rng] = rngInt(rng, 0, EPITHETS.length - 1);
    const fresh: Rival = {
      id: u.id, base: structuredClone(spec), epithet,
      cause: { kind: u.life === "escaped" ? "escaped" : "felled", hero: heroName },
      level: 1, meetings: 0, memory: [style], counters: [],
    };
    fresh.counters.push(pickCounter(fresh, style));
    out.push(fresh);
  }
  return out;
}

/** A companion who turned on the party: a rival from now on, with what it saw of the party's style. */
export function rivalFromCompanion(spec: UnitSpec, heroName: string, style: Style, seed: string): Rival {
  const [epithet] = rngInt(seedFrom(`${seed}:turned:${spec.id}`), 0, EPITHETS.length - 1);
  const base: UnitSpec = { ...structuredClone(spec), team: "foes", marked: true, ai: "skirmisher" };
  delete base.hpNow; delete base.refuses;
  const r: Rival = { id: spec.id, base, epithet, cause: { kind: "betrayed", hero: heroName }, level: 1, meetings: 0, memory: [style], counters: [] };
  r.counters.push(pickCounter(r, style));
  return r;
}

export const activeRivals = (rivals: Rival[]) => rivals.filter((r) => !r.settled);

/** Display name: species name plus epithet, in the player's language. */
export const rivalName = (r: Rival, lang: keyof Line) => `${r.base.name} ${EPITHETS[r.epithet]![lang]}`;

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

export const rivalTitle = (r: Rival, lang: keyof Line) => fill(TITLES[r.nemesis ? "nemesis" : r.cause.kind][lang], { hero: r.cause.hero });

/** Who ended a lost run, as a rival: a rival standing at the end of the last battle (the highest level, then the
    one with most downs), or else the standing foe with most downs, made a rival now even if it bore no Sap mark.
    Pure: the seed picks the epithet of a new one. Null when no foe is left standing. */
export function runEnder(rivals: Rival[], setup: BattleSetup, commands: Command[], end: BattleState): Rival | null {
  const standing = end.units.filter((u) => u.team === "foes" && u.life === "up");
  if (!standing.length) return null;
  const known = activeRivals(rivals).filter((r) => standing.some((u) => u.id === r.id))
    .sort((a, b) => b.level - a.level || (standing.find((u) => u.id === b.id)!.downs - standing.find((u) => u.id === a.id)!.downs));
  if (known[0]) return known[0];
  const u = [...standing].sort((a, b) => b.downs - a.downs || a.id.localeCompare(b.id))[0]!;
  const spec = setup.units.find((x) => x.id === u.id)!;
  const style = readStyle(setup, commands);
  const [epithet] = rngInt(seedFrom(`${setup.seed}:ender`), 0, EPITHETS.length - 1);
  const r: Rival = { id: u.id, base: { ...structuredClone(spec), marked: true }, epithet, cause: { kind: "felled", hero: setup.units.find((x) => x.team === "heroes")?.name ?? "" },
    level: 1, meetings: 0, memory: [style], counters: [] };
  r.counters.push(pickCounter(r, style));
  return r;
}

/** What it says when the battle starts: about its newest counter. */
export function rivalTaunt(r: Rival, lang: keyof Line): string {
  const c = r.counters.at(-1);
  const line = r.meetings === 0 && !c ? TAUNTS.first : TAUNTS[c?.kind ?? "first"];
  const element = c?.element ? ELEMENTS[c.element][lang].toLowerCase() : "";
  return fill(line[lang], { name: rivalName(r, lang), element });
}

/** The unit it fields: its old spec, levelled up, with every counter applied, at `pos`. */
export function rivalSpec(r: Rival, lang: keyof Line, pos = r.base.pos): UnitSpec {
  const b = r.base, up = r.level - 1;
  const spec: UnitSpec = {
    ...structuredClone(b), pos: { ...pos }, name: rivalName(r, lang), marked: true, rival: true,
    hp: Math.round(b.hp * (1 + RIVAL_LEVEL_HP * up)),
    str: b.str + RIVAL_LEVEL_STAT * up, mag: b.mag + RIVAL_LEVEL_STAT * up,
  };
  const once = new Set<Counter>();
  for (const c of r.counters) {
    if (c.kind !== "resist") { if (once.has(c.kind)) continue; once.add(c.kind); }
    if (c.kind === "resist" && c.element) spec.res[c.element] = Math.min(RESIST_CAP, (spec.res[c.element] ?? 0) + RESIST_STEP);
    if (c.kind === "closer") spec.mp += CLOSER_MP;
    if (c.kind === "slippery") spec.agi += SLIPPERY_AGI;
    if (c.kind === "hunter") spec.hunts = "healer";
  }
  return spec;
}
