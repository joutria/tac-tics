/* Companions in a run: approval, what they saw you do in battle, and how they react (plan doc "Companion values
   and forbidden actions"). Everything is read from the battle's setup and command log, so approval is part of the
   deterministic record, as the plan asks. */
import { SAP_RICH } from "../data/abilities";
import { APPROVAL, COMPANIONS, DEEDS, LESSON_APPROVAL, QUESTS, QUICK_WIN_ROUNDS, type Companion, type Deed, type Ending, type Lesson } from "../data/companions";
import { GROWTH } from "../data/gear";
import type { Line } from "../data/rivals";
import { applyCommand, createBattle, type BattleSetup, type Command, type UnitSpec } from "../engine/state";

export interface Member {
  id: string;
  hp: number;
  approval: number;
  /** Forbidden deeds seen, ever. */
  crossed: number;
  /** The player has heard what this companion will not forgive (warnings show from then on). */
  known: boolean;
  status: "with" | "leaving" | "left" | "fallen" | "turned";
  /** Escalation lines already said, so each is said once. */
  said: ("cold" | "refuses" | "leaves" | "betrays")[];
  /** Has seen what their flaw costs (their quest's "seen it" condition). */
  seen?: boolean;
  /** What they did at their quest's lesson moment. */
  lesson?: Lesson;
}

/** Ready for the lesson: approval high enough and the cost of their flaw seen. */
export const readyForLesson = (m: Member) => !!m.seen && m.approval >= LESSON_APPROVAL;

/** A companion's ending when the run is over (M3 draft, "Endings"). */
export function endingOf(m: Member): Ending {
  if (m.status !== "with") return "bad";
  if (m.lesson === "double") return "bad";
  if (m.lesson === "sacrifice") return "good";
  if (m.lesson === "hold" && m.seen && QUESTS[m.id]?.heldAfterSeenIsBad) return "bad";
  return "regular";
}

export const newMember = (id: string, approval: number, known: boolean): Member =>
  ({ id, hp: COMPANIONS[id]!.spec.hp, approval: clamp(APPROVAL.start + approval), crossed: 0, known, status: "with", said: [] });

const clamp = (n: number) => Math.max(APPROVAL.min, Math.min(APPROVAL.max, n));

/** The companion as it fights: grows with the hero's level, and refuses orders when approval is low. Moheda's
    Sap Cap grows when the run holds SAP_RICH shards. */
export function memberSpec(m: Member, heroLevel: number, pos: UnitSpec["pos"], shards = 0): UnitSpec {
  const c = COMPANIONS[m.id]!;
  const up = heroLevel - 1;
  const spec: UnitSpec = {
    ...structuredClone(c.spec), pos: { ...pos },
    hp: c.spec.hp + (GROWTH.hp ?? 0) * up, str: c.spec.str + (GROWTH.str ?? 0) * up, mag: c.spec.mag + (GROWTH.mag ?? 0) * up,
  };
  spec.hpNow = m.hp;
  if (shards >= SAP_RICH) spec.abilities = spec.abilities.map((a) => (a === "sapCap" ? "sapCapRich" : a));
  if (m.approval < APPROVAL.refuses && c.forbidden.includes("killFleeing")) spec.refuses = "fleeing";
  return spec;
}

export type Deeds = Record<Deed, number>;
export const noDeeds = (): Deeds => Object.fromEntries(DEEDS.map((d) => [d, 0])) as Deeds;

/** What the party did in a battle that companions care about. */
export function readDeeds(setup: BattleSetup, commands: Command[]): Deeds {
  const seen = noDeeds();
  let s = createBattle(setup);
  let downed = false;
  for (const c of commands) {
    const before = s;
    const r = applyCommand(s, c);
    if (!r.ok) throw new Error(`readDeeds: command refused: ${r.error}`);
    s = r.state;
    // Deaths that no hit or tick caused are the downed countdown running out: an ally nobody helped up.
    const struck = new Set<string>();
    for (const e of r.events) {
      if (e.e === "tick" && e.died) struck.add(e.unit);
      if (e.e !== "cast") continue;
      for (const h of e.hits) if (h.died) struck.add(h.unit);
      const caster = before.units.find((u) => u.id === e.unit)!;
      if (caster.team !== "heroes") continue;
      for (const h of e.hits) {
        const was = before.units.find((u) => u.id === h.unit);
        if (!was) continue;
        if ((e.ability === "sapCap" || e.ability === "sapCapRich") && was.team === "heroes" && was.id !== caster.id) seen.sapRemedy++;
        if (h.revived) seen.helpUp++;
        if (h.heal > 0) seen.heal++;
        if (was.team === "heroes") continue;
        if (was.life === "downed" && h.died) seen.finishDowned++;
        if (was.escape === "flee" && (h.downed || h.died)) seen.killFleeing++;
      }
    }
    for (const e of r.events) {
      if (e.e !== "died" || struck.has(e.unit)) continue;
      const u = s.units.find((x) => x.id === e.unit)!;
      if (u.team === "heroes" && u.id !== "hero") seen.allyBledOut++;
    }
    if (s.units.some((u) => u.team === "heroes" && (u.life === "downed" || u.life === "dead"))) downed = true;
  }
  const foes = s.units.filter((u) => u.team === "foes");
  seen.letEscape = foes.filter((u) => u.life === "escaped").length;
  seen.rivalEscaped = foes.filter((u) => u.rival && u.life === "escaped").length;
  seen.rivalBeaten = foes.filter((u) => u.rival && (u.life === "dead" || u.life === "downed")).length;
  if (s.winner === "heroes") {
    if (!downed) seen.noneDowned = 1;
    if (s.clock < QUICK_WIN_ROUNDS * 100) seen.quickWin = 1;
  }
  return seen;
}

/** Applies a battle's deeds to a companion: approval, remarks, and the escalation it reaches. */
export function react(m: Member, deeds: Partial<Deeds>): { member: Member; remarks: Line[] } {
  const c: Companion = COMPANIONS[m.id]!;
  const next = structuredClone(m);
  const remarks: Line[] = [];
  let liked = 0;
  for (const [deed, n] of Object.entries(deeds) as [Deed, number][]) {
    const per = c.reacts[deed];
    if (!n || !per) continue;
    if (per > 0) liked += per * n;
    // A clash with another companion's values sours the mood but stops at the clash floor.
    else if (c.soft?.includes(deed)) next.approval = Math.min(next.approval, Math.max(APPROVAL.clashFloor, next.approval + per * n));
    else next.approval += per * n;
    if (c.remarks[deed]) remarks.push(c.remarks[deed]!);
    if (c.forbidden.includes(deed)) { next.crossed += n; next.known = true; }
  }
  next.approval = clamp(next.approval + Math.min(liked, c.likeCapPerBattle));
  const crossedNow = c.forbidden.some((d) => (deeds[d] ?? 0) > 0);
  const step = (k: Member["said"][number]) => { if (!next.said.includes(k)) { next.said.push(k); remarks.push(c.escalation[k]); } };
  // A forbidden deed with approval already at the bottom: the companion turns on the party.
  if (crossedNow && next.approval <= APPROVAL.leaves) { next.status = "turned"; step("betrays"); return { member: next, remarks }; }
  if (next.approval < APPROVAL.leaves) { next.status = "leaving"; step("leaves"); }
  else if (next.approval < APPROVAL.refuses) step("refuses");
  else if (next.approval < APPROVAL.cold) step("cold");
  return { member: next, remarks };
}
