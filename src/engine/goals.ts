/* Battle goals (plan doc, gap 7 B: "varied goals from M2"). Most fights are won by routing the foes. Some plain
   fights on the run map carry a goal on top, shown on the signposts before the party picks a path:

   - protect: a survivor of the Sap stands on the field. It is on the party's side but does not act, and the foes go
     for it. It can be helped up like anyone. If it dies, the goal fails (the fight goes on).
   - survive: more foes than usual, but the party only has to hold out. Once the given round begins with the hero
     standing, the foes fall back and the fight is won, whoever is still up.
   - catch:   a Sap courier runs for the edge from the first turn (it flees: +2 MP, takes more damage, pinned hard
     by Lock, and never fights back). Down it, finish it or spare it before it leaves and the goal is met. If it gets
     away, the goal fails (the fight goes on). A courier never becomes a rival.

   A failed goal never ends the run: it only costs the goal's prize (see run.ts GOAL_PRIZE). Pure functions over the
   battle state, so saves and co-op replay them exactly. */
import type { BattleState, Unit } from "./state";

export type GoalKind = "protect" | "survive" | "catch";
export type Goal =
  | { kind: "protect"; ward: string }
  | { kind: "survive"; rounds: number }
  | { kind: "catch"; runner: string };

/** "open" while it can still go either way. */
export type GoalStatus = "met" | "failed" | "open";

export const GOAL_KINDS: readonly GoalKind[] = ["protect", "survive", "catch"];

/** Does not act: its turns pass on their own (a protect goal's survivor). */
export const isWard = (u: { ward?: boolean }) => !!u.ward;

export function goalStatus(s: BattleState): GoalStatus {
  const g = s.goal;
  if (!g) return "open";
  if (g.kind === "protect") {
    const w = s.units.find((u) => u.id === g.ward);
    if (!w || w.life === "dead") return "failed";
    return s.winner === "heroes" ? "met" : "open";
  }
  if (g.kind === "catch") {
    const r = s.units.find((u) => u.id === g.runner);
    if (!r || r.life === "escaped") return "failed";
    if (r.life === "dead" || r.life === "downed" || r.life === "spared") return "met";
    return "open";
  }
  return s.winner === "heroes" ? "met" : "open";
}

/** The unit a goal is about (the survivor or the courier), if any. */
export function goalUnit(s: BattleState): Unit | undefined {
  const g = s.goal;
  const id = g?.kind === "protect" ? g.ward : g?.kind === "catch" ? g.runner : undefined;
  return id ? s.units.find((u) => u.id === id) : undefined;
}

/** A survive goal: rounds still to hold out, counting the current one (0 once it is met). */
export function roundsLeft(s: BattleState, round: number): number {
  return s.goal?.kind === "survive" ? Math.max(0, s.goal.rounds - round + 1) : 0;
}
