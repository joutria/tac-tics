/* The hero's two alignment meters over a run (data/alignment.ts): what moves them after a fight or a choice on the
   run map, the nine alignments, lock-in, the hero's ending, and which twin cards they open (data/twins.ts).
   Everything is read from the battle's setup, its command log and the run, so it stays deterministic for saves
   and co-op. */
import { ALIGN, ALIGNMENTS, GRID, HERO_ENDINGS, SHIFT, SIDE_NAMES, SIDES, type Align, type AlignmentId, type Col, type Corner, type Meter, type Row, type Side } from "../data/alignment";
import { TWINS, type Twin } from "../data/twins";
import type { Line } from "../data/rivals";
import type { BattleSetup, BattleState, Command } from "../engine/state";
import type { Deeds } from "./party";
import type { RunState } from "./run";

export const METERS: Meter[] = ["mercy", "purity"];
const clamp = (n: number) => Math.max(-ALIGN.max, Math.min(ALIGN.max, n));

/** The run's meters (0 and 0 for a run that has not moved them yet). */
export const alignOf = (run: Pick<RunState, "align">): Align => ({ mercy: run.align?.mercy ?? 0, purity: run.align?.purity ?? 0 });

/** How far a meter has gone towards a side (negative when it is on the other side). */
export const towards = (a: Align, side: Side) => a[SIDES[side].meter] * SIDES[side].sign;

/** The side a meter leans to, once it reaches `at` (the band edge by default). */
export function sideOf(a: Align, meter: Meter, at = ALIGN.mark): Side | null {
  const v = a[meter];
  if (v >= at) return meter === "mercy" ? "mercy" : "purity";
  if (v <= -at) return meter === "mercy" ? "severity" : "sap";
  return null;
}

const rowOf = (a: Align): Row => (a.mercy >= ALIGN.mark ? "merciful" : a.mercy <= -ALIGN.mark ? "severe" : "measured");
const colOf = (a: Align): Col => (a.purity >= ALIGN.mark ? "pure" : a.purity <= -ALIGN.mark ? "sapTouched" : "wavering");

/** One of the nine alignments. */
export const alignmentOf = (a: Align): AlignmentId => GRID[rowOf(a)][colOf(a)];

const CORNERS: Corner[] = ["lantern", "graft", "purifier", "crown"];

/** The hero's ending: a corner's full ending; an edge's variant of the nearest corner (the one its middle meter
    leans towards; a dead-even middle meter leans to Mercy and Purity) plus the edge's own line; or the regular
    ending for the Wanderer. */
export function heroEnding(a: Align): { alignment: AlignmentId; kind: "corner" | "edge" | "regular"; corner?: Corner; text: Line } {
  const id = alignmentOf(a);
  if ((CORNERS as string[]).includes(id)) return { alignment: id, kind: "corner", corner: id as Corner, text: HERO_ENDINGS.corners[id as Corner].full };
  if (id === "wanderer") return { alignment: id, kind: "regular", text: HERO_ENDINGS.regular };
  const row: Row = rowOf(a) !== "measured" ? rowOf(a) : a.mercy >= 0 ? "merciful" : "severe";
  const col: Col = colOf(a) !== "wavering" ? colOf(a) : a.purity >= 0 ? "pure" : "sapTouched";
  const corner = GRID[row][col] as Corner;
  const edge = HERO_ENDINGS.edges[id as keyof typeof HERO_ENDINGS.edges];
  const variant = HERO_ENDINGS.corners[corner].variant;
  return { alignment: id, kind: "edge", corner, text: { es: `${variant.es} ${edge.es}`, en: `${variant.en} ${edge.en}` } };
}

/** What a fight moves: ordinary deeds (capped at ALIGN.perFight per meter), tagged twins the hero used (once per
    card), and settling rivals (on top of the cap). */
export function battleShift(setup: BattleSetup, commands: Command[], end: BattleState, deeds: Deeds): Align {
  const heroId = setup.units[0]!.id;
  const finished = deeds.finishDowned + deeds.finishYielding + deeds.killFleeing;
  const mercy = deeds.spare * SHIFT.spare + finished * SHIFT.finish + deeds.helpUp * SHIFT.helpUp;
  const out: Align = { mercy: 0, purity: 0 };
  out.mercy += mercy;
  const used = new Set<string>();
  for (const c of commands) if (c.t === "cast" && c.unit === heroId) used.add(c.ability);
  for (const id of used) {
    const tw = TWINS.find((x) => x.twin === id);
    if (!tw?.tag) continue;
    out[SIDES[tw.tag].meter] += SIDES[tw.tag].sign * SHIFT.tagged;
  }
  for (const m of METERS) out[m] = Math.max(-ALIGN.perFight, Math.min(ALIGN.perFight, out[m]));
  for (const u of end.units) {
    if (u.team !== "foes" || !u.rival) continue;
    if (u.life === "spared") out.mercy += SHIFT.rivalSpared;
    else if (u.life === "dead" || u.life === "downed") out.mercy += SHIFT.rivalFinished;
  }
  return out;
}

/** Moves the meters (in place) and says what changed: remarks when a meter crosses a mark, and lock-in. */
export function shiftAlign(run: RunState, by: Partial<Align>): Line[] {
  const before = alignOf(run), after: Align = { ...before };
  for (const m of METERS) after[m] = clamp(before[m] + (by[m] ?? 0));
  if (after.mercy === before.mercy && after.purity === before.purity) return [];
  run.align = after;
  const said: Line[] = [];
  for (const m of METERS) {
    for (const mark of [ALIGN.mark, ALIGN.signature]) {
      const was = sideOf(before, m, mark), now = sideOf(after, m, mark);
      if (now && now !== was) said.push(markLine(now, mark));
    }
  }
  if (ALIGN.lockAt === "signature") said.push(...lockIn(run));
  return said;
}

/** Locks each meter already at ALIGN.signature on one side, once: the other side's signature twins close for the
    rest of the run. Called when a meter moves (lockAt "signature") or when a region ends (lockAt "regionEnd"). */
export function lockIn(run: RunState): Line[] {
  const a = alignOf(run), said: Line[] = [];
  for (const m of METERS) {
    const side = sideOf(a, m, ALIGN.signature);
    if (!side || run.alignLock?.[m]) continue;
    (run.alignLock ??= {})[m] = side;
    const other = opposite(side);
    said.push({
      es: `${SIDE_NAMES[side].es} queda fijada: las cartas gemelas de firma de ${SIDE_NAMES[other].es} se cierran para el resto de la partida.`,
      en: `${SIDE_NAMES[side].en} locks in: ${SIDE_NAMES[other].en} signature twin cards close for the rest of the run.`,
    });
  }
  return said;
}

export const opposite = (side: Side): Side => ({ mercy: "severity", severity: "mercy", purity: "sap", sap: "purity" } as const)[side];

function markLine(side: Side, mark: number): Line {
  const sig = mark >= ALIGN.signature;
  return {
    es: `${SIDE_NAMES[side].es} llega a ${mark}: se abren las cartas gemelas${sig ? " de firma" : ""} de ${SIDE_NAMES[side].es}.`,
    en: `${SIDE_NAMES[side].en} reaches ${mark}: ${SIDE_NAMES[side].en}${sig ? " signature" : ""} twin cards open.`,
  };
}

/** Why a twin cannot be worn right now, or null when it can. */
export type TwinBar = { k: "level"; n: number } | { k: "job" } | { k: "needs"; side: Side; n: number } | { k: "locked"; side: Side };

export function twinBar(run: Pick<RunState, "align" | "alignLock" | "hero">, tw: Twin, abilities: string[]): TwinBar | null {
  if (!abilities.includes(tw.base)) return { k: "job" };
  if (run.hero.level < tw.level) return { k: "level", n: tw.level };
  if (!tw.tag) return null;
  const need = tw.tier === "signature" ? ALIGN.signature : ALIGN.mark;
  const lock = run.alignLock?.[SIDES[tw.tag].meter];
  if (tw.tier === "signature" && lock && lock !== tw.tag) return { k: "locked", side: lock };
  if (towards(alignOf(run), tw.tag) < need) return { k: "needs", side: tw.tag, n: need };
  return null;
}

/** A meter within ALIGN.warnWithin of locking, and which side it would lock to. */
export function lockWarning(run: Pick<RunState, "align" | "alignLock">): { meter: Meter; side: Side } | null {
  const a = alignOf(run);
  for (const m of METERS) {
    if (run.alignLock?.[m]) continue;
    const v = a[m];
    if (Math.abs(v) >= ALIGN.signature - ALIGN.warnWithin && Math.abs(v) < ALIGN.signature) {
      return { meter: m, side: v > 0 ? (m === "mercy" ? "mercy" : "purity") : m === "mercy" ? "severity" : "sap" };
    }
  }
  return null;
}

export const alignmentName = (a: Align, lang: keyof Line) => ALIGNMENTS[alignmentOf(a)].name[lang];
