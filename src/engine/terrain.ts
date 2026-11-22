/* Terrain the player can use (plan doc, "Interactive terrain"). Everything here is deterministic.

   - Fire sets grass and bridges alight for 2 rounds. A unit that ends a move or starts a turn in fire catches a
     Burn. Burnt grass becomes scorched dirt, which does not burn, until it grows back into grass: at once when a
     water attack hits it, or after REGROW_TICKS (3 rounds) next to water. A burnt bridge falls into the water once
     nobody stands on it. Fire on a tile that is already burning does not make it burn longer.
   - Crates and trees catch fire too. A burning crate or tree still blocks the way and sight; when the fire goes
     out the crate is ash and the tree a charred stump on scorched dirt, so the tile opens up.
   - Ice freezes water into a walkable path for 3 rounds. Fire melts it again; water and ice put fire out.
   - Bolt runs through water: a unit hit by a bolt attack while standing next to water passes half the damage to
     everyone else standing next to that same stretch of water (friends too).
   - Barrels blow up when hit: 10 damage and a Burn to everyone in the 3x3 around them, grass set alight, and any
     barrel in the blast goes off too.
   - Crates block movement and sight. Enough damage breaks them, and pushing abilities slide them.
   - Pushed objects hurt (slideOutcome): a crate or a rock that runs into a unit hits it (IMPACT, more for every
     tile rolled and level dropped), a barrel that runs into a unit or rolls off a ledge goes off. Rocks cannot
     be broken and roll from any push: small ones up to 6 tiles, medium 4, big 2 (ROCK); the bigger the rock, the
     harder it hits, and medium and big ones flatten crates on the way.

   Surfaces (Baldur's Gate research, "Surface reactions"):
   - Oil costs 1 extra MP to walk out of. Fire on it makes the whole puddle flare up: OIL_BLAST damage and a Burn
     to everyone within one tile of it, fire on the puddle, and grass around it catches. Barrels in the flare go off.
   - Sap poisons the party and feeds foes (Regen) when they end a move or start a turn in it. Fire burns it away
     to bare dirt; Light cleanses it. A Sap source grows the Sap by one tile a round, up to SAP_REACH tiles away.
   - Water a bolt goes through stays charged for 2 rounds: anyone who starts a turn next to it may be stunned.
     Water or Light calms it, ice freezes it, fire turns it to steam.
   - Fire on water makes steam, which blocks sight for a round.
   - Swimmers (src/engine/swim.ts): bolts chain to them, charged water shocks them more often, ice freezes them in,
     and the water puts out their Burn. */
import type { Ability } from "../data/abilities";
import { NEIGHBOURS, TERRAIN, cellsOf, coversPos, grassy, manhattan, placeLook, rockSizeOf, standable, tileAt, type Pos, type RockSize, type Tile } from "./grid";
import { rngNext } from "./rng";
import { absorb, addStatus } from "./status";
import type { BattleState, Unit } from "./state";
import { inWater, nativeSwimmer, SWIM_SHOCK_CHANCE } from "./swim";

export const FIRE_TICKS = 200;
export const ICE_TICKS = 300;
export const BLAST_DAMAGE = 10;
export const FIRE_BURN = { id: "burn", turns: 2, power: 3 } as const;
export const CHAIN_SHARE = 0.5;
export const OIL_BLAST = 6;
export const CHARGE_TICKS = 200;
export const STEAM_TICKS = 100;
/** Scorched ground next to water grows back into grass after this long (3 rounds). */
export const REGROW_TICKS = 300;
/** Chance that starting a turn next to charged water stuns. */
export const SHOCK_CHANCE = 0.35;
export const SAP_POISON = { id: "poison", turns: 2, power: 3 } as const;
export const SAP_REGEN = { id: "regen", turns: 2, power: 3 } as const;
/** How far from its source the Sap grows (Manhattan distance). */
export const SAP_REACH = 2;

export type TerrainFx =
  | { fx: "ignite" | "douse" | "freeze" | "melt" | "explode" | "break" | "flare" | "steam" | "charge" | "calm" | "cleanse" | "sink" | "impact" | "regrow"; at: Pos }
  | { fx: "slide"; at: Pos; to: Pos }
  | { fx: "chain"; at: Pos };

/** A hit dealt by the terrain (blast or chained bolt), in the same shape the battle reports any hit in. */
export interface TerrainHit { source: "blast" | "chain" | "impact"; unit: string; damage: number; downed: boolean; died: boolean; burned: boolean; shielded?: number }

const unitOn = (s: BattleState, p: Pos) => s.units.find((u) => (u.life === "up" || u.life === "downed") && coversPos(u.pos, u.size ?? 1, p));
/** The tiles under a unit (four for a giant). */
const under = (u: Unit) => cellsOf(u.pos, u.size ?? 1);
export const burning = (s: BattleState, t: Tile | undefined) => !!t && (t.fireUntil ?? 0) > s.clock;
export const charged = (s: BattleState, t: Tile | undefined) => !!t && t.terrain === "water" && (t.chargedUntil ?? 0) > s.clock;
/** What fire can catch on: grass, bridges, trees and crates (barrels go off instead). */
export const flammable = (t: Tile) => t.prop === "crate" || (!t.prop && (grassy(t) || t.terrain === "bridge" || t.terrain === "tree"));
const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

type Hurt = (u: Unit, dmg: number, h: TerrainHit) => void;

/** Fire reaching a tile (an ability, a blast or a flare): oil flares up, Sap burns away, grass and bridges catch. */
function burnTile(s: BattleState, p: Pos, fx: TerrainFx[], hits: TerrainHit[], hurt: Hurt, hitIds = new Set<string>()) {
  const t = tileAt(s.map, p);
  if (!t) return;
  if (t.surface === "oil") { flareOil(s, p, fx, hits, hurt, hitIds); return; }
  if (burning(s, t)) return;
  if (t.surface === "sap") {
    delete t.surface; delete t.sapSource;
    t.fireUntil = s.clock + FIRE_TICKS; if (grassy(t)) { t.terrain = "dirt"; t.scorchedAt = s.clock; }
    fx.push({ fx: "ignite", at: p }); return;
  }
  if (flammable(t)) { t.fireUntil = s.clock + FIRE_TICKS; fx.push({ fx: "ignite", at: p }); }
  else if (t.terrain === "water") steam(s, t, p, fx);
}

/** Scorched ground grows back into grass (a burnt tree's stump stays). */
function regrow(t: Tile) {
  delete t.scorchedAt;
  if (t.terrain === "dirt") t.terrain = "grass";
}

function steam(s: BattleState, t: Tile, p: Pos, fx: TerrainFx[]) {
  t.steamUntil = s.clock + STEAM_TICKS; delete t.chargedUntil;
  fx.push({ fx: "steam", at: p });
}

/** The oil puddle touching `p` (tiles next to each other, not diagonally). */
export function oilPuddle(s: BattleState, p: Pos): Pos[] {
  const out: Pos[] = [], seen = new Set<string>(), stack = [p];
  while (stack.length) {
    const q = stack.pop()!, k = `${q.x},${q.y}`;
    if (seen.has(k) || tileAt(s.map, q)?.surface !== "oil") continue;
    seen.add(k); out.push(q);
    for (const d of NEIGHBOURS) stack.push({ x: q.x + d.x, y: q.y + d.y });
  }
  return out;
}

/** Tiles a flare of the puddle at `p` reaches: the puddle and every tile next to it, diagonals too. */
export function flareArea(s: BattleState, p: Pos): Pos[] {
  const out: Pos[] = [], seen = new Set<string>();
  for (const o of oilPuddle(s, p)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const q = { x: o.x + dx, y: o.y + dy }, k = `${q.x},${q.y}`;
    if (!seen.has(k) && tileAt(s.map, q)) { seen.add(k); out.push(q); }
  }
  return out;
}

/** Oil catching fire: the whole puddle goes up. Each unit near it is hit once, however big the puddle. */
function flareOil(s: BattleState, p: Pos, fx: TerrainFx[], hits: TerrainHit[], hurt: Hurt, hitIds: Set<string>) {
  const puddle = oilPuddle(s, p), area = flareArea(s, p);
  for (const o of puddle) { const t = tileAt(s.map, o)!; delete t.surface; t.fireUntil = s.clock + FIRE_TICKS; fx.push({ fx: "flare", at: o }); }
  for (const q of area) {
    const t = tileAt(s.map, q)!;
    if (t.prop === "barrel") { explode(s, q, fx, hits, hurt); continue; }
    if (puddle.some((o) => o.x === q.x && o.y === q.y)) continue;
    burnTile(s, q, fx, hits, hurt, hitIds);
  }
  for (const u of s.units) {
    if (u.life !== "up" || hitIds.has(u.id) || !area.some((q) => coversPos(u.pos, u.size ?? 1, q))) continue;
    hitIds.add(u.id);
    const h: TerrainHit = { source: "blast", unit: u.id, damage: 0, downed: false, died: false, burned: false };
    const dealt = absorb(u, OIL_BLAST);
    if (dealt < OIL_BLAST) h.shielded = OIL_BLAST - dealt;
    h.damage = dealt; hurt(u, dealt, h);
    if (u.life === "up") h.burned = addStatus(u, { ...FIRE_BURN });
    hits.push(h);
  }
}

/** What an ability does to the ground and objects on one tile of its area. Runs before it hits the unit there. */
export function touchTile(s: BattleState, ab: Ability, from: Pos, p: Pos, fx: TerrainFx[], hits: TerrainHit[],
  hurt: (u: Unit, dmg: number, h: TerrainHit) => void, str = 0) {
  const t = tileAt(s.map, p);
  if (!t) return;
  if (t.prop === "barrel" && (ab.damage || ab.element === "fire")) { explode(s, p, fx, hits, hurt); return; }
  // Any push moves an object: crates and barrels as far as the push, rocks roll on.
  if (t.prop && ab.push && !ab.damage) { slideProp(s, from, p, ab.push, fx, hits, hurt, str); return; }
  if (t.prop === "rock") { if (ab.push) slideProp(s, from, p, ab.push, fx, hits, hurt, str); return; }
  if (t.prop === "crate") {
    if (ab.push) { slideProp(s, from, p, ab.push, fx, hits, hurt, str); return; }
    if (ab.damage) {
      t.propHp = (t.propHp ?? 0) - ab.damage.max;
      if (t.propHp <= 0) { delete t.prop; delete t.propHp; fx.push({ fx: "break", at: p }); return; }
    }
    if (ab.element === "fire") burnTile(s, p, fx, hits, hurt);
    else if ((ab.element === "water" || ab.element === "ice") && burning(s, t)) { delete t.fireUntil; fx.push({ fx: "douse", at: p }); }
    return;
  }
  if (ab.element === "fire") {
    if (t.terrain === "ice") {
      if (!unitOn(s, p)) { t.terrain = "water"; delete t.thawAt; fx.push({ fx: "melt", at: p }); }
    } else burnTile(s, p, fx, hits, hurt);
  } else if ((ab.element === "water" || ab.element === "ice") && burning(s, t)) {
    delete t.fireUntil; fx.push({ fx: "douse", at: p });
  }
  if ((ab.element === "water" || ab.element === "light") && charged(s, t)) { delete t.chargedUntil; fx.push({ fx: "calm", at: p }); }
  if (ab.element === "water" && t.scorchedAt !== undefined && !burning(s, t)) { regrow(t); fx.push({ fx: "regrow", at: p }); }
  if (ab.element === "light" && t.surface === "sap") { delete t.surface; delete t.sapSource; fx.push({ fx: "cleanse", at: p }); }
  if (ab.element === "bolt" && ab.damage && t.terrain === "water" && !charged(s, t)) { t.chargedUntil = s.clock + CHARGE_TICKS; fx.push({ fx: "charge", at: p }); }
  if (ab.element === "ice" && t.terrain === "water") {
    t.terrain = "ice"; t.thawAt = s.clock + ICE_TICKS; delete t.chargedUntil; delete t.steamUntil; fx.push({ fx: "freeze", at: p });
    // A swimmer there is frozen in: it cannot move on its next turn (the ice waits for it to leave before thawing).
    const swimmer = unitOn(s, p);
    if (swimmer && swimmer.life === "up" && !nativeSwimmer(swimmer)) swimmer.rooted = true;
  }
}

export function explode(s: BattleState, at: Pos, fx: TerrainFx[], hits: TerrainHit[], hurt: (u: Unit, dmg: number, h: TerrainHit) => void) {
  const t = tileAt(s.map, at)!;
  delete t.prop; delete t.propHp;
  fx.push({ fx: "explode", at });
  const blasted = new Set<string>(); // a giant under several tiles of the blast is hit once
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const p = { x: at.x + dx, y: at.y + dy };
    const q = tileAt(s.map, p);
    if (!q) continue;
    if (q.prop === "barrel") { explode(s, p, fx, hits, hurt); continue; }
    if (q.prop === "crate") { delete q.prop; delete q.propHp; fx.push({ fx: "break", at: p }); }
    if (q.terrain !== "water") burnTile(s, p, fx, hits, hurt);
    const u = unitOn(s, p);
    if (!u || blasted.has(u.id)) continue;
    blasted.add(u.id);
    const h: TerrainHit = { source: "blast", unit: u.id, damage: 0, downed: false, died: false, burned: false };
    const dealt = absorb(u, BLAST_DAMAGE);
    if (dealt < BLAST_DAMAGE) h.shielded = BLAST_DAMAGE - dealt;
    h.damage = dealt; hurt(u, dealt, h);
    if (u.life === "up") h.burned = addStatus(u, { ...FIRE_BURN });
    hits.push(h);
  }
}

/** How hard a pushed crate hits a unit in its way: a base, plus some for every tile it rolled and every level it
    dropped on the way, times (1 + the pusher's Strength / 100). Rocks hit by their size (ROCK); barrels go off
    instead (BLAST_DAMAGE). */
export const IMPACT = {
  crate: { base: 6, perTile: 1, perLevel: 2 },
} as const;
/** Rocks by size: how far a push sends one rolling (whatever pushed it), how hard it hits a unit in its way, and
    whether it flattens a crate and rolls on (a smaller one stops against it). */
export const ROCK: Record<RockSize, { roll: number; base: number; perTile: number; perLevel: number; crushes: boolean }> = {
  s: { roll: 6, base: 5, perTile: 1, perLevel: 2, crushes: false },
  m: { roll: 4, base: 9, perTile: 2, perLevel: 3, crushes: true },
  l: { roll: 2, base: 13, perTile: 3, perLevel: 4, crushes: true },
};
/** The furthest any rock rolls. */
export const ROCK_ROLL = ROCK.s.roll;

/** Where a pushed object would go and what it would hit, without changing anything. Straight away from `from`, down
    any drop but never up a step. A crate or a barrel moves as far as the push; a rock keeps rolling (ROCK_ROLL).
    It stops at the first unit in its way and hits it; water swallows it; a barrel it runs into goes off. */
export function slideOutcome(s: BattleState, from: Pos, at: Pos, tiles: number, str = 0) {
  const t0 = tileAt(s.map, at)!, kind = t0.prop!;
  const dx = at.x - from.x, dy = at.y - from.y;
  const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  const out: { kind: typeof kind; to: Pos; rolled: number; dropped: number; unit?: string; damage: number; sinks: boolean; barrel?: Pos; crushes?: Pos } =
    { kind, to: at, rolled: 0, dropped: 0, damage: 0, sinks: false };
  if (!step.x && !step.y) return out;
  const size = rockSizeOf(t0), rock = ROCK[size];
  const reach = kind === "rock" ? rock.roll : tiles;
  let cur = at;
  for (let i = 0; i < reach; i++) {
    const n = { x: cur.x + step.x, y: cur.y + step.y };
    const here = tileAt(s.map, cur)!, next = tileAt(s.map, n);
    if (!next || next.h > here.h) break;
    const v = unitOn(s, n);
    if (v) {
      out.unit = v.id;
      if (kind !== "barrel") {
        const f = kind === "rock" ? rock : IMPACT.crate;
        out.damage = Math.max(1, Math.floor((f.base + f.perTile * out.rolled + f.perLevel * (out.dropped + here.h - next.h)) * (1 + Math.max(0, str) / 100)));
      }
      break;
    }
    if (next.prop === "barrel" && kind !== "barrel") { out.barrel = n; break; }
    // A rock flattens a crate in its way and rolls on.
    if (next.prop === "crate" && kind === "rock" && rock.crushes) { out.crushes = n; break; }
    if (next.prop || !TERRAIN[next.terrain].walkable && next.terrain !== "water") break;
    out.dropped += here.h - next.h; out.rolled += 1; cur = n;
    if (next.terrain === "water") { out.sinks = true; break; }
  }
  out.to = cur;
  return out;
}

/** A burning crate carries its fire when it moves: take it off the old tile... */
export function takeFire(s: BattleState, t: Tile): number | undefined {
  if (t.prop !== "crate" || !burning(s, t)) return undefined;
  const until = t.fireUntil; delete t.fireUntil; return until;
}
/** ...and light the tile it lands on (water puts it out). */
export function giveFire(t: Tile, until: number | undefined) {
  if (until !== undefined && t.terrain !== "water" && t.prop === "crate") t.fireUntil = Math.max(t.fireUntil ?? 0, until);
}

/** Pushes an object (see slideOutcome). The unit it hits takes the impact through its Shield; a crate takes the same
    and may break; a barrel goes off where it stops if it hit a unit or fell a level or more. */
function slideProp(s: BattleState, from: Pos, at: Pos, tiles: number, fx: TerrainFx[], hits: TerrainHit[], hurt: Hurt, str: number) {
  const o = slideOutcome(s, from, at, tiles, str);
  const src = tileAt(s.map, at)!, hp = src.propHp, fire = takeFire(s, src), look = src.look ?? placeLook(at), size = src.rockSize;
  delete src.prop; delete src.propHp; delete src.look; delete src.rockSize;
  if (o.rolled) fx.push({ fx: "slide", at, to: o.to });
  const end = tileAt(s.map, o.to)!;
  if (o.sinks) { fx.push({ fx: "sink", at: o.to }); return; }
  end.prop = o.kind; end.propHp = hp; end.look = look; giveFire(end, fire);
  if (size) end.rockSize = size;
  if (o.barrel) explode(s, o.barrel, fx, hits, hurt);
  if (o.crushes) { const c = tileAt(s.map, o.crushes)!; delete c.prop; delete c.propHp; fx.push({ fx: "break", at: o.crushes }); }
  if (o.kind === "barrel") {
    if (o.unit || o.dropped > 0) explode(s, o.to, fx, hits, hurt);
    return;
  }
  if (!o.unit) return;
  const u = s.units.find((x) => x.id === o.unit)!;
  const h: TerrainHit = { source: "impact", unit: u.id, damage: 0, downed: false, died: false, burned: false };
  const dealt = absorb(u, o.damage);
  if (dealt < o.damage) h.shielded = o.damage - dealt;
  const before = u.hp;
  hurt(u, dealt, h);
  h.damage = before - u.hp;
  hits.push(h);
  fx.push({ fx: "impact", at: u.pos });
  if (o.kind === "crate") {
    end.propHp = (end.propHp ?? 0) - o.damage;
    if (end.propHp <= 0) { delete end.prop; delete end.propHp; fx.push({ fx: "break", at: o.to }); }
  }
}

/** Bolt through water: units next to the same stretch of water as a unit the bolt hit take a share of that hit. */
export function chainBolt(s: BattleState, caster: Unit, struck: { unit: string; damage: number }[], fx: TerrainFx[], hits: TerrainHit[],
  hurt: (u: Unit, dmg: number, h: TerrainHit) => void) {
  const done = new Set([caster.id, ...struck.map((h) => h.unit)]);
  for (const first of struck) {
    if (first.damage <= 0) continue;
    const u = s.units.find((x) => x.id === first.unit)!;
    const water = under(u).flatMap((c) => waterBody(s, c)).filter((w, i, all) => all.findIndex((v) => v.x === w.x && v.y === w.y) === i);
    if (!water.length) continue;
    // The bolt leaves the water it ran through charged.
    if (!water.some((w) => charged(s, tileAt(s.map, w)))) fx.push({ fx: "charge", at: water[0]! });
    for (const w of water) tileAt(s.map, w)!.chargedUntil = s.clock + CHARGE_TICKS;
    const share = Math.floor(first.damage * CHAIN_SHARE);
    for (const o of s.units) {
      if (done.has(o.id) || o.life !== "up") continue;
        // Next to the water, or swimming in it.
      if (!water.some((w) => under(o).some((c) => Math.abs(w.x - c.x) + Math.abs(w.y - c.y) <= 1))) continue;
      done.add(o.id);
      const h: TerrainHit = { source: "chain", unit: o.id, damage: 0, downed: false, died: false, burned: false };
      h.damage = absorb(o, share);
      if (h.damage < share) h.shielded = share - h.damage;
      hurt(o, h.damage, h);
      hits.push(h);
      fx.push({ fx: "chain", at: { ...o.pos } });
    }
  }
}

/** Every water tile connected to the water next to `p` (or to `p` itself, for a swimmer). */
function waterBody(s: BattleState, p: Pos): Pos[] {
  const seen = new Set<string>(), out: Pos[] = [];
  const stack = [p, ...NEIGHBOURS.map((d) => ({ x: p.x + d.x, y: p.y + d.y }))].filter((q) => tileAt(s.map, q)?.terrain === "water");
  while (stack.length) {
    const q = stack.pop()!, k = `${q.x},${q.y}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(q);
    for (const d of NEIGHBOURS) { const n = { x: q.x + d.x, y: q.y + d.y }; if (tileAt(s.map, n)?.terrain === "water") stack.push(n); }
  }
  return out;
}

/** Fire going out and ice thawing, as the timeline moves on. A tile someone stands on waits until they leave. */
export function updateTiles(s: BattleState) {
  for (let i = 0; i < s.map.tiles.length; i++) {
    const t = s.map.tiles[i]!;
    const p = { x: i % s.map.w, y: Math.floor(i / s.map.w) };
    if (t.fireUntil !== undefined && t.fireUntil <= s.clock) {
      if (t.terrain === "bridge") {
        if (unitOn(s, p)) continue;
        t.terrain = "water";
      } else if (t.prop === "crate") { delete t.prop; delete t.propHp; if (grassy(t)) { t.terrain = "dirt"; t.scorchedAt = s.clock; } }
      else if (t.terrain === "tree") { t.terrain = "dirt"; t.scorchedAt = s.clock; t.deco = "stump"; }
      else if (grassy(t)) { t.terrain = "dirt"; t.scorchedAt = s.clock; }
      delete t.fireUntil;
    }
    if (t.thawAt !== undefined && t.thawAt <= s.clock && !unitOn(s, p)) { t.terrain = "water"; delete t.thawAt; }
    if (t.chargedUntil !== undefined && (t.chargedUntil <= s.clock || t.terrain !== "water")) delete t.chargedUntil;
    if (t.steamUntil !== undefined && t.steamUntil <= s.clock) delete t.steamUntil;
    if (t.scorchedAt !== undefined && !burning(s, t) && s.clock - t.scorchedAt >= REGROW_TICKS
      && NEIGHBOURS.some((d) => tileAt(s.map, { x: p.x + d.x, y: p.y + d.y })?.terrain === "water")) regrow(t);
  }
  growSap(s);
}

/** Once a round, each Sap source spreads the Sap to the nearest free ground within SAP_REACH tiles. */
function growSap(s: BattleState) {
  const round = Math.floor(s.clock / 100);
  if (round <= (s.sapRound ?? 0)) return;
  s.sapRound = round;
  const free = (q: Pos) => { const t = tileAt(s.map, q); return !!t && TERRAIN[t.terrain].walkable && t.terrain !== "ice" && t.terrain !== "bridge" && !t.prop && !t.surface && !burning(s, t); };
  for (let i = 0; i < s.map.tiles.length; i++) {
    if (!s.map.tiles[i]!.sapSource) continue;
    const src = { x: i % s.map.w, y: Math.floor(i / s.map.w) };
    let best: Pos | undefined;
    for (let dy = -SAP_REACH; dy <= SAP_REACH; dy++) for (let dx = -SAP_REACH; dx <= SAP_REACH; dx++) {
      const q = { x: src.x + dx, y: src.y + dy };
      if (manhattan(q, src) > SAP_REACH || !free(q) || !NEIGHBOURS.some((d) => tileAt(s.map, { x: q.x + d.x, y: q.y + d.y })?.surface === "sap")) continue;
      if (!best || manhattan(q, src) < manhattan(best, src)) best = q;
    }
    if (best) tileAt(s.map, best)!.surface = "sap";
  }
}

/** Starting a turn next to charged water: a SHOCK_CHANCE roll to be stunned (in it: SWIM_SHOCK_CHANCE). True when it stuns. */
export function shockNear(s: BattleState, u: Unit): boolean {
  if (u.life !== "up") return false;
  const inside = under(u).some((c) => charged(s, tileAt(s.map, c)));
  if (!inside && !under(u).some((c) => NEIGHBOURS.some((d) => charged(s, tileAt(s.map, { x: c.x + d.x, y: c.y + d.y }))))) return false;
  const [roll, rng] = rngNext(s.rng); s.rng = rng;
  return roll < (inside ? SWIM_SHOCK_CHANCE : SHOCK_CHANCE) && addStatus(u, { id: "stun", turns: 1, power: 0 });
}

/** Swimming puts out a Burn. True when it did. */
export function soak(s: BattleState, u: Unit): boolean {
  if (u.life !== "up" || !inWater(s.map, u) || !u.statuses.some((x) => x.id === "burn")) return false;
  u.statuses = u.statuses.filter((x) => x.id !== "burn");
  return true;
}

/** Standing in Sap: Poison for the party, Regen for foes. Returns what it gave, if it took. */
export function sapUnder(s: BattleState, u: Unit): "poison" | "regen" | null {
  if (u.life !== "up" || !under(u).some((c) => tileAt(s.map, c)?.surface === "sap")) return null;
  const st = u.team === "heroes" ? SAP_POISON : SAP_REGEN;
  return addStatus(u, { ...st }) ? st.id : null;
}

/** Standing in fire: a Burn. True when it took. */
export function fireUnder(s: BattleState, u: Unit): boolean {
  return u.life === "up" && under(u).some((c) => burning(s, tileAt(s.map, c))) && addStatus(u, { ...FIRE_BURN });
}
