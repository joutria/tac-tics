/* Placing the party before a fight: each party member may start on any free tile near where the party came in,
   never right next to a foe. Pure functions over the battle setup, so the placement is part of the save and replays
   the same way. An ambush skips this (the party is caught unready). */
import { manhattan, standable, tileAt, type Pos } from "../engine/grid";
import { createBattle, unitAt, type BattleSetup } from "../engine/state";

/** How far from the starting spots the party may spread, and how close to a foe nobody may start. */
export const DEPLOY = { reach: 2, foeGap: 3 };

const key = (p: Pos) => `${p.x},${p.y}`;

/** The tiles the party may start on (the starting spots always among them). */
export function deployZone(setup: BattleSetup, origin: Pos[] = partyStarts(setup)): Pos[] {
  const s = createBattle(setup);
  const foes = s.units.filter((u) => u.team === "foes");
  const heroes = new Set(s.units.filter((u) => u.team === "heroes" && !u.ward).map((u) => u.id));
  const out = new Map<string, Pos>();
  for (const p of origin) out.set(key(p), p);
  for (let y = 0; y < setup.map.h; y++) for (let x = 0; x < setup.map.w; x++) {
    const p = { x, y };
    if (out.has(key(p)) || !standable(tileAt(setup.map, p))) continue;
    if (!origin.some((o) => manhattan(o, p) <= DEPLOY.reach)) continue;
    if (foes.some((f) => manhattan(f.pos, p) < DEPLOY.foeGap + ((f.size ?? 1) - 1))) continue;
    const who = unitAt(s, p);
    if (who && !heroes.has(who.id)) continue;
    out.set(key(p), p);
  }
  return [...out.values()];
}

/** Where the party stands in the setup. */
export const partyStarts = (setup: BattleSetup): Pos[] => setup.units.filter((u) => u.team === "heroes" && !u.ward).map((u) => ({ ...u.pos }));

/** Moves a party member to a tile of the zone; if another party member stands there, the two swap places. Returns
    the setup unchanged when the move is not allowed. */
export function deployUnit(setup: BattleSetup, unitId: string, to: Pos, zone: Pos[]): BattleSetup {
  const me = setup.units.find((u) => u.id === unitId);
  if (!me || me.team !== "heroes" || me.ward || !zone.some((p) => p.x === to.x && p.y === to.y)) return setup;
  const other = setup.units.find((u) => u.id !== unitId && u.pos.x === to.x && u.pos.y === to.y);
  if (other && (other.team !== "heroes" || other.ward)) return setup;
  const from = { ...me.pos };
  return { ...setup, units: setup.units.map((u) => (u.id === unitId ? { ...u, pos: { ...to } } : other && u.id === other.id ? { ...u, pos: from } : u)) };
}
