/* The route map overlay, drawn in the battles' isometric pixel art: the region's run map as a small world of
   tiles. Each node is a raised tile with its icon over it, links are dirt trails, the rest is the region's
   scenery (grass and trees in the town, water and ice at the reservoir), and the hero stands on the last node
   finished. Built from the run seed, so it looks the same every time it opens. */
import { parseMap, type GridMap, type Pos, type Tile } from "../engine/grid";
import { rngInt, seedFrom } from "../engine/rng";
import type { RunMap } from "../run/map";

/** Grid spacing: columns of the run map 3 tiles apart, layers 3 tiles apart; a start row below the first layer. */
const COL_STEP = 3, LAYER_STEP = 3, MARGIN = 1;

export interface RouteGrid {
  map: GridMap;
  /** Tile of each node, by node id. */
  tileOf: Pos[];
  /** Where the hero stands before the first node. */
  start: Pos;
}

const SCENERY: Record<string, string[]> = {
  town: ["g0", "g0", "g0", "g0", "g0", "g0", "t0", "t0", "g1", "r0", "d0"],
  reservoir: ["w0", "w0", "w0", "w0", "g0", "g0", "i0", "t0", "r0"],
};
const cell = (c: string): Tile => parseMap("cell", [c]).tiles[0]!;

export function routeGrid(run: { map: RunMap; seed: string }, region: string): RouteGrid {
  const { layers, width, nodes } = run.map;
  const w = MARGIN * 2 + (width - 1) * COL_STEP + 1;
  const h = MARGIN * 2 + layers * LAYER_STEP + 1;
  let rng = seedFrom(`${run.seed}:${region}:routemap`);
  const roll = (a: number, b: number) => { let v: number; [v, rng] = rngInt(rng, a, b); return v; };
  const pool = SCENERY[region] ?? SCENERY.town!;
  const tiles: Tile[] = Array.from({ length: w * h }, () => cell(pool[roll(0, pool.length - 1)]!));
  const at = (p: Pos) => tiles[p.y * w + p.x]!;
  const set = (p: Pos, t: Tile) => { tiles[p.y * w + p.x] = t; };
  // Layer 0 near the bottom (high y), the boss at the top.
  const tileOf = nodes.map((n) => ({ x: MARGIN + n.col * COL_STEP, y: h - 1 - MARGIN - LAYER_STEP - n.layer * LAYER_STEP }));
  const start: Pos = { x: MARGIN + COL_STEP, y: h - 1 - MARGIN };
  // Trails: an L-shaped dirt path between linked nodes, first across, then up. Low ground, so nodes stand out.
  const trail = (a: Pos, b: Pos) => {
    const p = { ...a };
    const step = () => { const t = at(p); if (t.h <= 1) set(p, { terrain: t.terrain === "water" || t.terrain === "ice" ? "bridge" : "dirt", h: 0 }); };
    while (p.y !== b.y) { p.y += Math.sign(b.y - p.y); if (Math.abs(p.y - b.y) === Math.floor(LAYER_STEP / 2)) break; step(); }
    while (p.x !== b.x) { p.x += Math.sign(b.x - p.x); step(); }
    while (p.y !== b.y) { p.y += Math.sign(b.y - p.y); step(); }
  };
  for (const n of nodes) if (n.layer === 0) trail(start, tileOf[n.id]!);
  for (const n of nodes) for (const id of n.next) trail(tileOf[n.id]!, tileOf[id]!);
  // Clear the tiles right around each node (no tree in front of an icon), then raise the node itself.
  for (const n of nodes) {
    const p = tileOf[n.id]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h) continue;
      const t = at(q);
      if (t.terrain === "tree" || t.terrain === "rock") set(q, { terrain: "grass", h: 0 });
    }
    set(p, { terrain: n.kind === "boss" ? "rock" : "dirt", h: n.kind === "boss" ? 2 : 1 });
    if (n.kind === "boss") set(p, { terrain: "dirt", h: 2 });
  }
  set(start, { terrain: "dirt", h: 0 });
  return { map: { id: "route", w, h, tiles }, tileOf, start };
}
