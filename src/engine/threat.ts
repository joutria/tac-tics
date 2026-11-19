/* What a unit could do on its next turn: every tile it could walk to and hit from there. The battle screen uses
   this for the danger zone (where a foe can strike next turn) and for the foe info panel. It reads the same rules
   as the game itself, so the overlay never lies. */
import { ABILITIES, type Ability } from "../data/abilities";
import { maxRange } from "./combat";
import { inside, manhattan, Pos, samePos } from "./grid";
import { turnMp } from "./escape";
import { reachable } from "./movement";
import { hasLineOfSight } from "./sight";
import { BattleState, moveRules, unitAt, type Unit } from "./state";

const key = (p: Pos) => `${p.x},${p.y}`;

/** Damaging abilities the unit will have off cooldown when its next turn starts. */
export function readyAttacks(u: Unit): Ability[] {
  return u.abilities.map((id) => ABILITIES[id]!).filter((ab) => !!ab.damage && !u.cooldowns[ab.id] && ab.ap <= u.maxAp);
}

/** Tiles the unit can stand on next turn, its own tile included: the MP its next turn starts with (none if it is
    rooted, more or less when it is escaping), walking around other units. */
export function nextTurnSpots(s: BattleState, u: Unit): Pos[] {
  const walk = [...reachable(s.map, u.pos, { ...moveRules(s, u), mp: turnMp(u) }).keys()].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x: x!, y: y! };
  });
  return [{ ...u.pos }, ...walk];
}

/** Can `ab` cast from `from` reach `to`, with range, height and line of sight? Units other than `ignore` and the
    target block sight, as in the real cast check. */
export function abilityReaches(s: BattleState, ab: Ability, from: Pos, to: Pos, ignore: string): boolean {
  const d = manhattan(from, to);
  if (d < ab.range[0] || d > maxRange(s, ab, from, to)) return false;
  if (!ab.los || d === 0) return true;
  return hasLineOfSight(s.map, from, to, (p) => {
    const o = unitAt(s, p);
    return !!o && o.life === "up" && o.id !== ignore && !samePos(p, to);
  });
}

/** Every tile a unit could hit next turn (after walking), with the abilities that reach it. */
export function dangerZone(s: BattleState, u: Unit): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (u.life !== "up") return out;
  const spots = nextTurnSpots(s, u);
  for (const ab of readyAttacks(u)) {
    const reach = ab.range[1] + 3; // height can add up to 3 levels of reach
    for (const from of spots) {
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const to = { x: from.x + dx, y: from.y + dy };
        if (!inside(s.map, to)) continue;
        const k = key(to), list = out.get(k);
        if (list?.includes(ab.id)) continue;
        if (!abilityReaches(s, ab, from, to, u.id)) continue;
        if (list) list.push(ab.id); else out.set(k, [ab.id]);
      }
    }
  }
  return out;
}
