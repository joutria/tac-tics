/* Companions in a run: approval, what they saw you do in battle, and how they react (plan doc "Companion values
   and forbidden actions"). Everything is read from the battle's setup and command log, so approval is part of the
   deterministic record, as the plan asks. */
import { APPROVAL, COMPANIONS, type Companion, type Deed } from "../data/companions";
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
}

export const newMember = (id: string, approval: number, known: boolean): Member =>
  ({ id, hp: COMPANIONS[id]!.spec.hp, approval: clamp(APPROVAL.start + approval), crossed: 0, known, status: "with", said: [] });

const clamp = (n: number) => Math.max(APPROVAL.min, Math.min(APPROVAL.max, n));

/** The companion as it fights: grows with the hero's level, and refuses orders when approval is low. */
export function memberSpec(m: Member, heroLevel: number, pos: UnitSpec["pos"]): UnitSpec {
  const c = COMPANIONS[m.id]!;
  const up = heroLevel - 1;
  const spec: UnitSpec = {
    ...structuredClone(c.spec), pos: { ...pos },
    hp: c.spec.hp + (GROWTH.hp ?? 0) * up, str: c.spec.str + (GROWTH.str ?? 0) * up, mag: c.spec.mag + (GROWTH.mag ?? 0) * up,
  };
  spec.hpNow = m.hp;
  if (m.approval < APPROVAL.refuses && c.forbidden.includes("killFleeing")) spec.refuses = "fleeing";
  return spec;
}

/** What the party did in a battle that companions care about. */
export function readDeeds(setup: BattleSetup, commands: Command[]): Record<Deed, number> {
  const seen: Record<Deed, number> = { helpUp: 0, heal: 0, finishDowned: 0, killFleeing: 0, letEscape: 0 };
  let s = createBattle(setup);
  for (const c of commands) {
    const before = s;
    const r = applyCommand(s, c);
    if (!r.ok) throw new Error(`readDeeds: command refused: ${r.error}`);
    s = r.state;
    for (const e of r.events) {
      if (e.e !== "cast") continue;
      const caster = before.units.find((u) => u.id === e.unit)!;
      if (caster.team !== "heroes") continue;
      for (const h of e.hits) {
        const was = before.units.find((u) => u.id === h.unit)!;
        if (h.revived) seen.helpUp++;
        if (h.heal > 0) seen.heal++;
        if (was.team === "heroes") continue;
        if (was.life === "downed" && h.died) seen.finishDowned++;
        if (was.escape === "flee" && (h.downed || h.died)) seen.killFleeing++;
      }
    }
  }
  seen.letEscape = s.units.filter((u) => u.team === "foes" && u.life === "escaped").length;
  return seen;
}

/** Applies a battle's deeds to a companion: approval, remarks, and the escalation it reaches. */
export function react(m: Member, deeds: Record<Deed, number>): { member: Member; remarks: Line[] } {
  const c: Companion = COMPANIONS[m.id]!;
  const next = structuredClone(m);
  const remarks: Line[] = [];
  let liked = 0;
  for (const [deed, n] of Object.entries(deeds) as [Deed, number][]) {
    const per = c.reacts[deed];
    if (!n || !per) continue;
    if (per > 0) liked += per * n; else next.approval += per * n;
    if (c.remarks[deed]) remarks.push(c.remarks[deed]!);
    if (c.forbidden.includes(deed)) { next.crossed += n; next.known = true; }
  }
  next.approval = clamp(next.approval + Math.min(liked, c.likeCapPerBattle));
  const crossedNow = c.forbidden.some((d) => deeds[d] > 0);
  const step = (k: Member["said"][number]) => { if (!next.said.includes(k)) { next.said.push(k); remarks.push(c.escalation[k]); } };
  // A forbidden deed with approval already at the bottom: the companion turns on the party.
  if (crossedNow && next.approval <= APPROVAL.leaves) { next.status = "turned"; step("betrays"); return { member: next, remarks }; }
  if (next.approval < APPROVAL.leaves) { next.status = "leaving"; step("leaves"); }
  else if (next.approval < APPROVAL.refuses) step("refuses");
  else if (next.approval < APPROVAL.cold) step("cold");
  return { member: next, remarks };
}
