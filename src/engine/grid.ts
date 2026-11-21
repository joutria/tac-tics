/* The battle map as the engine sees it: a square grid where every tile has a terrain and a height.
   The isometric look is only how the renderer draws it; nothing in the engine knows about diamonds. */

export type Terrain = "grass" | "dirt" | "water" | "rock" | "tree" | "ice" | "bridge";

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
  dirt: { walkable: true, blocksSight: false, sightHeight: 0 },
  water: { walkable: false, blocksSight: false, sightHeight: 0 },
  rock: { walkable: false, blocksSight: true, sightHeight: 1 },
  tree: { walkable: false, blocksSight: true, sightHeight: 2 },
  /** Frozen water: walkable until it thaws (src/engine/terrain.ts). */
  ice: { walkable: true, blocksSight: false, sightHeight: 0 },
  /** Wooden bridge over water: walkable, burns away. */
  bridge: { walkable: true, blocksSight: false, sightHeight: 0 },
};

/** Things standing on a tile that can be hit, pushed or set off (src/engine/terrain.ts). */
export type Prop = "barrel" | "crate" | "boulder";
/** A boulder never breaks: it only rolls when pushed. */
export const PROP_HP: Record<Prop, number> = { barrel: 1, crate: 12, boulder: 99 };
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
  /** Scenery the rules ignore, drawn on travel scenes: a tent (instead of the tree on that tile) or a bedroll. */
  deco?: "tent" | "bedroll";
}

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

export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Builds a map from text rows. Each tile is two characters: terrain letter + height digit.
 * g grass, d dirt, w water, r rock, t tree, i ice, b bridge. Optional extra characters: B barrel, C crate or O boulder
 * (an object), o oil, s Sap, S a Sap source (a surface). Example row: "g0 g0 d1 r1 g0B d0o g0S".
 */
export function parseMap(id: string, rows: string[]): GridMap {
  const letters: Record<string, Terrain> = { g: "grass", d: "dirt", w: "water", r: "rock", t: "tree", i: "ice", b: "bridge" };
  const props: Record<string, Prop> = { B: "barrel", C: "crate", O: "boulder" };
  const parsed = rows.map((row, y) =>
    row.trim().split(/\s+/).map((cell, x) => {
      const terrain = letters[cell[0] ?? ""];
      const h = Number(cell.slice(1, 2));
      const extra = cell.slice(2);
      const prop = [...extra].map((c) => props[c]).find(Boolean);
      const surface: Surface | undefined = extra.includes("o") ? "oil" : /[sS]/.test(extra) ? "sap" : undefined;
      if (!terrain || !Number.isInteger(h) || h < 0 || h > 3 || extra.length > 2 || /[^BCOosS]/.test(extra) || (surface && !TERRAIN[terrain].walkable))
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
