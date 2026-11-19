/* The run map of a region: a branching path of nodes in layers, from the town's edge (layer 0) to the boss.
   The player picks one of the nodes linked to the last one they finished. Built from the run's seed only, so
   the same seed always gives the same map. */
import { rngInt, rngNext, seedFrom } from "../engine/rng";

export type NodeKind = "battle" | "elite" | "rest" | "shop" | "rival" | "boss";

export interface RunNode {
  id: number;
  layer: number;
  /** Column inside its layer, 0 = left; used to draw it and to link neighbours. */
  col: number;
  kind: NodeKind;
  /** Nodes in the next layer this one leads to. */
  next: number[];
  /** Rival waiting here (its id), for kind "rival". */
  rival?: string;
}

export interface RunMap { layers: number; width: number; nodes: RunNode[] }

export const MAP_LAYERS = 7, MAP_WIDTH = 3;

export function generateMap(seed: string | number, layers = MAP_LAYERS, width = MAP_WIDTH): RunMap {
  let rng = seedFrom(`${seed}:map`);
  const roll = (min: number, max: number) => { let v: number; [v, rng] = rngInt(rng, min, max); return v; };
  const chance = (p: number) => { let v: number; [v, rng] = rngNext(rng); return v < p; };
  const nodes: RunNode[] = [];
  const byLayer: RunNode[][] = [];
  for (let layer = 0; layer < layers; layer++) {
    const boss = layer === layers - 1;
    const count = boss ? 1 : layer === 0 ? width : roll(2, width);
    const cols = boss ? [1] : pickCols(count, width, roll);
    byLayer.push(cols.map((col) => {
      const n: RunNode = { id: nodes.length, layer, col, kind: boss ? "boss" : "battle", next: [] };
      nodes.push(n);
      return n;
    }));
  }
  // Kinds: the first layer is plain battles; a rest just before the boss; elites and a mid-run rest in between.
  const mid = Math.floor(layers / 2);
  for (const n of nodes) {
    if (n.kind === "boss" || n.layer === 0) continue;
    if (n.layer === layers - 2) n.kind = "rest";
    else if (n.layer === mid && n.col === byLayer[mid]![0]!.col) n.kind = "rest";
    else if (n.layer >= 2 && chance(0.3)) n.kind = "elite";
  }
  // One shop on layer 2 and one on the layer before the last rests, each on a node that is still a plain battle.
  for (const layer of [2, layers - 3]) {
    const spots = (byLayer[layer] ?? []).filter((n) => n.kind === "battle");
    if (spots.length) spots[roll(0, spots.length - 1)]!.kind = "shop";
  }
  // Links: each node goes to the nearest one or two nodes of the next layer; every node gets at least one way in.
  for (let layer = 0; layer < layers - 1; layer++) {
    const here = byLayer[layer]!, there = byLayer[layer + 1]!;
    for (const n of here) {
      const near = [...there].sort((a, b) => Math.abs(a.col - n.col) - Math.abs(b.col - n.col) || a.col - b.col);
      n.next.push(near[0]!.id);
      if (near[1] && Math.abs(near[1].col - n.col) <= 1 && chance(0.5)) n.next.push(near[1].id);
    }
    for (const m of there) {
      if (here.some((n) => n.next.includes(m.id))) continue;
      const from = [...here].sort((a, b) => Math.abs(a.col - m.col) - Math.abs(b.col - m.col))[0]!;
      from.next.push(m.id);
    }
    for (const n of here) n.next.sort((a, b) => a - b);
  }
  return { layers, width, nodes };
}

function pickCols(count: number, width: number, roll: (a: number, b: number) => number): number[] {
  const cols = Array.from({ length: width }, (_, i) => i);
  while (cols.length > count) cols.splice(roll(0, cols.length - 1), 1);
  return cols;
}

/** Nodes the player can go to next: the first layer at the start, then the links of the last node. */
export function choices(map: RunMap, at: number | null): RunNode[] {
  if (at === null) return map.nodes.filter((n) => n.layer === 0);
  return map.nodes[at]!.next.map((id) => map.nodes[id]!);
}

/** Every node the player can still reach from `at`. */
export function aheadOf(map: RunMap, at: number | null): Set<number> {
  const ahead = new Set<number>();
  const walk = (ids: number[]) => { for (const id of ids) if (!ahead.has(id)) { ahead.add(id); walk(map.nodes[id]!.next); } };
  walk(choices(map, at).map((n) => n.id));
  return ahead;
}

/** Puts a rival on a battle node ahead of `at` that the player can still reach, if there is one. */
export function placeRival(map: RunMap, at: number | null, rivalId: string, seed: string | number): number | null {
  const ahead = aheadOf(map, at);
  const spots = map.nodes.filter((n) => ahead.has(n.id) && (n.kind === "battle" || n.kind === "elite") && !n.rival);
  if (!spots.length) return null;
  // Prefer the nearest layer, so the player meets it soon; the seed picks among those.
  const nearest = Math.min(...spots.map((n) => n.layer));
  const near = spots.filter((n) => n.layer === nearest);
  const [i] = rngInt(seedFrom(`${seed}:rival:${rivalId}`), 0, near.length - 1);
  const node = near[i]!;
  node.kind = "rival"; node.rival = rivalId;
  return node.id;
}
