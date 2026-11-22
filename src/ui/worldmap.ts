/* The route map overlay, drawn in the battles' isometric pixel art: the region's run map as a small floating
   island of tiles. The island runs straight up the screen (the start at the bottom, the boss at the top) with the
   run map's columns side by side, so it reads like a path map and fits a phone held upright. Each node is a raised
   tile with its icon over it, links are dirt trails, the rest is the region's scenery (grass and trees in the
   town, water and ice at the reservoir), and the hero stands on the last node finished. Built from the run seed,
   so it looks the same every time it opens. */
import { parseMap, type GridMap, type Pos, type Tile } from "../engine/grid";
import { rngInt, seedFrom } from "../engine/rng";
import type { RunMap } from "../run/map";

/* Layout in screen terms: s = x - y runs left to right (one step is half a tile across), t = x + y runs down the
   screen (one step is half a tile down). Columns sit COL_STEP apart in s, layers LAYER_STEP apart in t. Both are
   even, so every node lands on a whole tile. */
const COL_STEP = 2, LAYER_STEP = 4;
/** Scenery on each side of the outer columns, and above the boss and below the start, in steps of s and t. */
const SIDE = 3, END = 2;

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
  const half = ((width - 1) * COL_STEP) / 2;
  const sMax = half + SIDE;
  // The boss sits END below the top edge; the start one layer below layer 0.
  const tOf = (layer: number) => END + (layers - 1 - layer) * LAYER_STEP;
  const tMax = tOf(-1) + END;
  // Grid coordinates from (s, t): x = (s + t) / 2 + off, y = (t - s) / 2 + off.
  const off = Math.ceil(sMax / 2);
  const n = Math.ceil((sMax + tMax) / 2) + off + 1;
  const toPos = (s: number, t: number): Pos => ({ x: (s + t) / 2 + off, y: (t - s) / 2 + off });
  const sOf = (col: number) => col * COL_STEP - half;
  let rng = seedFrom(`${run.seed}:${region}:routemap`);
  const roll = (a: number, b: number) => { let v: number; [v, rng] = rngInt(rng, a, b); return v; };
  const pool = SCENERY[region] ?? SCENERY.town!;
  // Tiles outside the island are kept (the rules expect a full grid) but marked off the map, so they are not drawn.
  const tiles: Tile[] = Array.from({ length: n * n }, (_, i) => {
    const x = i % n, y = Math.floor(i / n), s = x - y, t = x + y - 2 * off;
    const inside = Math.abs(s) <= sMax && t >= 0 && t <= tMax;
    return inside ? cell(pool[roll(0, pool.length - 1)]!) : { terrain: "grass", h: 0, offMap: true };
  });
  const at = (p: Pos) => tiles[p.y * n + p.x]!;
  const set = (p: Pos, t: Tile) => { tiles[p.y * n + p.x] = t; };
  const tileOf = nodes.map((nd) => toPos(sOf(nd.col), tOf(nd.layer)));
  const start = toPos(0, tOf(-1));
  // Trails: the straightest run of tiles between linked nodes (one step across or down at a time). Low ground, so
  // the nodes stand out. The run map's links never cross, so neither do the trails.
  const trail = (a: Pos, b: Pos) => {
    const p = { ...a }, dx = b.x - a.x, dy = b.y - a.y;
    const step = () => { const t = at(p); if (t.h <= 1 && !t.offMap) set(p, { terrain: t.terrain === "water" || t.terrain === "ice" ? "bridge" : "dirt", h: 0 }); };
    while (p.x !== b.x || p.y !== b.y) {
      // Step along whichever axis keeps the trail closest to the straight line from a to b.
      const doneX = dx ? (p.x - a.x) / dx : 1, doneY = dy ? (p.y - a.y) / dy : 1;
      if (p.x !== b.x && (doneX <= doneY || p.y === b.y)) p.x += Math.sign(dx); else p.y += Math.sign(dy);
      if (p.x !== b.x || p.y !== b.y) step();
    }
  };
  for (const nd of nodes) if (nd.layer === 0) trail(start, tileOf[nd.id]!);
  for (const nd of nodes) for (const id of nd.next) trail(tileOf[nd.id]!, tileOf[id]!);
  // Clear the tiles right around each node and the start (no tree in front of an icon), then raise the nodes.
  for (const p of [...tileOf, start]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]] as const) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) continue;
      const t = at(q);
      if (!t.offMap && (t.terrain === "tree" || t.prop || t.h > 1)) set(q, { terrain: "grass", h: 0 });
    }
  }
  for (const nd of nodes) set(tileOf[nd.id]!, { terrain: "dirt", h: nd.kind === "boss" ? 2 : 1 });
  set(start, { terrain: "dirt", h: 0 });
  return { map: { id: "route", w: n, h: n, tiles }, tileOf, start };
}
