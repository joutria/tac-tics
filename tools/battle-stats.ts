/* Pacing numbers for the simulators: how long fights last, how much one enemy window can take off a party member,
   and how proactive the foes are. Feed it each AI turn (the state before, the commands, the state after). */
import { ABILITIES } from "../src/data/abilities";
import { roundOf, type BattleState, type Command } from "../src/engine/state";
import { RULES, setRules, type Rules, type RulesMode } from "../src/engine/rules";

/** A party member downed in one enemy window having ended its own turn at or above this share of max HP. */
export const BURST_FROM = 0.6;

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;

export class PaceStats {
  fights = 0; rounds = 0;
  /** Party members downed or killed at all, and the ones from BURST_FROM or more in one window. */
  downs = 0; burstDowns = 0;
  /** Sum over fights of the largest share of max HP one party member lost in one enemy window. */
  worstWindow = 0;
  foeTurns = 0; foeAttackTurns = 0;
  /** Non-quick casts by side, and the ones that were not the basic attack (spells, heals, buffs). */
  casts = { heroes: 0, foes: 0 }; spells = { heroes: 0, foes: 0 };
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
    for (const c of cmds) {
      const ab = c.t === "cast" ? ABILITIES[c.ability] : undefined;
      if (!ab || ab.quick) continue;
      this.casts[actor.team]++;
      if (!(ab.damage && ab.cooldown === 0)) this.spells[actor.team]++;
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
      `casts a fight: party ${(this.casts.heroes / f).toFixed(1)} (${pct(this.spells.heroes, this.casts.heroes)} spells), foes ${(this.casts.foes / f).toFixed(1)} (${pct(this.spells.foes, this.casts.foes)} spells)`,
      `worst single enemy window: ${((100 * this.worstWindow) / f).toFixed(0)}% of a party member's max HP (average per fight)`,
    ].join("\n");
  }
}

/** Reads the turn-rule flags out of `args` (and removes them) and applies them (src/engine/rules.ts):
    `--rules ap|act|pips`, `--dmg <x>` (party), `--foe <x>` (foe damage), `--heal <x>`, `--mana <max>,<start share>,<regen>`, `--nocd` (mana is the
    only limit on spells), `--boss <acts>`. Returns a one-line description, or "" for the shipped rules. */
export function rulesFromArgs(args: string[]): string {
  const take = (flag: string, n = 1) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, n + 1).slice(1) : null; };
  const r: Partial<Rules> = {};
  const mode = take("--rules")?.[0] as RulesMode | undefined;
  const dmg = take("--dmg"), foe = take("--foe"), heal = take("--heal"), mana = take("--mana"), boss = take("--boss");
  const nocd = take("--nocd", 0);
  if (dmg) r.damage = Number(dmg[0]);
  if (foe) r.foeDamage = Number(foe[0]);
  if (heal) r.heal = Number(heal[0]);
  if (mana) { const [max, start, regen] = mana[0]!.split(",").map(Number); r.mana = { max: max!, start: start!, regen: regen! }; }
  if (boss) r.bossActs = Number(boss[0]);
  if (nocd) r.cooldowns = false;
  setRules({ ...r, ...(mode ? { mode } : {}) });
  if (RULES.mode === "ap" && !Object.keys(r).length) return "";
  return `rules ${RULES.mode}: damage x${RULES.damage} (foes x${RULES.foeDamage}), heal x${RULES.heal}, mana ${RULES.mana.max} (start ${RULES.mana.start * 100}%, +${RULES.mana.regen}/turn), cooldowns ${RULES.cooldowns ? "on" : "off"}, boss acts ${RULES.bossActs}`;
}
