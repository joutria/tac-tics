/* Pacing numbers for the simulators: how long fights last, how much one enemy window can take off a party member,
   and how proactive the foes are. Feed it each AI turn (the state before, the commands, the state after). */
import { ABILITIES } from "../src/data/abilities";
import { roundOf, type BattleState, type Command } from "../src/engine/state";

/** A party member downed in one enemy window having ended its own turn at or above this share of max HP. */
export const BURST_FROM = 0.6;

export class PaceStats {
  fights = 0; rounds = 0;
  /** Party members downed or killed at all, and the ones from BURST_FROM or more in one window. */
  downs = 0; burstDowns = 0;
  /** Sum over fights of the largest share of max HP one party member lost in one enemy window. */
  worstWindow = 0;
  foeTurns = 0; foeAttackTurns = 0;
  /** Sum over fights of the round of the first foe attack (fights where they never attacked count the length). */
  firstFoeAttack = 0;
  private endHp = new Map<string, number>();
  private worst = 0; private firstAttack = 0;

  start() { this.endHp.clear(); this.worst = 0; this.firstAttack = 0; }

  turn(before: BattleState, cmds: Command[], after: BattleState) {
    const actor = before.units.find((u) => u.id === before.active)!;
    if (actor.team === "foes" && actor.escape === "none") {
      this.foeTurns++;
      const attacked = cmds.some((c) => c.t === "cast" && !!ABILITIES[c.ability]?.damage);
      if (attacked) { this.foeAttackTurns++; if (!this.firstAttack) this.firstAttack = roundOf(before); }
    }
    for (const u of after.units) {
      if (u.team !== "heroes") continue;
      const was = before.units.find((x) => x.id === u.id)!;
      if (u.id === actor.id) { this.endHp.set(u.id, u.hp); continue; }
      const ref = this.endHp.get(u.id) ?? was.hp;
      if (was.life === "up" && u.life !== "up") {
        this.downs++;
        if (ref >= was.maxHp * BURST_FROM) this.burstDowns++;
      }
      const lost = (ref - (u.life === "up" ? u.hp : 0)) / was.maxHp;
      this.worst = Math.max(this.worst, lost);
    }
  }

  end(s: BattleState) {
    this.fights++; this.rounds += roundOf(s); this.worstWindow += this.worst;
    this.firstFoeAttack += this.firstAttack || roundOf(s);
  }

  report(): string {
    const f = Math.max(1, this.fights);
    return [
      `pace: ${(this.rounds / f).toFixed(1)} rounds a fight, first foe attack in round ${(this.firstFoeAttack / f).toFixed(1)}`,
      `foes attacked on ${((100 * this.foeAttackTurns) / Math.max(1, this.foeTurns)).toFixed(0)}% of their turns`,
      `party downs ${(this.downs / f).toFixed(2)} a fight, ${(this.burstDowns / f).toFixed(2)} from ${BURST_FROM * 100}%+ HP in one enemy window`,
      `worst single enemy window: ${((100 * this.worstWindow) / f).toFixed(0)}% of a party member's max HP (average per fight)`,
    ].join("\n");
  }
}
