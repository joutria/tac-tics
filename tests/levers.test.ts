/* Levers, gates and drawbridges: map links flipped by the shared quick action Pull. */
import { describe, expect, it } from "vitest";
import { parseMap, tileAt } from "../src/engine/grid";
import { castProblem } from "../src/engine/combat";
import { applyCommand, createBattle, type BattleState, type UnitSpec } from "../src/engine/state";
import { hasLevers, linked } from "../src/engine/levers";
import { RUINS } from "../src/data/maps/ruins";
import { SPILLWAY } from "../src/data/maps/reservoir";

const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 10, agi: 10, res: {}, abilities: ["ray"], ...o,
});
const MAP = [
  "g0 g0 g0 g0 g0",
  "g0L1 g0 g0G1 g0O1 g0",
  "g0 g0 w0D1 b0U1 g0",
  "g0 g0 g0 g0 g0",
];
const battle = (extra: UnitSpec[] = []) => createBattle({ seed: "lever", map: parseMap("levers", MAP), units: [
  unit({ id: "hero", team: "heroes", pos: { x: 0, y: 0 }, speed: 90 }),
  unit({ id: "foe", team: "foes", pos: { x: 4, y: 3 }, speed: 10 }),
  ...extra,
] });
const pull = (s: BattleState, who = "hero") => {
  const r = applyCommand(s, { t: "cast", unit: who, ability: "pull", target: { x: 0, y: 1 } });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("levers", () => {
  it("parses links: a lever and a closed gate are fixed props, an open gate is floor, drawbridges are water or bridge", () => {
    const m = parseMap("levers", MAP);
    expect(tileAt(m, { x: 0, y: 1 })).toMatchObject({ prop: "lever", link: { group: 1, kind: "lever", open: false } });
    expect(tileAt(m, { x: 2, y: 1 })).toMatchObject({ prop: "gate", link: { kind: "gate", open: false } });
    expect(tileAt(m, { x: 3, y: 1 })!.prop).toBeUndefined();
    expect(tileAt(m, { x: 2, y: 2 })).toMatchObject({ terrain: "water", link: { kind: "drawbridge", open: false } });
    expect(tileAt(m, { x: 3, y: 2 })).toMatchObject({ terrain: "bridge", link: { kind: "drawbridge", open: true } });
    expect(linked(m, 1)).toHaveLength(4);
    expect(hasLevers(m)).toBe(true);
    expect(() => parseMap("bad", ["g0D1"])).toThrow(); // a raised drawbridge must be water
  });

  it("pulling flips the lever and every gate and drawbridge of its group", () => {
    const s = pull(battle());
    expect(tileAt(s.map, { x: 0, y: 1 })!.link!.open).toBe(true);
    expect(tileAt(s.map, { x: 2, y: 1 })!.prop).toBeUndefined();
    expect(tileAt(s.map, { x: 3, y: 1 })!.prop).toBe("gate");
    expect(tileAt(s.map, { x: 2, y: 2 })!.terrain).toBe("bridge");
    expect(tileAt(s.map, { x: 3, y: 2 })!.terrain).toBe("water");
  });

  it("needs to stand next to a lever, and only a lever", () => {
    const s = battle(), hero = s.units[0]!;
    expect(castProblem(s, hero, "pull", { x: 0, y: 1 })).toBeNull();
    expect(castProblem(s, hero, "pull", { x: 1, y: 0 })).not.toBeNull();
    hero.pos = { x: 0, y: 3 };
    expect(castProblem(s, hero, "pull", { x: 0, y: 1 })).not.toBeNull();
  });

  it("a gate does not shut on a body and a bridge does not rise under one", () => {
    const s = pull(battle([
      unit({ id: "onGate", team: "heroes", pos: { x: 3, y: 1 }, speed: 5 }),
      unit({ id: "onBridge", team: "heroes", pos: { x: 3, y: 2 }, speed: 5 }),
    ]));
    expect(tileAt(s.map, { x: 3, y: 1 })!.prop).toBeUndefined();
    expect(tileAt(s.map, { x: 3, y: 2 })!.terrain).toBe("bridge");
    expect(tileAt(s.map, { x: 2, y: 1 })!.prop).toBeUndefined(); // the free gate still opened
  });

  it("a burnt drawbridge stays gone", () => {
    const s = battle();
    const t = tileAt(s.map, { x: 3, y: 2 })!;
    t.terrain = "dirt"; // what is left once a bridge burns down (the shape matters, not the exact terrain)
    const after = pull(s);
    expect(tileAt(after.map, { x: 3, y: 2 })!.terrain).toBe("dirt");
  });

  it("a closed gate blocks walking but levers and gates cannot be shoved", () => {
    const s = battle();
    s.units[0]!.pos = { x: 2, y: 0 };
    expect(applyCommand(s, { t: "move", unit: "hero", to: { x: 2, y: 1 } }).ok).toBe(false);
    expect(castProblem(s, s.units[0]!, "shove", { x: 2, y: 1 })).not.toBeNull();
    s.units[0]!.pos = { x: 1, y: 1 };
    expect(castProblem(s, s.units[0]!, "shove", { x: 0, y: 1 })).not.toBeNull();
  });

  it("the town ruins and the spillway each have a working lever", () => {
    expect(hasLevers(RUINS) && hasLevers(SPILLWAY)).toBe(true);
    expect(linked(RUINS, 1).map((p) => tileAt(RUINS, p)!.link!.open).sort()).toEqual([false, true]);
    expect(linked(SPILLWAY, 1).every((p) => tileAt(SPILLWAY, p)!.terrain === "bridge")).toBe(true);
  });
});

describe("the Sap Mines", () => {
  it("every start spot is free floor, and each map has machinery to work", async () => {
    const { REGIONS, HEART_ARENA } = await import("../src/data/region");
    const { TERRAIN } = await import("../src/engine/grid");
    const mines = REGIONS.find((r) => r.id === "mines")!;
    for (const a of [...mines.arenas, HEART_ARENA]) {
      for (const p of [a.hero, ...a.allies, ...a.foes]) {
        const t = tileAt(a.map, p)!;
        expect(TERRAIN[t.terrain].walkable && !t.prop, `${a.map.id} ${p.x},${p.y}`).toBe(true);
      }
      expect(hasLevers(a.map), a.map.id).toBe(true);
    }
  });
});

describe("foes and levers", () => {
  const WALL = [
    "d0 d0 d0 d0 d0",
    "d0 d0L1 d0 d0 d0",
    "d3 d3 d0O1 d3 d3",
    "d0 d0 d0 d0 d0",
    "d0 d0 d0 d0 d0",
  ];
  const fight = (ai: "caster" | "bruiser") => createBattle({ seed: "wall", map: parseMap("wall", WALL), units: [
    unit({ id: "foe", team: "foes", pos: { x: 1, y: 0 }, speed: 90, ai, abilities: ["bite"] }),
    unit({ id: "hero", team: "heroes", pos: { x: 2, y: 4 }, speed: 10 }),
  ] });

  it("a cautious foe shuts the only gate between it and the party", async () => {
    const { planTurn } = await import("../src/engine/ai");
    const cmds = planTurn(fight("caster"));
    expect(cmds.some((c) => c.t === "cast" && c.ability === "pull")).toBe(true);
  });

  it("a bruiser leaves the way open, to get at the party", async () => {
    const { planTurn } = await import("../src/engine/ai");
    const cmds = planTurn(fight("bruiser"));
    expect(cmds.some((c) => c.t === "cast" && c.ability === "pull")).toBe(false);
  });
});
