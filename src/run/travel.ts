/* Travel scenes: between two nodes of the run map the party walks a strip of terrain from where they were (the
   arena they fought on, a camp fire, a shop, a clearing) to the fork where the next paths split, and from the
   fork to whatever waits at the end of the path they chose. A fight's path ends in the fight's own arena, with the
   foes waiting, or hidden for an ambush.

   The strip is stitched together from small handmade pieces, one pool per region. Each piece can be mirrored and
   flipped, and the side columns are filled from the region's scenery, so the same route almost never looks the
   same twice. Everything comes from the run seed and the node ids, so a reload rebuilds the same scene.

   The strip is a normal battle map (src/engine/grid.ts), so the battle renderer draws it in the same isometric
   pixel art. Party walks towards -y: from the bottom of the strip (where they come from) to the top. */
import { tileAt, type GridMap, type Pos, type Tile, PROP_HP, parseMap, standable, NEIGHBOURS } from "../engine/grid";
import { rngInt, rngNext, seedFrom } from "../engine/rng";
import type { RunNode } from "./map";

/** Every strip is as wide as the arenas, so an arena can be the last piece of the walk. */
export const STRIP_W = 10;
/** Pieces are 7 tiles wide and sit at this column, with scenery on both sides. The trail runs on column 3 of a
    piece (STRIP_W column 4) where pieces meet. */
const PIECE_X = 1, TRAIL_X = PIECE_X + 3;
/** Fire that never goes out (camp fires, the embers of a battle). */
const FOREVER = 1e12;

/** Piece rows use the map format of src/data/maps, plus F for a fire on the tile, and T (a tent, on a tree tile) or
    R (a bedroll) for camp scenery. */
type Piece = string[];

/** The walk pieces of each region: 7 wide, the trail on column 3 of the first and last row. */
export const PIECES: Record<string, Piece[]> = {
  town: [
    ["r0 g0 g0 d0 g0 g0C t0", "r1 g0 d0 d0 g0 g0 g0", "g1 g0 d0 g0 g0 r0 g0", "g0 g0 d0 d0 g0 g0 t0"],
    ["g0 g0 g0 d0 g1 g2 g2", "t0 g0 g0 d0 d1 g2 t2", "g0 g0 g0 g0 d1 g1 g2", "g0 r0 g0 d0 d0 g1 g1"],
    ["w0 w0 g0 d0 g0 g0 g0", "w0 w0 g0 d0 d0 g0 t0", "w0 g0 g0 g0 d0 g0 g0", "g0 g0 t0 d0 d0 g0 r0"],
    ["g0 g0C g0 d0 g0 g0 g0", "g0 g0 g0B d0 g0 g0C g0", "t0 g0 g0 d0 g0 g0 g0B", "g0 g0 g0 d0 g0 t0 g0"],
    ["r1 r1 g0 d0 g0 r1 r1", "r1 d0F g0 d0 g0 g0 r1", "g0 g0 g0 d0 g0 d0F g0", "r1 r1 g0 d0 g0 r1 r1"],
    ["t0 g0 t0 d0 t0 g0 t0", "g0 g0 g0 d0 g0 g0 g0", "t0 g0 t0 d0 t0 g0 t0", "g0 g0 g0 d0 g0 g0 g0"],
    ["g0 g0 g0 d0 g0 g0 g0", "w0 w0 w0 b0 w0 w0 w0", "w0 w0 w0 b0 w0 w0 w0", "g0 t0 g0 d0 g0 g0 g0"],
    ["g0 g0 g1 d1 g1 g0 g0", "g0 g1 g1 d1 g1 g1 g0", "t0 g1 g2 d2 g2 g1 t0", "g0 g1 g1 d1 g1 g1 g0"],
    ["g0 r0 g0 d0 r0 g0 g0", "g0 g0 r0 d0 d0 r0 g0", "g0 r0 g0 r0 d0 g0 g0", "g0 g0 d0 d0 d0 r0 g0"],
    ["g0 g0 g0 d0 g0 g0 g0", "g0C g0C g0 d0 g0 t0 g0", "g0 g0 g0 d0 g0 g0 g0", "t0 g0 g0 d0 g0C g0B g0"],
    ["g1 g1 d1 d1 g1 r1 g1", "g1 d1F d1 g1 g1 d1 g1", "g0 g1 d1 d1 d1 d1 g1", "g0 g0 g0 d0 g0 g0 g0"],
    ["g0 g0 d0 d0 d0 g0 g0", "g0 d0 d0 w0 d0 d0 g0", "g0 d0 w0 w0 w0 d0 g0", "g0 d0 d0 d0 d0 d0 r0"],
  ],
  reservoir: [
    ["w0 w0 g0 d0 g0 g0 g0", "w0 i0 g0 d0 g0 t0 g0", "w0 w0 g0 d0 g0 g0 g0", "w0 w0 g0 d0 d0 g0 r0"],
    ["g0 g0 g0 d0 g0 g0 g0", "w0 w0 i0 b0 w0 w0 w0", "w0 w0 w0 b0 w0 i0 w0", "g0 g0 g0 d0 g0 t0 g0"],
    ["i0 i0 w0 d0 i0 w0 w0", "w0 i0 i0 i0 i0 i0 w0", "w0 w0 i0 i0 w0 i0 i0", "w0 i0 i0 d0 i0 w0 w0"],
    ["d1 d1 d1 d1 d1 r1 d1", "d1 d1C d1 d1 d1 d1 d1B", "g0 g0 g0 d0 g0 g0 g0", "g0 w0 g0 d0 g0 w0 g0"],
    ["t0 g0 w0 d0 g0 t0 w0", "g0 t0 w0 d0 d0 g0 w0", "w0 g0 g0 g0 d0 t0 w0", "w0 w0 g0 d0 d0 g0 g0"],
    ["w0 w0 d0 d0 d0 w0 w0", "w0 d1 d1 d1 d1 d1 w0", "w0 d1 d1C d1 d1 d1 w0", "w0 w0 d0 d0 d0 w0 w0"],
    ["g0 g0 g0 d0 g0 g0C g0", "g0 i0 i0 i0 i0 i0 g0", "g0 i0 w0 i0 w0 i0 g0", "g0 g0 g0 d0 g0 g0B g0"],
    ["r0 g0 g0 d0 g0 r0 w0", "g0 g0 r1 d0 g0 g0 w0", "g0 g1 g1 d1 g1 g0 w0", "t0 g0 g0 d0 g0 r0 w0"],
    ["w0 w0 w0 b0 w0 w0 w0", "w0 i0 w0 b0 w0 w0 i0", "w0 w0 w0 b0 w0 w0 w0", "g0 g0 g0 d0 g0 g0 g0"],
    ["d1 r1 d1 d1 d1 r1 d1", "d1 d1 d1 d1 d1 d1 d1", "d1 r1 d1 d1 d1C r1 d1", "d0 d0 d0 d0 d0 d0 d0"],
  ],
};

/** What fills the three side columns, per region: tiles and how often each comes up. */
const SCENERY: Record<string, [string, number][]> = {
  town: [["g0", 10], ["t0", 3], ["r0", 1], ["g1", 2], ["d0", 1], ["t1", 1]],
  reservoir: [["w0", 8], ["g0", 4], ["i0", 2], ["t0", 1], ["r0", 1]],
};

/** Where the party sets out from, and where a path that is not a fight ends. The party stands around `stand`. */
interface Place { rows: Piece; stand: Pos }
const PLACES: Record<"gate" | "camp" | "shop" | "clearing", Place> = {
  // The edge of a region: a gap in a broken wall.
  gate: { rows: ["g0 g0 g0 d0 g0 g0 g0", "g0 g0 g0 d0 g0 g0 g0", "r1 r1 g0 d0 g0 r1 r1", "g0 g0C g0 d0 g0 g0B g0", "g0 g0 g0 d0 g0 g0 g0"], stand: { x: 3, y: 4 } },
  // A camp: the fire in the middle, the party around it.
  camp: { rows: ["g0 g0 g0 d0 g0 g0 g0", "t0T g0 d0 d0 d0 g0 t0", "g0 d0R d0 d0F d0 d0R g0", "g0 g0 d0 d0 d0 g0C g0", "g0 t0 g0 g0 g0 t0T g0"], stand: { x: 3, y: 3 } },
  // A trader's stall: crates and barrels along the road.
  shop: { rows: ["g0 g0 g0 d0 g0 g0 g0", "g0C g0B g0 d0 g0 g0C g0C", "g0 g0 d0 d0 d0 g0 g0", "g0 g0C g0 d0 g0 g0B g0", "g0 g0 g0 g0 g0 g0 g0"], stand: { x: 3, y: 2 } },
  // Somewhere to talk: a quiet clearing.
  clearing: { rows: ["g0 g0 g0 d0 g0 g0 g0", "t0 g0 d0 d0 d0 g0 t0", "g0 d0 d0 d0 d0 d0 g0", "t0 g0 d0 d0 d0 g0 t0", "g0 g0 t0 g0 t0 g0 g0"], stand: { x: 3, y: 2 } },
};

/** The fork at the end of a walk: one trail per column of the run map (0 left, 1 middle, 2 right). */
const FORK: Piece = ["t0 d0 g0 d0 g0 d0 t0", "g0 d0 d0 g0 d0 d0 g0", "g0 g0 d0 d0 d0 g0 g0", "g0 g0 g0 d0 g0 g0 g0"];
/** Strip column of the sign for a run map column, and where the party waits at the fork (strip row 2). */
export const signX = (col: number) => PIECE_X + 1 + 2 * col;
const FORK_WAIT: Pos = { x: TRAIL_X, y: 2 };

/** A built scene: the strip, where each walker starts and ends, and what stands where. */
export interface Scene {
  map: GridMap;
  /** Hero first, then companions: each one's path from start to end (the first point is where they start). */
  paths: Pos[][];
  /** Signposts at the fork, for the nodes that can be picked next. */
  signs: { node: number; pos: Pos }[];
  /** Foes standing at the end of a fight's path (their arena spots). */
  foes: Pos[];
  /** The foes are hidden until the party arrives, then jump out. */
  ambush: boolean;
  /** Where the arena begins (the top `arenaRows` rows of the strip are the arena), 0 when there is none. */
  arenaRows: number;
}

const parsePiece = (id: string, rows: Piece, mirror: boolean, flip: boolean): Tile[][] => {
  const cells = rows.map((r) => r.trim().split(/\s+/));
  const plain = cells.map((r) => r.map((c) => c.replace(/[FTR]/g, "")).join(" "));
  const m = parseMap(id, plain);
  let grid: Tile[][] = [];
  for (let y = 0; y < m.h; y++) grid.push(m.tiles.slice(y * m.w, (y + 1) * m.w).map((t, x) => {
    const c = cells[y]![x]!;
    const out: Tile = c.includes("F") ? { ...t, fireUntil: FOREVER } : t;
    // Camp scenery, drawn only: a tent (on a tile nobody can walk) and a bedroll (on the ground).
    if (c.includes("T")) return { ...out, deco: "tent" as const };
    if (c.includes("R")) return { ...out, deco: "bedroll" as const };
    return out;
  }));
  if (mirror) grid = grid.map((row) => [...row].reverse());
  if (flip) grid = [...grid].reverse();
  return grid;
};

type Roll = (min: number, max: number) => number;
function roller(seed: string): { roll: Roll; chance: (p: number) => boolean } {
  let rng = seedFrom(seed);
  return {
    roll: (min, max) => { let v: number; [v, rng] = rngInt(rng, min, max); return v; },
    chance: (p) => { let v: number; [v, rng] = rngNext(rng); return v < p; },
  };
}

/** Pads a 7-wide piece to the strip's width with the region's scenery. */
function widen(rows: Tile[][], region: string, roll: Roll): Tile[][] {
  const pool = SCENERY[region] ?? SCENERY.town!;
  const total = pool.reduce((a, [, w]) => a + w, 0);
  const scenery = (): Tile => {
    let r = roll(0, total - 1);
    for (const [cell, w] of pool) { if (r < w) return parseMap("scenery", [cell]).tiles[0]!; r -= w; }
    return { terrain: "grass", h: 0 };
  };
  return rows.map((row) => {
    const out: Tile[] = [];
    for (let x = 0; x < STRIP_W; x++) out.push(x >= PIECE_X && x < PIECE_X + row.length ? row[x - PIECE_X]! : scenery());
    return out;
  });
}

/** Picks `n` walk pieces of a region, never the same one twice in a row. */
function walkPieces(region: string, n: number, roll: Roll, chance: (p: number) => boolean): Tile[][][] {
  const pool = PIECES[region] ?? PIECES.town!;
  const out: Tile[][][] = [];
  let last = -1;
  for (let i = 0; i < n; i++) {
    let k = roll(0, pool.length - 1);
    if (k === last) k = (k + 1) % pool.length;
    last = k;
    out.push(parsePiece(`${region}-${k}`, pool[k]!, chance(0.5), chance(0.5)));
  }
  return out;
}

const toMap = (id: string, rows: Tile[][]): GridMap => ({ id, w: STRIP_W, h: rows.length, tiles: rows.flat().map((t) => (t.prop && t.propHp === undefined ? { ...t, propHp: PROP_HP[t.prop] } : { ...t })) });

/** Shortest walk from a to b over tiles a unit can stand on, stepping at most one level up or down, around fire. */
export function walkPath(m: GridMap, a: Pos, b: Pos, blocked: (p: Pos) => boolean = () => false): Pos[] | null {
  const key = (p: Pos) => p.y * m.w + p.x;
  const ok = (p: Pos) => { const t = tileAt(m, p); return standable(t) && !(t.fireUntil && t.fireUntil > 0) && !blocked(p); };
  const from = new Map<number, number>([[key(a), -1]]);
  const queue: Pos[] = [a];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === b.x && p.y === b.y) {
      const path: Pos[] = [];
      for (let k = key(p); k !== -1; k = from.get(k)!) path.unshift({ x: k % m.w, y: Math.floor(k / m.w) });
      return path;
    }
    for (const d of NEIGHBOURS) {
      const q = { x: p.x + d.x, y: p.y + d.y };
      if (from.has(key(q)) || !tileAt(m, q)) continue;
      if (!(q.x === b.x && q.y === b.y) && !ok(q)) continue;
      if (Math.abs(tileAt(m, q)!.h - tileAt(m, p)!.h) > 1) continue;
      from.set(key(q), key(p));
      queue.push(q);
    }
  }
  return null;
}

/** Up to `n` free tiles near `p` (nearest first, ties broken left to right), for a group to stand on. */
function spotsAround(m: GridMap, p: Pos, n: number, taken: Pos[] = []): Pos[] {
  const out: Pos[] = [];
  const free = (q: Pos) => { const t = tileAt(m, q); return standable(t) && !(t.fireUntil && t.fireUntil > 0) && ![...out, ...taken].some((o) => o.x === q.x && o.y === q.y); };
  for (let r = 0; r <= 4 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
      if (Math.abs(dx) + Math.abs(dy) !== r) continue;
      const q = { x: p.x + dx, y: p.y + dy };
      if (free(q) && walkPath(m, q, p)) out.push(q);
    }
  }
  return out;
}

/** Paths for a party of `count`: they start in single file below `start` and end around `end` (or at `ends`). */
function partyPaths(m: GridMap, start: Pos, end: Pos, count: number, ends?: Pos[], starts?: Pos[]): Pos[][] | null {
  const from = starts && starts.length >= count ? starts.slice(0, count) : spotsAround(m, start, count);
  const to = ends && ends.length >= count ? ends.slice(0, count) : spotsAround(m, end, count);
  if (from.length < count || to.length < count) return null;
  const paths: Pos[][] = [];
  for (let i = 0; i < count; i++) {
    const p = walkPath(m, from[i]!, to[i]!);
    if (!p) return null;
    paths.push(p);
  }
  return paths;
}

/** Where the party came from, by the kind of the node they finished last. */
export type Origin = { t: "gate" } | { t: "place"; place: keyof typeof PLACES } | { t: "arena"; map: GridMap; at: Pos[] };

/** A short burnt patch on an arena the party has just fought on: a couple of embers, so it reads as "after". */
function embers(rows: Tile[][], roll: Roll) {
  for (let i = 0; i < 2; i++) {
    const y = roll(0, rows.length - 1), x = roll(0, STRIP_W - 1), t = rows[y]![x]!;
    if (standable(t) && (t.terrain === "grass" || t.terrain === "dirt")) rows[y]![x] = { ...t, fireUntil: FOREVER };
  }
}

const gridRows = (m: GridMap): Tile[][] => Array.from({ length: m.h }, (_, y) => m.tiles.slice(y * m.w, (y + 1) * m.w).map((t) => ({ ...t })));

/** The walk from where the party is to the fork. `open` are the nodes that can be picked next. */
export function departScene(seed: string, region: string, origin: Origin, open: RunNode[], party: number): Scene {
  const { roll, chance } = roller(`${seed}:depart`);
  for (let tries = 0; tries < 8; tries++) {
    const fork = widen(parsePiece("fork", FORK, false, false), region, roll);
    // Signs stand only where a path goes on; the other fork trails end in grass.
    const cols = new Set(open.map((n) => n.col));
    for (let c = 0; c < 3; c++) if (!cols.has(c)) fork[0]![signX(c)] = { terrain: "grass", h: 0 };
    // Past the signs the trails go on into the region, so the fork is not the edge of the world.
    const beyond = widen(parsePiece("beyond", ["g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0"], false, false), region, roll);
    for (const c of cols) for (const row of beyond) row[signX(c)] = { terrain: "dirt", h: 0 };
    const walk = walkPieces(region, 3, roll, chance).flatMap((p) => widen(p, region, roll));
    let tail: Tile[][], startAt: Pos[] | undefined, start: Pos;
    if (origin.t === "arena" && origin.map.w === STRIP_W) {
      tail = gridRows(origin.map); embers(tail, roll);
      start = origin.at[0] ?? { x: TRAIL_X, y: tail.length - 2 };
      startAt = origin.at;
    } else {
      const place = PLACES[origin.t === "place" ? origin.place : "gate"];
      tail = widen(parsePiece("place", place.rows, false, false), region, roll);
      start = { x: place.stand.x + PIECE_X, y: place.stand.y };
    }
    const rows = [...beyond, ...fork, ...walk, ...tail];
    const m = toMap(`depart-${seed}`, rows);
    const off = rows.length - tail.length;
    const starts = startAt?.map((p) => ({ x: p.x, y: p.y + off }));
    const paths = partyPaths(m, { x: start.x, y: start.y + off }, { x: FORK_WAIT.x, y: FORK_WAIT.y + beyond.length }, party, undefined, starts);
    if (!paths) continue;
    return { map: m, paths, signs: open.map((n) => ({ node: n.id, pos: { x: signX(n.col), y: beyond.length } })), foes: [], ambush: false, arenaRows: 0 };
  }
  throw new Error("no walkable departure strip");
}

/** What waits at the end of a path. */
export type Destination =
  | { t: "fight"; arena: GridMap; party: Pos[]; foes: Pos[]; ambush: boolean }
  | { t: "place"; place: keyof typeof PLACES };

/** The walk from the fork, down the chosen node's trail, to what waits there. */
export function approachScene(seed: string, region: string, col: number, dest: Destination, party: number): Scene {
  const { roll, chance } = roller(`${seed}:approach`);
  for (let tries = 0; tries < 8; tries++) {
    // The trail starts at the chosen sign, bottom row, and bends back to the middle.
    const branch = widen(parsePiece("branch", ["g0 g0 g0 d0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0"], false, false), region, roll);
    const sx = signX(col);
    for (let x = Math.min(sx, TRAIL_X); x <= Math.max(sx, TRAIL_X); x++) branch[1]![x] = { terrain: "dirt", h: 0 };
    branch[0]![TRAIL_X] = { terrain: "dirt", h: 0 };
    const walk = walkPieces(region, 2, roll, chance).flatMap((p) => widen(p, region, roll));
    let head: Tile[][], ends: Pos[] | undefined, end: Pos;
    if (dest.t === "fight") {
      head = gridRows(dest.arena);
      ends = dest.party; end = dest.party[0]!;
    } else {
      const place = PLACES[dest.place];
      head = widen(parsePiece("place", place.rows, false, false), region, roll);
      end = { x: place.stand.x + PIECE_X, y: place.stand.y };
    }
    const rows = [...head, ...walk, ...branch];
    const m = toMap(`approach-${seed}`, rows);
    const start = { x: sx, y: rows.length - 1 };
    // Walkers start in single file on the branch trail, the hero in front.
    const starts = [start, { x: sx, y: rows.length - 1 }, { x: sx, y: rows.length - 1 }, { x: sx, y: rows.length - 1 }];
    const paths = partyPaths(m, start, end, party, ends, starts);
    if (!paths) continue;
    return { map: m, paths, signs: [], foes: dest.t === "fight" ? dest.foes : [], ambush: dest.t === "fight" && dest.ambush, arenaRows: dest.t === "fight" ? head.length : 0 };
  }
  throw new Error("no walkable approach strip");
}

/** Where a node's path ends, if it is not a fight. */
export function placeOf(kind: RunNode["kind"]): keyof typeof PLACES | null {
  if (kind === "rest") return "camp";
  if (kind === "shop") return "shop";
  if (kind === "recruit" || kind === "quest") return "clearing";
  return null;
}
