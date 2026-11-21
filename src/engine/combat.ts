/* Abilities in play: who can be targeted, how far an ability reaches, and how much it hurts.

   Damage = a roll inside the ability's range
            x (1 + Strength or Magic / 100)
            x height bonus   (+10% per level above the target, at most +30%)
            x direction      (+25% from behind, +10% from the side)
            x element wheel  (1.5 strong, 0.75 weak, 1.25 opposite)
            x critical       (5% chance, x1.5)
            x (1 - resistance % of the target to that element)
            x 0.75 if the attacker is Weakened
   rounded down, then a Shield on the target soaks what it can. Attacks always hit. Area attacks hit everyone in the area, allies included, but not the caster.

   Falls: a unit pushed down a drop takes damage for every level it falls (see fallDamage). Shove is free (0 AP),
   once a turn, for everyone, and cannot move heavy units such as bosses. */
import { ABILITIES, type Ability } from "../data/abilities";
import { elementMultiplier } from "../data/elements";
import { inside, manhattan, NEIGHBOURS, Pos, samePos, standable, tileAt, type Terrain } from "./grid";
import { rngInt, rngNext } from "./rng";
import { takenFactor } from "./escape";
import { absorb, addStatus, POISON_HEAL_FACTOR, removeStatus, STATUS, statusOf, WEAKEN_FACTOR, type StatusId } from "./status";
import { EXECUTIONER_FACTOR, GUARD_FACTOR } from "../data/jobs";
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
/** Fall damage per level dropped, before the pusher's Strength, the landing and the target's defences. */
export const FALL_PER_LEVEL = 4;
/** How hard the landing is. Grass is soft, ice is hard. */
export const LANDING: Partial<Record<Terrain, number>> = { grass: 0.85, ice: 1.25 };
/** Agility cuts fall damage by 1% per point, at most this share. */
export const FALL_AGI_CAP = 0.4;
/** A shove moves 2 tiles instead of 1 when the shover's Strength beats the target's by this much. */
export const SHOVE_STRONG = 10;

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
  /** Extra damage from a push: slamming into something, and falling down drops. */
  bump?: number;
  fall?: number;
  /** Levels fallen during a push. */
  fell?: number;
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

export const unitAbilities = (u: Unit) => [...u.abilities, "shove", "helpUp"];

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
    case "foe": if ((!other || !isFoe(u, other)) && !(tileAt(s.map, target)?.prop && (ab.damage || ab.push))) return "needs an enemy";
      if (ab.shove && other?.heavy) return "too heavy to shove";
      break;
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
  return (1 + stat / 100) * height * directionBonus(target, from) * elementMultiplier(ab.element, target.element) * (1 - res) * takenFactor(target) * weak
    * passiveFactor(s, caster, target);
}

/** Job passives: Executioner hits foes under half HP harder; Guard shields the allies standing next to it. */
function passiveFactor(s: BattleState, caster: Unit, target: Unit): number {
  let f = caster.passive === "executioner" && target.hp < target.maxHp / 2 ? EXECUTIONER_FACTOR : 1;
  const guarded = s.units.some((g) => g.passive === "guard" && g.id !== target.id && g.life === "up" && !isFoe(g, target)
    && Math.abs(g.pos.x - target.pos.x) + Math.abs(g.pos.y - target.pos.y) === 1);
  if (guarded) f *= GUARD_FACTOR;
  return f;
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
    if (!u || (u.id === caster.id && ab.damage) || (ab.alliesOnly && isFoe(caster, u))) continue;
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
    if (ab.cleanse && u.life === "up") {
      const bad = u.statuses.filter((x) => !STATUS[x.id].good).map((x) => x.id);
      for (const id of bad) removeStatus(u, id);
      if (bad.length) hit.cleansed = [...(hit.cleansed ?? []), ...bad];
    }
    if (ab.status && u.life === "up" && addStatus(u, ab.status)) hit.statuses = [ab.status.id];
    if (ab.push && u.life === "up") push(s, caster, u, from, ab.shove ? shoveDistance(caster, u) : ab.push, hit);
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

/** Tiles a Shove moves the target: 1, or 2 when the shover is much stronger. */
export const shoveDistance = (caster: Unit, target: Unit) => caster.str >= target.str + SHOVE_STRONG ? 2 : 1;

/** Damage for falling `levels` levels onto `land`. It grows with the drop, the pusher's Strength (which grows
    with level) and a hard landing, and shrinks with the target's Agility, its Stone resistance and job passives
    (Executioner on the pusher adds, a Guard next to the target cuts). */
export function fallDamage(s: BattleState, pusher: Unit, target: Unit, levels: number, land: Terrain): number {
  if (levels <= 0) return 0;
  const agi = 1 - Math.min(FALL_AGI_CAP, Math.max(0, target.agi) / 100);
  const res = 1 - (target.res.stone ?? 0) / 100;
  return Math.max(1, Math.floor(FALL_PER_LEVEL * levels * (1 + Math.max(0, pusher.str) / 100) * (LANDING[land] ?? 1) * agi * res
    * passiveFactor(s, pusher, target)));
}

/** Where a push would leave `u` and what it would cost, without changing anything. Straight away from `from`:
    hitting a wall, a unit or a step up costs PUSH_HIT per tile left; going down drops costs fall damage on landing. */
export function pushOutcome(s: BattleState, pusher: Unit, u: Unit, from: Pos, tiles: number): { to: Pos; bump: number; fall: number; fell: number } {
  const dx = u.pos.x - from.x, dy = u.pos.y - from.y;
  const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  let at = { ...u.pos }, fell = 0, bump = 0;
  if (!step.x && !step.y) return { to: at, bump, fall: 0, fell };
  for (let i = 0; i < tiles; i++) {
    const n = { x: at.x + step.x, y: at.y + step.y };
    const here = tileAt(s.map, at)!, next = tileAt(s.map, n);
    // Pushed units can be shoved down any drop, but never up a step.
    const other = unitAt(s, n);
    const free = standable(next) && (!other || other.id === u.id) && next.h <= here.h;
    if (!free) { bump = PUSH_HIT * (tiles - i); break; }
    fell += here.h - next.h;
    at = n;
  }
  return { to: at, bump, fall: fallDamage(s, pusher, u, fell, tileAt(s.map, at)!.terrain), fell };
}

function push(s: BattleState, pusher: Unit, u: Unit, from: Pos, tiles: number, hit: Hit) {
  const o = pushOutcome(s, pusher, u, from, tiles);
  if (!samePos(o.to, u.pos)) { u.pos = { ...o.to }; hit.pushedTo = { ...o.to }; }
  if (o.fell) hit.fell = o.fell;
  for (const [kind, dmg] of [["fall", o.fall], ["bump", o.bump]] as const) {
    if (!dmg || u.life !== "up") continue;
    const taken = absorb(u, dmg);
    if (dmg > taken) hit.shielded = (hit.shielded ?? 0) + dmg - taken;
    hit[kind] = taken;
    hit.damage += Math.min(taken, u.hp);
    hurt(u, taken, hit);
  }
}

/** Where things end up if `caster` uses `ab` on `target` now: units pushed and crates slid, with the damage a
    push into something adds, and barrels that would go off. Runs the cast on a copy; push results never depend
    on the roll, so this is exact for movement. */
export interface MovePreview { moves: { from: Pos; to: Pos; unit?: string; bump: number; fall: number; fell: number }[]; blasts: Pos[] }
export function previewEffects(s: BattleState, caster: Unit, ab: Ability, target: Pos): MovePreview {
  const copy = structuredClone(s);
  const me = copy.units.find((u) => u.id === caster.id)!;
  const before = new Map(copy.units.map((u) => [u.id, { ...u.pos }]));
  const fx: TerrainFx[] = [];
  const hits = resolveCast(copy, me, ab, target, fx);
  const out: MovePreview = { moves: [], blasts: fx.filter((f) => f.fx === "explode").map((f) => f.at) };
  if (ab.push) for (const h of hits) {
    const from = before.get(h.unit)!, to = h.pushedTo ?? from;
    if (h.unit === caster.id) continue;
    // A push stopped early by a wall, a unit or a step hurts PUSH_HIT per tile it could not travel; drops add a fall.
    out.moves.push({ from, to, unit: h.unit, bump: h.bump ?? 0, fall: h.fall ?? 0, fell: h.fell ?? 0 });
  }
  for (const f of fx) if (f.fx === "slide") out.moves.push({ from: f.at, to: f.to, bump: 0, fall: 0, fell: 0 });
  return out;
}
