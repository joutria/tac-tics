import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/data/abilities";
import { elementMultiplier } from "../src/data/elements";
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { planTurn } from "../src/engine/ai";
import { castProblem, damagePreview, directionBonus, maxRange } from "../src/engine/combat";
import { parseMap } from "../src/engine/grid";
import { canStep, reachable } from "../src/engine/movement";
import { rngNext, seedFrom } from "../src/engine/rng";
import { fromJSON, replay, toJSON } from "../src/engine/save";
import { hasLineOfSight } from "../src/engine/sight";
import { abilityReaches, dangerZone, nextTurnSpots } from "../src/engine/threat";
import { activeUnit, applyCommand, BattleSetup, BattleState, Command, createBattle, delayFor, UnitSpec, unitById, upcomingTurns } from "../src/engine/state";

const setup: BattleSetup = { seed: "test-seed", map: MEADOW, units: TEST_UNITS };

function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}

const flat = (rows = 6, cols = 6) => parseMap("flat", Array.from({ length: rows }, () => Array(cols).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
});

describe("random numbers", () => {
  it("repeat for the same seed and differ for another", () => {
    const run = (seed: string) => { let s = seedFrom(seed); return Array.from({ length: 5 }, () => { const [v, n] = rngNext(s); s = n; return v; }); };
    expect(run("a")).toEqual(run("a"));
    expect(run("a")).not.toEqual(run("b"));
  });
});

describe("element wheel", () => {
  it("matches the Evolvlings multipliers", () => {
    expect(elementMultiplier("fire", "plant")).toBe(1.5);
    expect(elementMultiplier("plant", "fire")).toBe(0.75);
    expect(elementMultiplier("fire", "water")).toBe(1.25);
    expect(elementMultiplier("neutral", "fire")).toBe(1);
    expect(elementMultiplier("light", "star")).toBe(1);
  });
});

describe("movement", () => {
  const m = parseMap("steps", ["g0 g1 g3", "g0 w0 g0", "g0 g0 g0"]);
  it("climbs one level, not two, and drops up to two", () => {
    expect(canStep(m, { x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toBe(true);
    expect(canStep(m, { x: 1, y: 0 }, { x: 2, y: 0 }, 1)).toBe(false);
    expect(canStep(m, { x: 2, y: 0 }, { x: 2, y: 1 }, 1)).toBe(false);
    expect(canStep(m, { x: 1, y: 0 }, { x: 1, y: 1 }, 1)).toBe(false);
  });
  it("respects MP and other units", () => {
    const r = reachable(m, { x: 0, y: 2 }, { mp: 2, jump: 1, blocked: (p) => p.x === 1 && p.y === 2 });
    expect([...r.keys()].sort()).toEqual(["0,0", "0,1"]);
  });
  it("charges Lock to leave a tile next to an agile foe", () => {
    const s = createBattle({ seed: 1, map: flat(), units: [
      unit({ id: "a", team: "heroes", pos: { x: 0, y: 0 }, agi: 5, speed: 60 }),
      unit({ id: "b", team: "foes", pos: { x: 1, y: 0 }, agi: 10 }),
    ] });
    expect(activeUnit(s).id).toBe("a");
    const r = applyCommand(s, { t: "move", unit: "a", to: { x: 0, y: 1 } });
    expect(r.ok && unitById(r.state, "a").mp).toBe(1); // 1 step + 1 Lock
    expect(applyCommand(s, { t: "move", unit: "a", to: { x: 0, y: 3 } }).ok).toBe(false);
  });
});

describe("line of sight", () => {
  const m = parseMap("los", ["g0 g0 r0 g0 g0", "g2 g0 g0 g0 g0"]);
  it("is blocked by a rock on flat ground and clear from higher ground", () => {
    expect(hasLineOfSight(m, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(hasLineOfSight(m, { x: 0, y: 1 }, { x: 4, y: 0 })).toBe(true);
  });
  it("is blocked by a unit in between", () => {
    expect(hasLineOfSight(m, { x: 1, y: 1 }, { x: 4, y: 1 }, (p) => p.x === 2 && p.y === 1)).toBe(false);
  });
});

describe("timeline", () => {
  it("lets faster units act first and more often", () => {
    const s = createBattle(setup);
    expect(activeUnit(s).id).toBe("hero");
    const next = upcomingTurns(s, 24);
    expect(next.filter((id) => id === "foe3").length).toBeGreaterThan(next.filter((id) => id === "foe2").length);
  });
  it("brings a move-only turn back sooner than a turn with an action", () => {
    const a = play(createBattle(setup), [{ t: "endTurn", unit: "hero" }]);
    expect(unitById(a, "hero").ct).toBe(Math.round(delayFor(50) / 2) + Math.round(delayFor(50) * 0.7));
  });
  it("Wait hands the turn to the next unit, then comes straight back", () => {
    const s = createBattle(setup);
    const second = upcomingTurns(s, 2)[1]!;
    const a = play(s, [{ t: "wait", unit: "hero" }]);
    expect(activeUnit(a).id).toBe(second);
    const b = play(a, [{ t: "endTurn", unit: second }]);
    expect(activeUnit(b).id).toBe("hero");
    expect(applyCommand(b, { t: "wait", unit: "hero" }).ok).toBe(false); // once per turn
  });
});

describe("abilities", () => {
  const twoUnits = (heroH = 0) => createBattle({ seed: 3, map: parseMap("h", [`g${heroH} g0 g0 g0 g0 g0 g0 g0`]), units: [
    unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 60, mag: 20, abilities: ["ray", "flare", "prism"] }),
    unit({ id: "f", team: "foes", pos: { x: 5, y: 0 }, hp: 200 }),
  ] });
  it("reach grows with height for ranged abilities", () => {
    const s = twoUnits(0), hi = twoUnits(2);
    expect(maxRange(s, ABILITIES.ray!, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5);
    expect(maxRange(hi, ABILITIES.ray!, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(7);
    expect(maxRange(hi, ABILITIES.bite!, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
  });
  it("previews damage with stats, height and direction", () => {
    const s = twoUnits(0);
    const h = unitById(s, "h"), f = unitById(s, "f");
    expect(damagePreview(s, h, f, ABILITIES.ray!)).toEqual({ min: 9, max: 11 }); // 7-9 x 1.2 Magic x 1.1 (foe faces N, hit from the side)
    expect(directionBonus({ ...f, facing: "E" }, h.pos)).toBe(1.25);
    expect(directionBonus({ ...f, facing: "W" }, h.pos)).toBe(1);
  });
  it("hits, spends AP, respects per-turn limits and cooldowns", () => {
    let s = twoUnits(0);
    s = play(s, [{ t: "cast", unit: "h", ability: "ray", target: { x: 5, y: 0 } }]);
    expect(unitById(s, "f").hp).toBeLessThan(200);
    expect(unitById(s, "h").ap).toBe(3);
    s = play(s, [{ t: "cast", unit: "h", ability: "ray", target: { x: 5, y: 0 } }]);
    expect(castProblem(s, unitById(s, "h"), "ray", { x: 5, y: 0 })).toBe("not enough AP");
    const c = play(twoUnits(0), [{ t: "cast", unit: "h", ability: "prism", target: { x: 5, y: 0 } }]);
    expect(unitById(c, "h").cooldowns.prism).toBe(2);
  });
  it("downs a unit at 0 HP, lets an ally revive it, and kills it if hit again", () => {
    let s = createBattle({ seed: 5, map: flat(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 80, hp: 5 }),
      unit({ id: "h2", team: "heroes", pos: { x: 1, y: 0 }, speed: 70 }),
      unit({ id: "f", team: "foes", pos: { x: 0, y: 3 }, speed: 60, mag: 200, abilities: ["ray"] }),
    ] });
    s = play(s, [{ t: "endTurn", unit: "h" }, { t: "endTurn", unit: "h2" }, { t: "cast", unit: "f", ability: "ray", target: { x: 0, y: 0 } }]);
    expect(unitById(s, "h").life).toBe("downed");
    expect(s.winner).toBeNull();
    s = play(s, [{ t: "endTurn", unit: "f" }]);
    // The downed hero's turn is skipped; h2 helps it up.
    expect(activeUnit(s).id).toBe("h2");
    s = play(s, [{ t: "cast", unit: "h2", ability: "helpUp", target: { x: 0, y: 0 } }]);
    expect(unitById(s, "h").life).toBe("up");
    // The revive costs a quarter of the starting 5 max HP (1), and the unit stands with a quarter of the rest.
    expect(unitById(s, "h").maxHp).toBe(4);
    expect(unitById(s, "h").hp).toBe(1);
  });
  it("allows two revives, each lowering max HP, then the third fall is for good", () => {
    let s = createBattle({ seed: 5, map: flat(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 80, hp: 40 }),
      unit({ id: "h2", team: "heroes", pos: { x: 1, y: 0 }, speed: 70 }),
      unit({ id: "f", team: "foes", pos: { x: 0, y: 3 }, speed: 60, mag: 900, abilities: ["ray"] }),
    ] });
    const maxes: number[] = [];
    for (let fall = 1; fall <= 3; fall++) {
      // Run the timeline until the foe acts, then it fells the hero.
      while (activeUnit(s).id !== "f") s = play(s, [{ t: "endTurn", unit: activeUnit(s).id }]);
      s = play(s, [{ t: "cast", unit: "f", ability: "ray", target: { x: 0, y: 0 } }, { t: "endTurn", unit: "f" }]);
      const h = unitById(s, "h");
      if (fall === 3) { expect(h.life).toBe("dead"); break; }
      expect(h.life).toBe("downed");
      while (activeUnit(s).id !== "h2") s = play(s, [{ t: "endTurn", unit: activeUnit(s).id }]);
      s = play(s, [{ t: "cast", unit: "h2", ability: "helpUp", target: { x: 0, y: 0 } }]);
      maxes.push(unitById(s, "h").maxHp);
    }
    expect(maxes).toEqual([30, 20]);
    expect(unitById(s, "h").revives).toBe(2);
  });
});

describe("enemy AI", () => {
  it("plays a whole turn with legal commands and ends it", () => {
    let s = play(createBattle(setup), [{ t: "endTurn", unit: "hero" }]);
    const id = activeUnit(s).id;
    const cmds = planTurn(s);
    expect(cmds.at(-1)).toEqual({ t: "endTurn", unit: id });
    s = play(s, cmds);
    expect(activeUnit(s).id).not.toBe(id);
  });
  it("finishes a downed enemy in reach", () => {
    let s = createBattle({ seed: 9, map: flat(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 40, hp: 1 }),
      unit({ id: "h2", team: "heroes", pos: { x: 5, y: 5 }, speed: 30 }),
      unit({ id: "f", team: "foes", pos: { x: 0, y: 3 }, speed: 60, abilities: ["ray"], ai: "caster" }),
    ] });
    s = play(s, [{ t: "cast", unit: "f", ability: "ray", target: { x: 0, y: 0 } }]);
    expect(unitById(s, "h").life).toBe("downed");
    const cmds = planTurn(s);
    s = play(s, cmds);
    expect(unitById(s, "h").life).toBe("dead");
  });
  it("prefers a spot out of the hero's line of sight", () => {
    // The foe can hide behind the rock column or stay in the open; the hero's ray is ready.
    const map = parseMap("cover", [
      "g0 g0 g0 g0 g0 g0",
      "g0 g0 g0 r0 g0 g0",
      "g0 g0 g0 r0 g0 g0",
      "g0 g0 g0 r0 g0 g0",
    ]);
    const s = createBattle({ seed: 2, map, units: [
      unit({ id: "f", team: "foes", pos: { x: 4, y: 0 }, speed: 60, abilities: [], ai: "caster" }),
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 2 }, speed: 40, mag: 20, abilities: ["ray"] }),
    ] });
    const end = play(s, planTurn(s));
    const f = unitById(end, "f");
    expect(hasLineOfSight(map, { x: 0, y: 2 }, f.pos)).toBe(false);
  });
});

describe("saves", () => {
  it("replay the same battle from setup + commands, through JSON", () => {
    let live = createBattle(setup);
    const cmds: Command[] = [];
    for (let i = 0; i < 6 && !live.winner; i++) {
      const turn = planTurn(live);
      cmds.push(...turn);
      live = play(live, turn);
    }
    const loaded = fromJSON(toJSON({ version: 2, setup, commands: cmds }));
    expect(replay(loaded.setup, loaded.commands)).toEqual(live);
  });
});

describe("danger zone", () => {
  it("matches the real cast rules: every tile in the zone can be hit from some spot the foe can reach", () => {
    const s = createBattle({ seed: 1, map: MEADOW, units: TEST_UNITS });
    for (const f of s.units.filter((u) => u.team === "foes")) {
      const zone = dangerZone(s, f);
      expect(zone.size).toBeGreaterThan(0);
      const spots = nextTurnSpots(s, f);
      for (const [k, ids] of zone) {
        const [x, y] = k.split(",").map(Number);
        for (const id of ids) {
          const ab = ABILITIES[id]!;
          expect(spots.some((from) => abilityReaches(s, ab, from, { x: x!, y: y! }, f.id))).toBe(true);
        }
      }
    }
  });

  it("leaves out abilities still on cooldown next turn", () => {
    const s = createBattle({ seed: 1, map: MEADOW, units: TEST_UNITS });
    const f = s.units.find((u) => u.id === "foe2")!;
    const all = new Set([...dangerZone(s, f).values()].flat());
    expect(all.has("snare")).toBe(true);
    f.cooldowns.snare = 2;
    const after = new Set([...dangerZone(s, f).values()].flat());
    expect(after.has("snare")).toBe(false);
  });
});
