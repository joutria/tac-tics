/* The battle map as the engine sees it: a square grid where every tile has a terrain and a height.
   The isometric look is only how the renderer draws it; nothing in the engine knows about diamonds. */

export type Terrain = "grass" | "dirt" | "water" | "rock" | "tree";

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
};

export interface Tile {
  terrain: Terrain;
  /** Height in levels, 0 to 3. */
  h: number;
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
 * g grass, d dirt, w water, r rock, t tree. Example row: "g0 g0 d1 r1".
 */
export function parseMap(id: string, rows: string[]): GridMap {
  const letters: Record<string, Terrain> = { g: "grass", d: "dirt", w: "water", r: "rock", t: "tree" };
  const parsed = rows.map((row, y) =>
    row.trim().split(/\s+/).map((cell, x) => {
      const terrain = letters[cell[0] ?? ""];
      const h = Number(cell.slice(1));
      if (!terrain || !Number.isInteger(h) || h < 0 || h > 3) throw new Error(`map ${id}: bad tile "${cell}" at ${x},${y}`);
      return { terrain, h };
    }),
  );
  const w = parsed[0]?.length ?? 0;
  parsed.forEach((r, y) => { if (r.length !== w) throw new Error(`map ${id}: row ${y} has ${r.length} tiles, expected ${w}`); });
  return { id, w, h: parsed.length, tiles: parsed.flat() };
}
