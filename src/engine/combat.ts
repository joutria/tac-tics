/* Abilities in play: who can be targeted, how far an ability reaches, and how much it hurts.

   Damage = a roll inside the ability's range
            x (1 + Strength or Magic / 100)
            x height bonus   (+10% per level above the target, at most +30%)
            x direction      (+25% from behind, +10% from the side)
            x element wheel  (1.5 strong, 0.75 weak, 1.25 opposite)
            x critical       (5% chance, x1.5)
            x (1 - resistance % of the target to that element)
            x 0.75 if the attacker is Weakened
   rounded down, then a Shield on the target soaks what it can. Attacks always hit. Area attacks hit everyone in the area, allies included, but not the caster. */
import { ABILITIES, type Ability } from "../data/abilities";
import { elementMultiplier } from "../data/elements";
import { inside, manhattan, NEIGHBOURS, Pos, samePos, standable, tileAt } from "./grid";
import { rngInt, rngNext } from "./rng";
import { takenFactor } from "./escape";
import { absorb, addStatus, POISON_HEAL_FACTOR, removeStatus, statusOf, WEAKEN_FACTOR, type StatusId } from "./status";
import { hasLineOfSight } from "./sight";
import { chainBolt, touchTile, type TerrainFx, type TerrainHit } from "./terrain";
import { isFoe, unitAt, type BattleState, type Unit } from "./state";

export const CRIT_CHANCE = 0.05;
export const CRIT_MULT = 1.5;
export const DOWNED_TURNS = 2;
export const REVIVE_HP = 0.25;
/** A unit can be helped up this many times per battle; the next time it falls it is out for good. */
export const MAX_REVIVES = 2;
/** Each Help up costs this share of the unit's starting max HP, for the rest of the battle. */
export const REVIVE_MAX_HP_COST = 0.25;
export const PUSH_HIT = 3;

export interface Hit {
  unit: string;
  damage: number;
  heal: number;
  crit: boolean;
  downed: boolean;
  died: boolean;
  revived: boolean;
  rooted: boolean;
  pushedTo?: Pos;
  /** Max HP the unit lost for good by being helped up. */
  maxHpLost?: number;
  /** Damage a Shield soaked. */
  shielded?: number;
  /** Statuses this hit put on the unit, and ones it washed off. */
  statuses?: StatusId[];
  cleansed?: StatusId[];
  /** Dealt by the terrain rather than the ability itself: a barrel blast or a bolt chained through water. */
  source?: "blast" | "chain";
}

export const unitAbilities = (u: Unit) => [...u.abilities, "helpUp"];

/** Max reach after height: ranged abilities gain 1 per level above the target, lose 1 per level below. */
export function maxRange(s: BattleState, ab: Ability, from: Pos, to: Pos): number {
  if (ab.range[1] <= 1) return ab.range[1];
  const diff = (tileAt(s.map, from)?.h ?? 0) - (tileAt(s.map, to)?.h ?? 0);
  return Math.max(1, ab.range[1] + diff);
}

export function abilityAvailable(u: Unit, id: string): string | null {
  const ab = ABILITIES[id];
  if (!ab || !unitAbilities(u).includes(id)) return "unknown ability";
  if (u.ap < ab.ap) return "not enough AP";
  if (u.cooldowns[id]) return `on cooldown for ${u.cooldowns[id]} more turn(s)`;
  if ((u.usedThisTurn[id] ?? 0) >= ab.perTurn) return "already used this turn";
  return null;
}

/** Why a cast is not allowed, or null when it is. `from` lets the AI test casts from other tiles. */
export function castProblem(s: BattleState, u: Unit, id: string, target: Pos, from: Pos = u.pos): string | null {
  const avail = abilityAvailable(u, id);
  if (avail) return avail;
  const ab = ABILITIES[id]!;
  if (!inside(s.map, target)) return "outside the map";
  const d = manhattan(from, target);
  if (d < ab.range[0] || d > maxRange(s, ab, from, target)) return "out of range";
  const occupant = unitAt(s, target);
  const other = occupant && occupant.id !== u.id ? occupant : undefined;
  if (ab.los && d > 0 && !hasLineOfSight(s.map, from, target, (p) => {
    const o = unitAt(s, p);
    return !!o && o.life === "up" && o.id !== u.id && !samePos(p, target);
  })) return "no line of sight";
  switch (ab.target) {
    case "foe": if ((!other || !isFoe(u, other)) && !(tileAt(s.map, target)?.prop && (ab.damage || ab.push))) return "needs an enemy"; break;
    case "ally": { const t = samePos(target, from) ? u : other; if (!t || isFoe(u, t) || t.life !== "up") return "needs a standing ally"; break; }
    case "downedAlly": if (!other || isFoe(u, other) || other.life !== "downed") return "needs a downed ally"; break;
    case "emptyTile": {
      const tile = tileAt(s.map, target);
      if (!standable(tile) || occupant) return "needs an empty tile";
      break;
    }
    case "any": break;
  }
  return null;
}

export function areaTiles(ab: Ability, target: Pos): Pos[] {
  if (ab.area === "single") return [target];
  return [target, ...NEIGHBOURS.map((d) => ({ x: target.x + d.x, y: target.y + d.y }))];
}

/** Everything that changes the damage except the roll and the critical. */
export function damageFactor(s: BattleState, caster: Unit, target: Unit, ab: Ability, from: Pos = caster.pos): number {
  if (!ab.damage) return 0;
  const stat = ab.damage.stat === "str" ? caster.str : caster.mag;
  const up = (tileAt(s.map, from)?.h ?? 0) - (tileAt(s.map, target.pos)?.h ?? 0);
  const height = 1 + Math.min(0.3, Math.max(0, up) * 0.1);
  const res = (target.res[ab.element] ?? 0) / 100;
  const weak = statusOf(caster, "weaken") ? WEAKEN_FACTOR : 1;
  return (1 + stat / 100) * height * directionBonus(target, from) * elementMultiplier(ab.element, target.element) * (1 - res) * takenFactor(target) * weak;
}

/** Where the attack lands relative to the way the target faces. */
export function directionBonus(target: Unit, from: Pos): number {
  const f = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }[target.facing];
  const d = { x: from.x - target.pos.x, y: from.y - target.pos.y };
  const dot = f.x * d.x + f.y * d.y;
  const cross = Math.abs(f.x * d.y - f.y * d.x);
  if (dot > cross) return 1;          // in front
  if (-dot > cross) return 1.25;      // behind
  return dot === 0 && cross === 0 ? 1 : 1.1; // side
}

/** Damage window shown before acting (no critical). */
export function damagePreview(s: BattleState, caster: Unit, target: Unit, ab: Ability, from: Pos = caster.pos) {
  const f = damageFactor(s, caster, target, ab, from);
  return { min: Math.floor((ab.damage?.min ?? 0) * f), max: Math.floor((ab.damage?.max ?? 0) * f) };
}

/** Applies a cast to the state (which is already a private copy) and reports what happened. */
export function resolveCast(s: BattleState, caster: Unit, ab: Ability, target: Pos, fx: TerrainFx[] = []): Hit[] {
  const hits: Hit[] = [];
  const from = { ...caster.pos };
  if (ab.teleport) { caster.pos = { ...target }; return hits; }
  const ground: TerrainHit[] = [];
  const credit = (u: Unit, h: { downed: boolean; died: boolean }) => { if ((h.downed || h.died) && isFoe(caster, u)) caster.downs += 1; };
  const hurtByTerrain = (u: Unit, dmg: number, h: TerrainHit) => { hurt(u, dmg, h); credit(u, h); };
  for (const p of areaTiles(ab, target)) {
    touchTile(s, ab, from, p, fx, ground, hurtByTerrain);
    const u = unitAt(s, p);
    // An area attack hits allies caught in it, but never the one who casts it (so it can be used point-blank).
    if (!u || (u.id === caster.id && ab.damage)) continue;
    const hit: Hit = { unit: u.id, damage: 0, heal: 0, crit: false, downed: false, died: false, revived: false, rooted: false };
    if (ab.revive && u.life === "downed") {
      // Each revive leaves a scar: max HP drops by a quarter of the starting max, and the unit stands with a
      // quarter of what is left. Two revives at most; see hurt().
      const lost = Math.min(u.maxHp - 1, Math.round(u.baseHp * REVIVE_MAX_HP_COST));
      u.maxHp -= lost; hit.maxHpLost = lost;
      u.revives += 1;
      u.life = "up"; u.hp = Math.max(1, Math.ceil(u.maxHp * REVIVE_HP)); u.downedTurns = 0; hit.revived = true;
    }
    if (ab.heal && u.life === "up") {
      const [roll, rng] = rngInt(s.rng, ab.heal.min, ab.heal.max); s.rng = rng;
      const amount = statusOf(u, "poison") ? Math.floor(roll * POISON_HEAL_FACTOR) : roll;
      hit.heal = Math.min(amount, u.maxHp - u.hp); u.hp += hit.heal;
    }
    if (ab.damage) {
      let [roll, rng] = rngInt(s.rng, ab.damage.min, ab.damage.max); s.rng = rng;
      const [c, rng2] = rngNext(s.rng); s.rng = rng2;
      hit.crit = c < CRIT_CHANCE;
      const raw = Math.max(0, Math.floor(roll * damageFactor(s, caster, u, ab, from) * (hit.crit ? CRIT_MULT : 1)));
      hit.damage = absorb(u, raw);
      if (raw > hit.damage) hit.shielded = raw - hit.damage;
      hurt(u, hit.damage, hit);
    }
    if (ab.root && u.life === "up") { u.rooted = true; hit.rooted = true; }
    // Water puts out fire, on anyone it touches.
    if (ab.element === "water" && u.life === "up" && statusOf(u, "burn")) { removeStatus(u, "burn"); hit.cleansed = ["burn"]; }
    if (ab.status && u.life === "up" && addStatus(u, ab.status)) hit.statuses = [ab.status.id];
    if (ab.push && u.life === "up") push(s, u, from, ab.push, hit);
    credit(u, hit);
    hits.push(hit);
  }
  if (ab.element === "bolt" && ab.damage) chainBolt(s, caster, hits, fx, ground, hurtByTerrain);
  for (const g of ground) {
    hits.push({ unit: g.unit, damage: g.damage, heal: 0, crit: false, downed: g.downed, died: g.died, revived: false, rooted: false,
      source: g.source,
      ...(g.shielded ? { shielded: g.shielded } : {}), ...(g.burned ? { statuses: ["burn" as const] } : {}) });
  }
  return hits;
}

export function hurt(u: Unit, dmg: number, hit: Pick<Hit, "downed" | "died">) {
  if (dmg <= 0) return;
  if (u.life === "downed") { u.life = "dead"; hit.died = true; return; }
  u.hp -= dmg;
  if (u.hp <= 0) {
    u.hp = 0;
    // Already helped up the most times allowed: this fall is permanent.
    if (u.revives >= MAX_REVIVES) { u.life = "dead"; hit.died = true; return; }
    u.life = "downed"; u.downedTurns = DOWNED_TURNS; hit.downed = true;
  }
}

/** Shoves a unit straight away from `from`. Hitting a wall, a unit or a cliff costs PUSH_HIT per tile left. */
function push(s: BattleState, u: Unit, from: Pos, tiles: number, hit: Hit) {
  const dx = u.pos.x - from.x, dy = u.pos.y - from.y;
  const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  if (!step.x && !step.y) return;
  for (let i = 0; i < tiles; i++) {
    const n = { x: u.pos.x + step.x, y: u.pos.y + step.y };
    const here = tileAt(s.map, u.pos)!, next = tileAt(s.map, n);
    // Pushed units can be shoved down any drop, but never up a step.
    const free = standable(next) && !unitAt(s, n) && next.h <= here.h;
    if (!free) {
      const extra = PUSH_HIT * (tiles - i);
      hit.damage += Math.min(extra, u.hp);
      hurt(u, extra, hit);
      break;
    }
    u.pos = n;
    hit.pushedTo = { ...n };
  }
}

