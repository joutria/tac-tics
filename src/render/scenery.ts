/* Which rock and tree pictures the board shows. Each region has its own set (tools/scenery-art.py draws them): the
   town's green woods with the odd autumn tree, the frozen reservoir's snowy pines and stones, the Sap Hollow's
   sickly and Sap-purple growth, the mines' veined rock and Sap crystals. Each rock or tree picks one by where it stands (sceneryLook), so a map looks the
   same every time; a rock keeps its picture when it rolls. Rocks come in three sizes, each with its own pictures. */
import { rockSizeOf, sceneryLook, type Pos, type RockSize, type Tile } from "../engine/grid";

export type Biome = "town" | "frost" | "hollow" | "mine";

/** A picture and the pixel (at 1x) that sits on the tile's centre. */
interface Look { key: string; ax: number; ay: number }

const rocks = (biome: string, n: number, size: RockSize): Look[] => Array.from({ length: n }, (_, i) => ({ key: `rock-${biome}-${i}-${size}`, ax: 14, ay: 22 }));
const trees = (biome: string, n: number): Look[] => Array.from({ length: n }, (_, i) => ({ key: `tree-${biome}-${i}`, ax: 20, ay: 36 }));

/** The Ninja Adventure pack's own rock and tree stay in the town's mix. */
const PACK_ROCK: Look = { key: "obj-rock", ax: 9, ay: 15 };
const PACK_TREE: Look = { key: "obj-tree", ax: 16, ay: 28 };

/** Rock pictures by region and size (small stone, medium rock, big boulder: grid.ts RockSize). */
const bySize = (biome: string, n: number, extra: Partial<Record<RockSize, Look[]>> = {}): Record<RockSize, Look[]> =>
  ({ s: [...(extra.s ?? []), ...rocks(biome, n, "s")], m: [...(extra.m ?? []), ...rocks(biome, n, "m")], l: [...(extra.l ?? []), ...rocks(biome, n, "l")] });
export const ROCKS: Record<Biome, Record<RockSize, Look[]>> = {
  town: bySize("town", 5, { m: [PACK_ROCK] }),
  frost: bySize("frost", 5),
  hollow: bySize("hollow", 4),
  mine: bySize("mine", 5),
};
export const TREES: Record<Biome, Look[]> = {
  town: [PACK_TREE, PACK_TREE, ...trees("town", 7)],
  frost: trees("frost", 5),
  hollow: trees("hollow", 4),
  mine: trees("mine", 4),
};

/** Every picture above, for loadImages. */
export const SCENERY_IMAGES: string[] = [...new Set([...Object.values(ROCKS).flatMap((r) => Object.values(r)), ...Object.values(TREES)].flat().map((l) => l.key))];

/** The region a map belongs to, from its id (travel strips carry their region in theirs). */
export function biomeOf(mapId: string): Biome {
  if (/hollow/.test(mapId)) return "hollow";
  if (/shore|spillway|reservoir/.test(mapId)) return "frost";
  if (/mine|shaft|forge|seam|heart/.test(mapId)) return "mine";
  return "town";
}

/** The picture for the rock or tree on tile `t` at `p`. */
export function sceneryFor(kind: "rock" | "tree", mapId: string, t: Tile, p: Pos): Look {
  const list = kind === "rock" ? ROCKS[biomeOf(mapId)][rockSizeOf(t)] : TREES[biomeOf(mapId)];
  return list[sceneryLook(t, p, list.length)]!;
}
