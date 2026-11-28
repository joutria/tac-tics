/* Levers, gates and drawbridges (plan doc, "Interactive terrain": levers, doors, bridges). A map can link tiles in
   numbered groups. Pulling a lever (the shared quick action Pull, from a tile next to it) flips every gate and
   drawbridge of its group, and the lever itself:
   - a gate closed is iron bars (prop "gate"): nobody walks through, but sight and spells pass. Open, it is floor.
   - a drawbridge raised leaves open water; lowered, it is a bridge (which burns like any bridge).
   A gate or drawbridge with someone on it stays as it is: a gate does not shut on a body, a bridge does not rise
   under one. Like everything in the engine, this is deterministic. Foes pull levers too (ai.ts leverValue): the
   cautious ones to cut the party off, the bruisers to open a way to it. */
import { tileAt, type GridMap, type Pos, PROP_HP } from "./grid";
import type { BattleState } from "./state";
import type { TerrainFx } from "./terrain";

/** Every tile of a map in a link group, with its position. */
export function linked(m: GridMap, group: number): Pos[] {
  const out: Pos[] = [];
  m.tiles.forEach((t, i) => { if (t.link?.group === group && t.link.kind !== "lever") out.push({ x: i % m.w, y: Math.floor(i / m.w) }); });
  return out;
}

/** Does this map have any lever? (The Pull action only shows where there is something to pull.) */
export const hasLevers = (m: GridMap) => m.tiles.some((t) => t.link?.kind === "lever");

/** Why a lever cannot be pulled (null when it can). */
export function pullProblem(s: BattleState, at: Pos): string | null {
  const t = tileAt(s.map, at);
  if (t?.link?.kind !== "lever") return "needs a lever";
  return null;
}

const occupied = (s: BattleState, p: Pos) =>
  s.units.some((u) => (u.life === "up" || u.life === "downed") && p.x >= u.pos.x && p.y >= u.pos.y && p.x < u.pos.x + (u.size ?? 1) && p.y < u.pos.y + (u.size ?? 1));

/** Pulls the lever at `at`: flips it and every free gate and drawbridge of its group. */
export function pullLever(s: BattleState, at: Pos, fx: TerrainFx[]) {
  const lever = tileAt(s.map, at);
  if (lever?.link?.kind !== "lever") return;
  lever.link.open = !lever.link.open;
  fx.push({ fx: "pull", at });
  for (const p of linked(s.map, lever.link.group)) {
    const t = tileAt(s.map, p)!, link = t.link!;
    if (occupied(s, p)) continue;
    // A burnt bridge is gone into the water for good; nothing left to raise or lower.
    if (link.kind === "drawbridge" && t.terrain !== "bridge" && t.terrain !== "water") continue;
    link.open = !link.open;
    if (link.kind === "gate") {
      if (link.open) { delete t.prop; delete t.propHp; }
      else { t.prop = "gate"; t.propHp = PROP_HP.gate; }
    } else {
      t.terrain = link.open ? "bridge" : "water";
      delete t.fireUntil; delete t.chargedUntil; delete t.steamUntil; delete t.thawAt;
    }
    fx.push({ fx: link.kind === "gate" ? (link.open ? "gateOpen" : "gateShut") : (link.open ? "bridgeDown" : "bridgeUp"), at: p });
  }
}
