/* The battle map as the engine sees it: a square grid where every tile has a terrain and a height.
   The isometric look is only how the renderer draws it; nothing in the engine knows about diamonds. */

export type Terrain = "grass" | "tallgrass" | "dirt" | "water" | "tree" | "ice" | "bridge";

export interface TerrainInfo {
  /** Units can stand here. */
  walkable: boolean;
  /** Blocks line of sight (on top of height). */
  blocksSight: boolean;
  /** Extra height the obstacle adds for line of sight, in levels. */
  sightHeight: number;
}

export const TERRAIN: Record<Terrain, TerrainInfo> = {
  grass: { walkable: true, blocksSight: false, sightHeight: 0 },
  /** Tall grass: hides whoever stands in it from enemies more than HIDE_RANGE tiles away; it burns like grass. */
  tallgrass: { walkable: true, blocksSight: false, sightHeight: 0 },
  dirt: { walkable: true, blocksSight: false, sightHeight: 0 },
  water: { walkable: false, blocksSight: false, sightHeight: 0 },
  tree: { walkable: false, blocksSight: true, sightHeight: 2 },
  /** Frozen water: walkable until it thaws (src/engine/terrain.ts). */
  ice: { walkable: true, blocksSight: false, sightHeight: 0 },
  /** Wooden bridge over water: walkable, burns away. */
  bridge: { walkable: true, blocksSight: false, sightHeight: 0 },
};

/** Things standing on a tile that can be hit, pushed or set off (src/engine/terrain.ts). */
export type Prop = "barrel" | "crate" | "rock";
/** A rock never breaks: it only rolls when pushed. Every rock on a map is one (Jose: push the scenery's rocks, not
    separate boulders), standing on bare dirt that shows once it rolls away. */
export const PROP_HP: Record<Prop, number> = { barrel: 1, crate: 12, rock: 99 };
/** A layer on the ground of a walkable tile (src/engine/terrain.ts): oil slows and blows up in fire; Sap poisons
    the party, feeds foes, and spreads from its sources. */
export type Surface = "oil" | "sap";

export interface Tile {
  terrain: Terrain;
  /** Height in levels, 0 to 3. */
  h: number;
  /** An object on the tile; it blocks movement and some sight. */
  prop?: Prop;
  propHp?: number;
  /** Which picture of its kind a rock (or a tree) shows. Unset until a rock first moves: until then the tile's
      place picks it (sceneryLook), and a rolling rock takes it along so it keeps its looks. */
  look?: number;
  /** Timeline time when fire on this tile goes out, or when ice made by an ability thaws. */
  fireUntil?: number;
  thawAt?: number;
  surface?: Surface;
  /** A Sap source: the Sap spreads out from here, one tile a round, until Light or fire clears it. */
  sapSource?: boolean;
  /** Water a bolt went through: charged until then. */
  chargedUntil?: number;
  /** Steam from fire on water: blocks sight until then. */
  steamUntil?: number;
  /** Scenery the rules ignore: a tent (instead of the tree on that tile) or a bedroll on travel scenes, or the
      charred stump a burnt tree leaves. */
  deco?: "tent" | "bedroll" | "stump";
  /** Timeline time the ground burnt (drawn darker, with ash). Scorched ground does not catch fire again until it
      regrows: a water attack on it, or REGROW_TICKS next to water (src/engine/terrain.ts). */
  scorchedAt?: number;
  /** Outside the map's shape: kept so the grid stays whole, but never drawn (the route map's island). */
  offMap?: boolean;
}

/** Grass of either height: it catches fire and burns down to dirt. */
export const grassy = (t: Tile | undefined) => !!t && (t.terrain === "grass" || t.terrain === "tallgrass");
/** Tall grass hides a unit from enemies further away than this (Manhattan distance). */
export const HIDE_RANGE = 2;
/** Units can stand on the tile now (terrain and no object in the way). */
export const standable = (t: Tile | undefined): t is Tile => !!t && TERRAIN[t.terrain].walkable && !t.prop;
/** Levels above the ground that block sight on this tile. */
export function sightBlock(t: Tile): number {
  const info = TERRAIN[t.terrain];
  return Math.max(info.blocksSight ? info.sightHeight : 0, t.prop ? 1 : 0, t.steamUntil !== undefined ? 2 : 0);
}

export interface GridMap {
  id: string;
  w: number;
  h: number;
  /** Row-major, length w * h. */
  tiles: Tile[];
}

export interface Pos { x: number; y: number }

export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const inside = (m: GridMap, p: Pos) => p.x >= 0 && p.y >= 0 && p.x < m.w && p.y < m.h;

export function tileAt(m: GridMap, p: Pos): Tile | undefined {
  return inside(m, p) ? m.tiles[p.y * m.w + p.x] : undefined;
}

export const NEIGHBOURS: readonly Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** The picture a rock or a tree shows, out of `count`: its own `look` once a rock has moved, else one picked by
    where it stands, so the same map always looks the same. */
export function sceneryLook(t: Tile, p: Pos, count: number): number {
  return (t.look ?? placeLook(p)) % count;
}
export const placeLook = (p: Pos) => (((p.x + 1) * 73856093) ^ ((p.y + 1) * 19349663)) >>> 0;

export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Builds a map from text rows. Each tile is two characters: terrain letter + height digit.
 * g grass, h tall grass, d dirt, w water, r rock (a pushable rock on dirt), t tree, i ice, b bridge. Optional extra
 * characters: B barrel or C crate (an object), o oil, s Sap, S a Sap source (a surface). Example row: "g0 g0 d1 r1 g0B d0o g0S".
 */
export function parseMap(id: string, rows: string[]): GridMap {
  const letters: Record<string, Terrain> = { g: "grass", h: "tallgrass", d: "dirt", w: "water", r: "dirt", t: "tree", i: "ice", b: "bridge" };
  const props: Record<string, Prop> = { B: "barrel", C: "crate" };
  const parsed = rows.map((row, y) =>
    row.trim().split(/\s+/).map((cell, x) => {
      const terrain = letters[cell[0] ?? ""];
      const h = Number(cell.slice(1, 2));
      const extra = cell.slice(2);
      const prop = cell[0] === "r" ? "rock" : [...extra].map((c) => props[c]).find(Boolean);
      const surface: Surface | undefined = extra.includes("o") ? "oil" : /[sS]/.test(extra) ? "sap" : undefined;
      if (!terrain || !Number.isInteger(h) || h < 0 || h > 3 || extra.length > 2 || /[^BCosS]/.test(extra) || (surface && !TERRAIN[terrain].walkable) || (cell[0] === "r" && extra))
        throw new Error(`map ${id}: bad tile "${cell}" at ${x},${y}`);
      const tile: Tile = { terrain, h };
      if (prop) { tile.prop = prop; tile.propHp = PROP_HP[prop]; }
      if (surface) tile.surface = surface;
      if (extra.includes("S")) tile.sapSource = true;
      return tile;
    }),
  );
  const w = parsed[0]?.length ?? 0;
  parsed.forEach((r, y) => { if (r.length !== w) throw new Error(`map ${id}: row ${y} has ${r.length} tiles, expected ${w}`); });
  return { id, w, h: parsed.length, tiles: parsed.flat() };
}

/* Giants. A unit can take up a square of size x size tiles (bosses: 2x2). `pos` is its corner with the lowest x and
   y; every other rule asks the helpers below instead of comparing `pos` directly. */

/** The tiles of a size x size body whose corner is at `p`. */
export function cellsOf(p: Pos, size = 1): Pos[] {
  if (size <= 1) return [{ x: p.x, y: p.y }];
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

/** Whether `q` is one of the tiles of a body of `size` at `p`. */
export const coversPos = (p: Pos, size: number, q: Pos) => q.x >= p.x && q.y >= p.y && q.x < p.x + size && q.y < p.y + size;

/** The tile of a body (corner `p`, `size`) closest to `to`: where it attacks from and is hit on. */
export const nearestCell = (p: Pos, size: number, to: Pos): Pos =>
  size <= 1 ? { x: p.x, y: p.y } : { x: Math.max(p.x, Math.min(p.x + size - 1, to.x)), y: Math.max(p.y, Math.min(p.y + size - 1, to.y)) };

/** Steps between two bodies (Manhattan, between their closest tiles): 1 = side by side. */
export function bodyGap(a: Pos, as: number, b: Pos, bs: number): number {
  const dx = Math.max(0, a.x - (b.x + bs - 1), b.x - (a.x + as - 1));
  const dy = Math.max(0, a.y - (b.y + bs - 1), b.y - (a.y + as - 1));
  return dx + dy;
}
