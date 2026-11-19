import { describe, expect, it } from "vitest";
import { elementMultiplier } from "../src/data/elements";
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { parseMap } from "../src/engine/grid";
import { canStep, reachable } from "../src/engine/movement";
import { rngNext, seedFrom } from "../src/engine/rng";
import { fromJSON, replay, toJSON } from "../src/engine/save";
import { hasLineOfSight } from "../src/engine/sight";
import { activeUnit, applyCommand, BattleSetup, Command, createBattle } from "../src/engine/state";

const setup: BattleSetup = { seed: "test-seed", map: MEADOW, units: TEST_UNITS };

describe("random numbers", () => {
  it("repeat for the same seed and differ for another", () => {
    const run = (seed: string) => { let s = seedFrom(seed); return Array.from({ length: 5 }, () => { const [v, n] = rngNext(s); s = n; return v; }); };
    expect(run("a")).toEqual(run("a"));
    expect(run("a")).not.toEqual(run("b"));
  });
});

describe("element wheel", () => {
  it("matches the Evolvlings multipliers", () => {
    expect(elementMultiplier("fire", "plant")).toBe(1.5);   // fire beats plant
    expect(elementMultiplier("plant", "fire")).toBe(0.75);
    expect(elementMultiplier("fire", "water")).toBe(1.25);  // opposites
    expect(elementMultiplier("star", "fire")).toBe(1);
  });
});

describe("movement", () => {
  const m = parseMap("steps", [
    "g0 g1 g3",
    "g0 w0 g0",
    "g0 g0 g0",
  ]);
  it("climbs one level, not two, and drops up to two", () => {
    expect(canStep(m, { x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toBe(true);
    expect(canStep(m, { x: 1, y: 0 }, { x: 2, y: 0 }, 1)).toBe(false);
    expect(canStep(m, { x: 2, y: 0 }, { x: 2, y: 1 }, 1)).toBe(false); // drop of 3
    expect(canStep(m, { x: 1, y: 0 }, { x: 1, y: 1 }, 1)).toBe(false); // water
  });
  it("respects MP and other units", () => {
    const r = reachable(m, { x: 0, y: 2 }, { mp: 2, jump: 1, blocked: (p) => p.x === 1 && p.y === 2 });
    expect([...r.keys()].sort()).toEqual(["0,0", "0,1"]);
  });
});

describe("line of sight", () => {
  const m = parseMap("los", [
    "g0 g0 r0 g0 g0",
    "g2 g0 g0 g0 g0",
  ]);
  it("is blocked by a rock on flat ground", () => {
    expect(hasLineOfSight(m, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });
  it("is clear from higher ground over the rock", () => {
    expect(hasLineOfSight(m, { x: 0, y: 1 }, { x: 4, y: 0 })).toBe(true);
  });
  it("is blocked by a unit in between", () => {
    expect(hasLineOfSight(m, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(true);
    expect(hasLineOfSight(m, { x: 1, y: 1 }, { x: 4, y: 1 }, (p) => p.x === 2 && p.y === 1)).toBe(false);
  });
});

describe("battle commands", () => {
  it("orders turns by speed", () => {
    expect(createBattle(setup).order).toEqual(["hero", "foe3", "foe1", "foe2"]);
  });
  it("moves the active unit and spends MP", () => {
    const s = createBattle(setup);
    const r = applyCommand(s, { t: "move", unit: "hero", to: { x: 2, y: 4 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(activeUnit(r.state).pos).toEqual({ x: 2, y: 4 });
    expect(activeUnit(r.state).mp).toBe(1);
    expect(activeUnit(s).mp).toBe(3); // input untouched
  });
  it("rejects a command from a unit whose turn it is not", () => {
    const r = applyCommand(createBattle(setup), { t: "endTurn", unit: "foe1" });
    expect(r.ok).toBe(false);
  });
  it("refills MP at the start of the next turn and counts rounds", () => {
    let s = createBattle(setup);
    for (const id of s.order) { const r = applyCommand(s, { t: "endTurn", unit: id }); if (!r.ok) throw new Error(r.error); s = r.state; }
    expect(s.round).toBe(2);
    expect(activeUnit(s).id).toBe("hero");
  });
});

describe("saves", () => {
  it("replay the same battle from setup + commands, through JSON", () => {
    const cmds: Command[] = [
      { t: "move", unit: "hero", to: { x: 2, y: 4 } },
      { t: "endTurn", unit: "hero" },
      { t: "move", unit: "foe3", to: { x: 5, y: 7 } },
    ];
    let live = createBattle(setup);
    for (const c of cmds) { const r = applyCommand(live, c); if (!r.ok) throw new Error(r.error); live = r.state; }
    const loaded = fromJSON(toJSON({ version: 1, setup, commands: cmds }));
    expect(replay(loaded.setup, loaded.commands)).toEqual(live);
  });
});
