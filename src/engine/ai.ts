/* Enemy AI: utility scoring with one turn of lookahead.
   For the active unit it weighs every tile it can walk to and every ability it could use from there, then where
   to stand afterwards. Standing spots are scored by the damage the players could deal there on their next turn,
   counting only abilities that will be off cooldown (so foes strike while your big abilities are recharging),
   with line of sight and height (so they hide behind obstacles and look for high ground). It also reads how the
   players have been fighting this battle and adapts. It uses no randomness, so saves and co-op replay it exactly. */
import { ABILITIES, type Ability } from "../data/abilities";
import { abilityAvailable, areaTiles, damagePreview, maxRange, unitAbilities } from "./combat";
import { manhattan, NEIGHBOURS, Pos, samePos, sightBlock, tileAt } from "./grid";
import { BLAST_DAMAGE, burning } from "./terrain";
import { reachable } from "./movement";
import { isBorder } from "./escape";
import { hasLineOfSight } from "./sight";
import { statusOf, STATUS, type Status } from "./status";
import { activeUnit, applyCommand, BattleState, Command, isFoe, moveRules, onMap, roundOf, unitAt, type AiKind, type Unit } from "./state";

interface Weights {
  /** How much a point of expected incoming damage hurts a standing spot. */
  caution: number;
  /** How much a point of damage this unit could deal from a spot next turn helps it. */
  offense: number;
  /** Preferred distance to the nearest enemy (0 = adjacent). */
  idealDistance: number;
  /** Cost per tile away from that distance. */
  spacing: number;
}

const WEIGHTS: Record<AiKind, Weights> = {
  caster: { caution: 0.8, offense: 1, idealDistance: 4, spacing: 2 },
  bruiser: { caution: 0.35, offense: 1.2, idealDistance: 1, spacing: 3 },
  skirmisher: { caution: 0.6, offense: 1, idealDistance: 2, spacing: 2 },
};

const key = (p: Pos) => `${p.x},${p.y}`;
const avg = (r: { min: number; max: number }) => (r.min + r.max) / 2;

/** Can an ability cast from `from` reach `to` (range with height, line of sight)? Ignores who stands there. */
function reaches(s: BattleState, ab: Ability, from: Pos, to: Pos, ignore: string[]): boolean {
  const d = manhattan(from, to);
  if (d < ab.range[0] || d > maxRange(s, ab, from, to)) return false;
  if (!ab.los || d === 0) return true;
  return hasLineOfSight(s.map, from, to, (p) => {
    const o = unitAt(s, p);
    return !!o && o.life === "up" && !ignore.includes(o.id) && !samePos(p, to);
  });
}

/** Expected damage the players could deal to `u` if it stood on `spot`, on their next turns. */
function threatAt(s: BattleState, u: Unit, spot: Pos, enemyReach: Map<string, Pos[]>): number {
  let total = 0;
  for (const h of s.units) {
    if (h.life !== "up" || !isFoe(h, u)) continue;
    let best = 0;
    for (const id of h.abilities) {
      const ab = ABILITIES[id]!;
      if (!ab.damage || h.cooldowns[id]) continue; // learned: abilities on cooldown are not a threat next turn
      const dummy = { ...u, pos: spot };
      for (const from of enemyReach.get(h.id) ?? [h.pos]) {
        if (!reaches(s, ab, from, spot, [h.id, u.id])) continue;
        const hitsPerTurn = Math.min(ab.perTurn, Math.floor(h.maxAp / ab.ap));
        best = Math.max(best, avg(damagePreview(s, h, dummy, ab, from)) * hitsPerTurn);
      }
    }
    total += best;
  }
  return total;
}

/** Damage this unit could deal next turn if it stood on `spot`: in reach now, or a short walk away. */
function offenseAt(s: BattleState, u: Unit, spot: Pos): number {
  let best = 0;
  for (const id of u.abilities) {
    const ab = ABILITIES[id]!;
    if (!ab.damage || (u.cooldowns[id] ?? 0) > 1) continue;
    for (const o of s.units) {
      if (o.life !== "up" || !isFoe(u, o)) continue;
      const dmg = avg(damagePreview(s, u, o, ab, spot));
      if (reaches(s, ab, spot, o.pos, [u.id])) best = Math.max(best, dmg);
      else if (manhattan(spot, o.pos) <= u.maxMp + ab.range[1]) best = Math.max(best, dmg * 0.6);
    }
  }
  return best;
}

function positionScore(s: BattleState, u: Unit, spot: Pos, enemyReach: Map<string, Pos[]>, w: Weights): number {
  const threat = threatAt(s, u, spot, enemyReach);
  const hpRatio = u.hp / u.maxHp;
  // Hurt units play safer; long fights make everyone bolder, so nobody hides forever.
  const late = Math.max(0, roundOf(s) - 8);
  const caution = w.caution * (hpRatio < 0.5 ? 1.6 : 1) * Math.max(0.1, 1 - late * 0.15);
  const offense = offenseAt(s, u, spot) * w.offense;
  const enemies = s.units.filter((h) => h.life === "up" && isFoe(h, u));
  const nearest = Math.min(...enemies.map((h) => manhattan(h.pos, spot)), 99);
  // Adapting: against players who keep fighting from range, everyone presses in; against melee, casters back off.
  const style = s.habits.ranged - s.habits.melee;
  let ideal = w.idealDistance;
  if (style >= 3) ideal = Math.max(1, ideal - 1);
  if (style <= -3 && w.idealDistance > 1) ideal += 1;
  const spacing = Math.abs(nearest - ideal) * w.spacing;
  const height = (tileAt(s.map, spot)?.h ?? 0) * 3;
  const cover = NEIGHBOURS.some((d) => { const t = tileAt(s.map, { x: spot.x + d.x, y: spot.y + d.y }); return !!t && sightBlock(t) > 0; }) ? 2 : 0;
  // Fire under its feet, or a barrel next to it that the players could set off.
  const hazard = (burning(s, tileAt(s.map, spot)) ? 8 : 0)
    + (nearBarrel(s, spot) ? BLAST_DAMAGE * 0.5 : 0);
  return -threat * caution + offense - spacing + height + cover - nearest * late - hazard;
}

/** Value of casting `ab` on `target` from `from`: expected damage, kills, finishing downed foes, healing. */
const nearBarrel = (s: BattleState, p: Pos) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(s.map, { x: p.x + dx, y: p.y + dy })?.prop === "barrel") return true;
  return false;
};

/** Setting off a barrel: the blast's damage on enemies around it, minus on friends (the caster counts too). */
function blastValue(s: BattleState, u: Unit, at: Pos, from: Pos): number {
  let v = 0;
  for (const o of s.units) {
    if (o.life !== "up" || Math.max(Math.abs(o.pos.x - at.x), Math.abs(o.pos.y - at.y)) > 1) continue;
    const here = o.id === u.id ? from : o.pos;
    if (Math.max(Math.abs(here.x - at.x), Math.abs(here.y - at.y)) > 1) continue;
    v += isFoe(u, o) ? Math.min(BLAST_DAMAGE, o.hp) + 3 + (BLAST_DAMAGE >= o.hp ? 25 : 0) : -(BLAST_DAMAGE * 1.5 + 5);
  }
  return v;
}

function actionValue(s: BattleState, u: Unit, ab: Ability, from: Pos, target: Pos): number {
  let v = 0;
  for (const p of areaTiles(ab, target)) {
    if ((ab.damage || ab.element === "fire") && tileAt(s.map, p)?.prop === "barrel") v += blastValue(s, u, p, from);
    const o = unitAt(s, p);
    if (!o) continue;
    const enemy = isFoe(u, o);
    if (ab.damage) {
      const dmg = avg(damagePreview(s, u, o, ab, from));
      if (enemy) {
        if (o.life === "downed") v += dmg > 0 ? 45 : 0;
        else v += Math.min(dmg, o.hp) + (dmg >= o.hp ? 25 : 0) + (1 - o.hp / o.maxHp) * 8 + (u.hunts === "healer" && isHealer(o) ? 12 : 0);
      } else if (o.id !== u.id) v -= dmg * 1.5 + 5; // casters are spared by their own area attacks
    }
    if (ab.heal && !enemy && o.life === "up") v += Math.min(avg(ab.heal), o.maxHp - o.hp);
    if (ab.revive && !enemy && o.life === "downed") v += 40;
    if (ab.root && enemy && o.life === "up") v += 6;
    if (ab.push && enemy && o.life === "up") v += 4;
    if (ab.status && o.life === "up" && (o.id !== u.id || !ab.damage)) v += statusValue(ab.status, o, enemy);
  }
  return v;
}

/** What leaving a status on `o` is worth, in points of damage. Bad ones help on enemies and hurt on friends. */
function statusValue(st: Status, o: Unit, enemy: boolean): number {
  const good = STATUS[st.id].good;
  if (good === enemy) return enemy ? -st.power : -6; // a buff on a foe, or a debuff on a friend
  if (statusOf(o, st.id)) return 1; // already has it: refreshing is worth little
  switch (st.id) {
    case "burn": case "poison": return Math.min(st.power * st.turns, o.hp) * 0.8;
    case "stun": return 18;
    case "slow": return st.power * 3;
    case "weaken": return 8;
    case "shield": return o.hp < o.maxHp ? st.power * 0.6 : st.power * 0.3;
    case "regen": return Math.min(st.power * st.turns, o.maxHp - o.hp + st.power) * 0.6;
  }
}

const isHealer = (o: Unit) => o.abilities.some((id) => !!ABILITIES[id]?.heal);

function candidateTargets(s: BattleState, ab: Ability): Pos[] {
  if (ab.teleport) return [];
  const spots = new Map<string, Pos>();
  for (const o of s.units) {
    if (!onMap(o)) continue;
    spots.set(key(o.pos), o.pos);
    if (ab.area !== "single") for (const d of NEIGHBOURS) { const p = { x: o.pos.x + d.x, y: o.pos.y + d.y }; spots.set(key(p), p); }
  }
  if (ab.damage) s.map.tiles.forEach((t, i) => { if (t.prop === "barrel") { const p = { x: i % s.map.w, y: Math.floor(i / s.map.w) }; spots.set(key(p), p); } });
  return [...spots.values()];
}

function enemyReachMap(s: BattleState, u: Unit): Map<string, Pos[]> {
  const m = new Map<string, Pos[]>();
  for (const h of s.units) {
    if (h.life !== "up" || !isFoe(h, u)) continue;
    const rules = { ...moveRules(s, h), mp: h.maxMp, blocked: (p: Pos) => { const o = unitAt(s, p); return !!o && o.id !== h.id && o.id !== u.id; } };
    m.set(h.id, [h.pos, ...[...reachable(s.map, h.pos, rules).values()].map((r) => r.path[r.path.length - 1]!)]);
  }
  return m;
}

interface Plan { value: number; moveTo: Pos | null; ability: string | null; target: Pos | null }

/** The best next step for the active unit: a move and a cast, or a final reposition (ability null). */
export function bestStep(s: BattleState): Plan {
  const u = activeUnit(s);
  const w = WEIGHTS[u.ai ?? "skirmisher"];
  const enemyReach = enemyReachMap(s, u);
  const posCache = new Map<string, number>();
  const posScore = (p: Pos) => {
    const k = key(p);
    if (!posCache.has(k)) posCache.set(k, positionScore(s, u, p, enemyReach, w));
    return posCache.get(k)!;
  };
  const rules = moveRules(s, u);
  const spots: { p: Pos; cost: number }[] = [{ p: u.pos, cost: 0 }, ...[...reachable(s.map, u.pos, rules).values()].map((r) => ({ p: r.path[r.path.length - 1]!, cost: r.cost }))];
  const bestAfter = (from: Pos, mpLeft: number) => {
    let best = posScore(from);
    if (mpLeft > 0) for (const r of reachable(s.map, from, { ...rules, mp: mpLeft }).values()) best = Math.max(best, posScore(r.path[r.path.length - 1]!));
    return best;
  };

  // Doing nothing but repositioning.
  let plan: Plan = { value: -Infinity, moveTo: null, ability: null, target: null };
  for (const sp of spots) {
    const v = posScore(sp.p);
    if (v > plan.value) plan = { value: v, moveTo: samePos(sp.p, u.pos) ? null : sp.p, ability: null, target: null };
  }
  const idle = plan.value;

  for (const id of unitAbilities(u)) {
    if (abilityAvailable(u, id)) continue;
    const ab = ABILITIES[id]!;
    const targets = candidateTargets(s, ab);
    for (const sp of spots) {
      for (const t of targets) {
        if (!reaches(s, ab, sp.p, t, [u.id])) continue;
        const occupant = unitAt(s, t);
        if (ab.target === "foe" && (!occupant || !isFoe(u, occupant))) continue;
        if (ab.target === "ally" && (!occupant || isFoe(u, occupant) || occupant.life !== "up")) continue;
        if (ab.target === "downedAlly" && (!occupant || isFoe(u, occupant) || occupant.life !== "downed")) continue;
        const act = actionValue(s, u, ab, sp.p, t);
        if (act <= 0) continue;
        const v = act + bestAfter(sp.p, u.mp - sp.cost);
        if (v > plan.value && v > idle) plan = { value: v, moveTo: samePos(sp.p, u.pos) ? null : sp.p, ability: id, target: t };
      }
    }
  }
  return plan;
}

/** A retreating or fleeing unit heads for the nearest edge and leaves if it can reach it this turn.
    A retreating one still takes a shot first if it can do so without moving. */
function escapeTurn(start: BattleState, run: (c: Command) => boolean, now: () => BattleState) {
  const u = activeUnit(start), id = u.id;
  if (u.escape === "retreat") {
    const shot = bestStep(start);
    if (!shot.moveTo && shot.ability && shot.target) run({ t: "cast", unit: id, ability: shot.ability, target: shot.target });
  }
  const s = now();
  if (s.winner || s.active !== id) return;
  const me = activeUnit(s);
  // Reached the edge last turn: leave now.
  if (!me.moved && isBorder(s, me.pos)) { run({ t: "escape", unit: id }); return; }
  const edge = (p: Pos) => Math.min(p.x, p.y, s.map.w - 1 - p.x, s.map.h - 1 - p.y);
  let best: { p: Pos; d: number; cost: number } = { p: me.pos, d: edge(me.pos), cost: 0 };
  for (const r of reachable(s.map, me.pos, moveRules(s, me)).values()) {
    const p = r.path[r.path.length - 1]!, d = edge(p);
    if (d < best.d || (d === best.d && r.cost < best.cost)) best = { p, d, cost: r.cost };
  }
  if (!samePos(best.p, me.pos)) run({ t: "move", unit: id, to: best.p });
}

/** Plays the active unit's whole turn and returns the commands, ending with endTurn (or escape). */
export function planTurn(start: BattleState): Command[] {
  const cmds: Command[] = [];
  let s = start;
  const id = activeUnit(s).id;
  const run = (c: Command) => { const r = applyCommand(s, c); if (r.ok) { s = r.state; cmds.push(c); return true; } return false; };
  if (activeUnit(s).escape !== "none") {
    escapeTurn(s, run, () => s);
    if (!s.winner && s.active === id) run({ t: "endTurn", unit: id });
    return cmds;
  }
  for (let i = 0; i < 8 && !s.winner && s.active === id; i++) {
    const plan = bestStep(s);
    if (plan.moveTo) run({ t: "move", unit: id, to: plan.moveTo });
    if (!plan.ability || !plan.target) break;
    if (!run({ t: "cast", unit: id, ability: plan.ability, target: plan.target })) break;
  }
  if (!s.winner && s.active === id) {
    // Spend leftover MP on the safest spot.
    const plan = bestStep({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, ap: 0 } : u)) });
    if (plan.moveTo) run({ t: "move", unit: id, to: plan.moveTo });
    run({ t: "endTurn", unit: id });
  }
  return cmds;
}
