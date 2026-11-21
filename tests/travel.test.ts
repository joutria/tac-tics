import { describe, expect, it } from "vitest";
import { REGIONS } from "../src/data/region";
import { standable, tileAt } from "../src/engine/grid";
import { activeUnit, AMBUSH_OPENER_AP, applyCommand, createBattle } from "../src/engine/state";
import { choices } from "../src/run/map";
import { battleSetup, enterNode, isAmbush, newRun, type RunState } from "../src/run/run";
import { approachScene, departScene, PIECES, placeOf, STRIP_W, walkPath, type Scene } from "../src/run/travel";

function checkScene(s: Scene, party: number) {
  expect(s.map.w).toBe(STRIP_W);
  expect(s.paths).toHaveLength(party);
  for (const path of s.paths) {
    expect(path.length).toBeGreaterThan(1);
    for (const [i, p] of path.entries()) {
      const t = tileAt(s.map, p)!;
      expect(standable(t)).toBe(true);
      if (i) expect(Math.abs(t.h - tileAt(s.map, path[i - 1]!)!.h)).toBeLessThanOrEqual(1);
    }
  }
  const ends = s.paths.map((p) => `${p.at(-1)!.x},${p.at(-1)!.y}`);
  expect(new Set(ends).size).toBe(party);
}

describe("travel scenes", () => {
  it("every walk piece is 7 wide and keeps its trail in the middle at both ends", () => {
    for (const pieces of Object.values(PIECES)) for (const rows of pieces) {
      for (const r of rows) expect(r.trim().split(/\s+/)).toHaveLength(7);
      for (const r of [rows[0]!, rows.at(-1)!]) expect(r.trim().split(/\s+/)[3]![0]).toMatch(/[dbi]/);
    }
  });

  it("builds a walkable departure and approach for every region, origin and destination, and the same one twice", () => {
    for (const region of REGIONS) for (const seed of ["a", "b", "c", "d", "e", "f"]) for (const party of [1, 2, 4]) {
      const open = [{ id: 1, layer: 1, col: 0, kind: "battle" as const, next: [] }, { id: 2, layer: 1, col: 2, kind: "rest" as const, next: [] }];
      for (const origin of [{ t: "gate" as const }, { t: "place" as const, place: "camp" as const }, { t: "place" as const, place: "shop" as const },
        { t: "arena" as const, map: region.arenas[0]!.map, at: [region.arenas[0]!.hero, ...region.arenas[0]!.allies] }]) {
        const s = departScene(`${seed}:${party}`, region.id, origin, open, party);
        checkScene(s, party);
        expect(s.signs.map((x) => x.pos.x)).toEqual([2, 6]);
        expect(departScene(`${seed}:${party}`, region.id, origin, open, party)).toEqual(s);
        // From the fork the hero can reach each sign.
        for (const sign of s.signs) expect(walkPath(s.map, s.paths[0]!.at(-1)!, sign.pos)).not.toBeNull();
      }
      for (const col of [0, 1, 2]) {
        for (const arena of region.arenas) {
          const s = approachScene(`${seed}:${col}`, region.id, col, { t: "fight", arena: arena.map, party: [arena.hero, ...arena.allies], foes: arena.foes, ambush: false }, party);
          checkScene(s, party);
          expect(s.arenaRows).toBe(arena.map.h);
          // The walk ends on the party's arena spots.
          expect(s.paths[0]!.at(-1)).toEqual(arena.hero);
        }
        for (const kind of ["rest", "shop", "recruit"] as const) checkScene(approachScene(`${seed}:${col}`, region.id, col, { t: "place", place: placeOf(kind)! }, party), party);
      }
    }
  });
});

describe("ambushes", () => {
  /** A run walked down the left-most path, answering nothing, until a node with an ambush is open. */
  function findAmbush(): { run: RunState; node: number } {
    for (let i = 0; i < 200; i++) {
      const run = newRun(`amb${i}`);
      const n = run.map.nodes.find((x) => isAmbush(run, x));
      if (n) return { run, node: n.id };
    }
    throw new Error("no ambush found");
  }

  it("happens only on plain fights and elites past the first layer", () => {
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const run = newRun(`amb${i}`);
      for (const n of run.map.nodes) if (isAmbush(run, n)) { seen++; expect(["battle", "elite"]).toContain(n.kind); expect(n.layer).toBeGreaterThanOrEqual(1); }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("puts the foes close to the party, on its flanks, and gives them the first turns", () => {
    const { run, node } = findAmbush();
    const setup = battleSetup(run, node, "en");
    expect(setup.ambush).toBe(true);
    const party = setup.units.filter((u) => u.team === "heroes"), foes = setup.units.filter((u) => u.team === "foes");
    for (const f of foes) {
      const d = Math.min(...party.map((u) => Math.abs(u.pos.x - f.pos.x) + Math.abs(u.pos.y - f.pos.y)));
      expect(d).toBeGreaterThanOrEqual(2); expect(d).toBeLessThanOrEqual(3);
    }
    const hero = party[0]!;
    if (foes.length >= 2) expect(foes.some((f) => f.pos.x < hero.pos.x) && foes.some((f) => f.pos.x >= hero.pos.x)).toBe(true);
    const s = createBattle(setup);
    expect(activeUnit(s).team).toBe("foes");
    // Every foe's first turn comes before any party member's.
    const firstHero = Math.min(...s.units.filter((u) => u.team === "heroes").map((u) => u.ct));
    for (const f of s.units.filter((u) => u.team === "foes")) expect(f.ct).toBeLessThan(firstHero);
    // ...but that opening turn is a single attack: half their AP. Later turns are full.
    const first = activeUnit(s);
    expect(first.ap).toBe(Math.ceil(first.maxAp * AMBUSH_OPENER_AP));
    const r = applyCommand(s, { t: "endTurn", unit: first.id });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.units.find((u) => u.id === first.id)!.opener).toBeUndefined();
  });

  it("leaves other fights as they were", () => {
    const run = newRun("plain");
    const first = choices(run.map, null)[0]!;
    const next = enterNode(run, first.id, "en");
    expect(next.battle!.setup.ambush).toBeUndefined();
  });
});
