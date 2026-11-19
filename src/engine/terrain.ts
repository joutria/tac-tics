/* Terrain the player can use (plan doc, "Interactive terrain"). Everything here is deterministic.

   - Fire sets grass and bridges alight for 2 rounds. A unit that ends a move or starts a turn in fire catches a
     Burn. Burnt grass becomes dirt; a burnt bridge falls into the water once nobody stands on it.
   - Ice freezes water into a walkable path for 3 rounds. Fire melts it again; water and ice put fire out.
   - Bolt runs through water: a unit hit by a bolt attack while standing next to water passes half the damage to
     everyone else standing next to that same stretch of water (friends too).
   - Barrels blow up when hit: 10 damage and a Burn to everyone in the 3x3 around them, grass set alight, and any
     barrel in the blast goes off too.
   - Crates block movement and sight. Enough damage breaks them, and pushing abilities slide them. */
import type { Ability } from "../data/abilities";
import { NEIGHBOURS, standable, tileAt, type Pos, type Tile } from "./grid";
import { absorb, addStatus } from "./status";
import type { BattleState, Unit } from "./state";

export const FIRE_TICKS = 200;
export const ICE_TICKS = 300;
export const BLAST_DAMAGE = 10;
export const FIRE_BURN = { id: "burn", turns: 2, power: 3 } as const;
export const CHAIN_SHARE = 0.5;

export type TerrainFx =
  | { fx: "ignite" | "douse" | "freeze" | "melt" | "explode" | "break"; at: Pos }
  | { fx: "slide"; at: Pos; to: Pos }
  | { fx: "chain"; at: Pos };

/** A hit dealt by the terrain (blast or chained bolt), in the same shape the battle reports any hit in. */
export interface TerrainHit { source: "blast" | "chain"; unit: string; damage: number; downed: boolean; died: boolean; burned: boolean; shielded?: number }

const unitOn = (s: BattleState, p: Pos) => s.units.find((u) => (u.life === "up" || u.life === "downed") && u.pos.x === p.x && u.pos.y === p.y);
export const burning = (s: BattleState, t: Tile | undefined) => !!t && (t.fireUntil ?? 0) > s.clock;

/** What an ability does to the ground and objects on one tile of its area. Runs before it hits the unit there. */
export function touchTile(s: BattleState, ab: Ability, from: Pos, p: Pos, fx: TerrainFx[], hits: TerrainHit[],
  hurt: (u: Unit, dmg: number, h: TerrainHit) => void) {
  const t = tileAt(s.map, p);
  if (!t) return;
  if (t.prop === "barrel" && (ab.damage || ab.element === "fire")) { explode(s, p, fx, hits, hurt); return; }
  if (t.prop === "crate") {
    if (ab.push) { slideCrate(s, from, p, ab.push, fx); return; }
    if (ab.damage || ab.element === "fire") {
      t.propHp = (t.propHp ?? 0) - (ab.element === "fire" ? 99 : ab.damage!.max);
      if (t.propHp <= 0) { delete t.prop; delete t.propHp; fx.push({ fx: "break", at: p }); }
    }
    return;
  }
  if (ab.element === "fire") {
    if (t.terrain === "ice") {
      if (!unitOn(s, p)) { t.terrain = "water"; delete t.thawAt; fx.push({ fx: "melt", at: p }); }
    } else if (t.terrain === "grass" || t.terrain === "bridge") { t.fireUntil = s.clock + FIRE_TICKS; fx.push({ fx: "ignite", at: p }); }
  } else if ((ab.element === "water" || ab.element === "ice") && burning(s, t)) {
    delete t.fireUntil; fx.push({ fx: "douse", at: p });
  }
  if (ab.element === "ice" && t.terrain === "water") { t.terrain = "ice"; t.thawAt = s.clock + ICE_TICKS; fx.push({ fx: "freeze", at: p }); }
}

function explode(s: BattleState, at: Pos, fx: TerrainFx[], hits: TerrainHit[], hurt: (u: Unit, dmg: number, h: TerrainHit) => void) {
  const t = tileAt(s.map, at)!;
  delete t.prop; delete t.propHp;
  fx.push({ fx: "explode", at });
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const p = { x: at.x + dx, y: at.y + dy };
    const q = tileAt(s.map, p);
    if (!q) continue;
    if (q.prop === "barrel") { explode(s, p, fx, hits, hurt); continue; }
    if (q.prop === "crate") { delete q.prop; delete q.propHp; fx.push({ fx: "break", at: p }); }
    if (q.terrain === "grass" || q.terrain === "bridge") { q.fireUntil = s.clock + FIRE_TICKS; fx.push({ fx: "ignite", at: p }); }
    const u = unitOn(s, p);
    if (!u) continue;
    const h: TerrainHit = { source: "blast", unit: u.id, damage: 0, downed: false, died: false, burned: false };
    const dealt = absorb(u, BLAST_DAMAGE);
    if (dealt < BLAST_DAMAGE) h.shielded = BLAST_DAMAGE - dealt;
    h.damage = dealt; hurt(u, dealt, h);
    if (u.life === "up") h.burned = addStatus(u, { ...FIRE_BURN });
    hits.push(h);
  }
}

function slideCrate(s: BattleState, from: Pos, at: Pos, tiles: number, fx: TerrainFx[]) {
  const dx = at.x - from.x, dy = at.y - from.y;
  const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  if (!step.x && !step.y) return;
  let cur = at;
  for (let i = 0; i < tiles; i++) {
    const n = { x: cur.x + step.x, y: cur.y + step.y };
    const here = tileAt(s.map, cur)!, next = tileAt(s.map, n);
    if (!standable(next) || unitOn(s, n) || next.h > here.h) break;
    next.prop = here.prop; next.propHp = here.propHp; delete here.prop; delete here.propHp;
    cur = n;
  }
  if (cur !== at) fx.push({ fx: "slide", at, to: cur });
}

/** Bolt through water: units next to the same stretch of water as a unit the bolt hit take a share of that hit. */
export function chainBolt(s: BattleState, caster: Unit, struck: { unit: string; damage: number }[], fx: TerrainFx[], hits: TerrainHit[],
  hurt: (u: Unit, dmg: number, h: TerrainHit) => void) {
  const done = new Set([caster.id, ...struck.map((h) => h.unit)]);
  for (const first of struck) {
    if (first.damage <= 0) continue;
    const u = s.units.find((x) => x.id === first.unit)!;
    const water = waterBody(s, u.pos);
    if (!water.length) continue;
    const share = Math.floor(first.damage * CHAIN_SHARE);
    for (const o of s.units) {
      if (done.has(o.id) || o.life !== "up") continue;
      if (!water.some((w) => Math.abs(w.x - o.pos.x) + Math.abs(w.y - o.pos.y) === 1)) continue;
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

/** Every water tile connected to the water next to `p`. */
function waterBody(s: BattleState, p: Pos): Pos[] {
  const seen = new Set<string>(), out: Pos[] = [];
  const stack = NEIGHBOURS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((q) => tileAt(s.map, q)?.terrain === "water");
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
      } else if (t.terrain === "grass") t.terrain = "dirt";
      delete t.fireUntil;
    }
    if (t.thawAt !== undefined && t.thawAt <= s.clock && !unitOn(s, p)) { t.terrain = "water"; delete t.thawAt; }
  }
}

/** Standing in fire: a Burn. True when it took. */
export function fireUnder(s: BattleState, u: Unit): boolean {
  return u.life === "up" && burning(s, tileAt(s.map, u.pos)) && addStatus(u, { ...FIRE_BURN });
}
