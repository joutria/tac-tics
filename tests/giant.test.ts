import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/data/abilities";
import { BOSS, HOLLOW_ARENA, REGIONS } from "../src/data/region";
import { planTurn } from "../src/engine/ai";
import { castProblem, damageFactor, directionBonus, pushOutcome, BACK_BONUS } from "../src/engine/combat";
import { bodyGap, cellsOf, nearestCell, parseMap } from "../src/engine/grid";
import { reachable } from "../src/engine/movement";
import { hasLineOfSight } from "../src/engine/sight";
import { dangerZone } from "../src/engine/threat";
import { applyCommand, bodiesInWay, BattleState, Command, createBattle, moveRules, unitAt, unitById, type UnitSpec } from "../src/engine/state";
import { battleSetup, newRun } from "../src/run/run";

function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}
const flat = (rows = 8, cols = 8) => parseMap("flat", Array.from({ length: rows }, () => Array(cols).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
});
/** A giant foe with its corner at `pos`, and the hero; the giant acts first unless `heroFirst`. */
function arena(map = flat(), pos = { x: 3, y: 3 }, hero = { x: 0, y: 0 }, extra: UnitSpec[] = [], heroFirst = false) {
  return createBattle({
    seed: "giant", map, units: [
      unit({ id: "hero", team: "heroes", pos: hero, speed: heroFirst ? 90 : 10, str: 0 }),
      unit({ id: "giant", team: "foes", pos, size: 2, hp: 120, speed: heroFirst ? 10 : 90, str: 10, abilities: ["bite", "stomp"], ai: "bruiser" }),
      ...extra,
    ],
  });
}

describe("giant footprint", () => {
  it("covers four tiles", () => {
    const s = arena();
    for (const c of cellsOf({ x: 3, y: 3 }, 2)) expect(unitAt(s, c)?.id).toBe("giant");
    expect(unitAt(s, { x: 5, y: 3 })).toBeUndefined();
    expect(bodyGap({ x: 3, y: 3 }, 2, { x: 5, y: 4 }, 1)).toBe(1);
    expect(nearestCell({ x: 3, y: 3 }, 2, { x: 0, y: 7 })).toEqual({ x: 3, y: 4 });
  });

  it("cannot start where one of its tiles is blocked", () => {
    const m = parseMap("w", ["g0 g0 g0", "g0 w0 g0", "g0 g0 g0"]);
    expect(() => createBattle({ seed: 1, map: m, units: [unit({ id: "g", team: "foes", pos: { x: 0, y: 0 }, size: 2 }), unit({ id: "h", team: "heroes", pos: { x: 2, y: 2 } })] })).toThrow();
  });
});

describe("giant movement", () => {
  it("moves only where its whole body fits", () => {
    // A rock in the middle column: the giant (2 wide) cannot pass on either side of it in a 3-wide corridor.
    const m = parseMap("corridor", ["g0 g0 g0", "g0 g0 g0", "g0 r1 g0", "g0 g0 g0", "g0 g0 g0"]);
    const s = createBattle({ seed: 1, map: m, units: [unit({ id: "g", team: "foes", pos: { x: 0, y: 0 }, size: 2, mp: 6 }), unit({ id: "h", team: "heroes", pos: { x: 2, y: 4 } })] });
    const r = reachable(s.map, { x: 0, y: 0 }, moveRules(s, unitById(s, "g")));
    expect(r.has("1,0")).toBe(true);
    expect(r.has("0,2")).toBe(false);
    expect(r.has("0,3")).toBe(false);
  });

  it("is blocked by any unit under its new tiles", () => {
    const s = arena(flat(), { x: 3, y: 3 }, { x: 5, y: 3 });
    const r = reachable(s.map, { x: 3, y: 3 }, moveRules(s, unitById(s, "giant")));
    expect(r.has("4,3")).toBe(false);
    expect(r.has("4,2")).toBe(false);
    expect(r.has("2,3")).toBe(true);
  });

  it("crushes crates and tramples tall grass as it walks", () => {
    const m = parseMap("crates", ["g0 g0 g0 g0", "g0 g0 g0 g0", "g0C h0 g0 g0", "h0 g0 g0 g0", "g0 g0 g0 g0"]);
    let s = createBattle({ seed: 1, map: m, units: [unit({ id: "g", team: "foes", pos: { x: 0, y: 0 }, size: 2, speed: 90 }), unit({ id: "h", team: "heroes", pos: { x: 3, y: 4 }, speed: 10 })] });
    const r = applyCommand(s, { t: "move", unit: "g", to: { x: 0, y: 2 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.map.tiles[2 * 4 + 0]!.prop).toBeUndefined();
    expect(s.map.tiles[2 * 4 + 1]!.terrain).toBe("grass");
    expect(s.map.tiles[3 * 4 + 0]!.terrain).toBe("grass");
    expect(r.events.some((e) => e.e === "trampled" && e.crushed.length === 1)).toBe(true);
  });

  it("still cannot walk through barrels or rocks", () => {
    const m = parseMap("barrel", ["g0 g0 g0", "g0 g0 g0", "g0B g0 g0", "g0 g0 g0"]);
    const s = createBattle({ seed: 1, map: m, units: [unit({ id: "g", team: "foes", pos: { x: 0, y: 0 }, size: 2 }), unit({ id: "h", team: "heroes", pos: { x: 2, y: 3 } })] });
    expect(reachable(s.map, { x: 0, y: 0 }, moveRules(s, unitById(s, "g"))).has("0,1")).toBe(false);
  });

  it("each tile keeps to the climb limit", () => {
    const m = parseMap("cliff", ["g0 g0 g2", "g0 g0 g2", "g0 g0 g2"]);
    const s = createBattle({ seed: 1, map: m, units: [unit({ id: "g", team: "foes", pos: { x: 0, y: 0 }, size: 2 }), unit({ id: "h", team: "heroes", pos: { x: 0, y: 2 } })] });
    expect(reachable(s.map, { x: 0, y: 0 }, moveRules(s, unitById(s, "g"))).has("1,0")).toBe(false);
  });
});

describe("hitting a giant", () => {
  it("can be targeted on any of its tiles and is hit once by an area", () => {
    const s = arena(flat(), { x: 3, y: 3 }, { x: 1, y: 3 }, [], true);
    expect(castProblem(s, unitById(s, "hero"), "ray", { x: 4, y: 4 })).toBeNull();
    // A cross centred between two of its tiles still hits it once.
    const ab = { ...ABILITIES.blaze!, range: [1, 6] as [number, number] };
    ABILITIES.testBlaze = { ...ab, id: "testBlaze" };
    try {
      const me = createBattle({ seed: "g", map: flat(), units: [
        unit({ id: "hero", team: "heroes", pos: { x: 0, y: 3 }, speed: 90, mag: 10, abilities: ["testBlaze"] }),
        unit({ id: "giant", team: "foes", pos: { x: 3, y: 3 }, size: 2, hp: 200, speed: 10 }),
      ] });
      const r = applyCommand(me, { t: "cast", unit: "hero", ability: "testBlaze", target: { x: 3, y: 3 } });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const ev = r.events.find((e) => e.e === "cast");
        expect(ev && ev.e === "cast" && ev.hits.filter((h) => h.unit === "giant" && !h.source).length).toBe(1);
      }
    } finally { delete ABILITIES.testBlaze; }
  });

  it("is hit from behind measured from the middle of its body", () => {
    const s = arena();
    const g = { ...unitById(s, "giant"), facing: "N" as const };
    expect(directionBonus(g, { x: 3, y: 5 })).toBe(BACK_BONUS);
    expect(directionBonus(g, { x: 4, y: 2 })).toBe(1);
  });

  it("attacks from its tile closest to the target", () => {
    const s = arena(flat(), { x: 3, y: 3 }, { x: 5, y: 4 });
    expect(castProblem(s, unitById(s, "giant"), "bite", { x: 5, y: 4 })).toBeNull();
    expect(damageFactor(s, unitById(s, "giant"), unitById(s, "hero"), ABILITIES.bite!)).toBeGreaterThan(0);
  });
});

describe("giants block sight", () => {
  it("like a wall, even from higher ground", () => {
    const m = parseMap("lane", ["g1 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0"]);
    const s = createBattle({ seed: 1, map: m, units: [
      unit({ id: "a", team: "heroes", pos: { x: 0, y: 0 } }), unit({ id: "b", team: "heroes", pos: { x: 6, y: 0 } }),
      unit({ id: "g", team: "foes", pos: { x: 3, y: 0 }, size: 2 }),
    ] });
    expect(hasLineOfSight(s.map, { x: 0, y: 0 }, { x: 6, y: 0 }, bodiesInWay(s, ["a"], { x: 6, y: 0 }))).toBe(false);
    // A normal unit in the same spot does not block a shot from higher ground.
    const t = createBattle({ seed: 1, map: m, units: [
      unit({ id: "a", team: "heroes", pos: { x: 0, y: 0 } }), unit({ id: "b", team: "heroes", pos: { x: 6, y: 0 } }),
      unit({ id: "g", team: "foes", pos: { x: 3, y: 0 } }),
    ] });
    expect(hasLineOfSight(t.map, { x: 0, y: 0 }, { x: 6, y: 0 }, bodiesInWay(t, ["a"], { x: 6, y: 0 }))).toBe(true);
  });
});

describe("pushing a giant", () => {
  it("a plain Shove cannot move it", () => {
    const s = arena(flat(), { x: 3, y: 3 }, { x: 2, y: 3 }, [], true);
    expect(castProblem(s, unitById(s, "hero"), "shove", { x: 3, y: 3 })).toBe("too heavy to shove");
  });

  it("a 2-tile push moves its whole body 1 tile, and it can be knocked off a ledge", () => {
    const m = parseMap("ledge", ["g0 g1 g1 g1 g0", "g0 g1 g1 g1 g0", "g0 g0 g0 g0 g0"]);
    const s = createBattle({ seed: 1, map: m, units: [
      unit({ id: "hero", team: "heroes", pos: { x: 0, y: 0 }, str: 10 }), unit({ id: "giant", team: "foes", pos: { x: 2, y: 0 }, size: 2 }),
    ] });
    // From the west side of its middle: pushed east by 1, off the ledge (its highest tile drops 1 level).
    const out = pushOutcome(s, unitById(s, "hero"), unitById(s, "giant"), { x: 1, y: 0 }, 1);
    expect(out.to).toEqual({ x: 3, y: 0 });
    expect(out.fell).toBe(0);
    const off = pushOutcome(s, unitById(s, "hero"), unitById(s, "giant"), { x: 1, y: 0 }, 2);
    expect(off.to).toEqual({ x: 3, y: 0 });
    expect(off.blocker).toBe("edge");
    const m2 = parseMap("ledge2", ["g1 g1 g1 g0 g0 g0", "g1 g1 g1 g0 g0 g0"]);
    const s2 = createBattle({ seed: 1, map: m2, units: [
      unit({ id: "hero", team: "heroes", pos: { x: 0, y: 0 } }), unit({ id: "giant", team: "foes", pos: { x: 1, y: 0 }, size: 2 }),
    ] });
    const fall = pushOutcome(s2, unitById(s2, "hero"), unitById(s2, "giant"), { x: 0, y: 0 }, 1);
    expect(fall.to).toEqual({ x: 2, y: 0 });
    expect(fall.fell).toBe(0); // still on one high tile
    const fall2 = pushOutcome(s2, unitById(s2, "hero"), unitById(s2, "giant"), { x: 0, y: 0 }, 2);
    expect(fall2.to).toEqual({ x: 3, y: 0 });
    expect(fall2.fell).toBe(1);
    expect(fall2.fall).toBeGreaterThan(0);
  });
});

describe("giant AI and threat", () => {
  it("plays whole turns and reaches the hero", () => {
    let s = arena(flat(10, 10), { x: 6, y: 6 }, { x: 1, y: 1 });
    for (let i = 0; i < 12 && !s.winner; i++) s = play(s, planTurn(s));
    const g = unitById(s, "giant"), h = unitById(s, "hero");
    expect(bodyGap(g.pos, 2, h.pos, 1) <= 1 || h.life !== "up").toBe(true);
  });

  it("its danger zone covers tiles next to any side", () => {
    const s = arena(flat(10, 10), { x: 4, y: 4 }, { x: 0, y: 0 });
    const z = dangerZone(s, unitById(s, "giant"));
    for (const p of ["4,3", "6,4", "5,6", "3,5"]) expect(z.has(p)).toBe(true);
  });
});

describe("the boss lair", () => {
  it("the first region's boss is a 2x2 giant in the Sap Hollow", () => {
    expect(REGIONS[0]!.boss).toBe(BOSS);
    expect(BOSS.size).toBe(2);
    for (const c of cellsOf(HOLLOW_ARENA.foes[0]!, 2)) expect(HOLLOW_ARENA.map.tiles[c.y * HOLLOW_ARENA.map.w + c.x]!.prop).toBeUndefined();
    const run = newRun("lair-seed");
    const boss = run.map.nodes.find((n) => n.kind === "boss")!;
    const setup = battleSetup(run, boss.id, "en");
    const giant = setup.units.find((u) => u.size === 2)!;
    expect(giant).toBeDefined();
    expect(giant.abilities).toContain("stomp");
    expect(giant.heavy).toBeUndefined();
    expect(setup.map.id).toBe("hollow");
    // The whole fight runs with the AI on both sides without errors.
    let s = createBattle(setup);
    for (let i = 0; i < 300 && !s.winner; i++) s = play(s, planTurn(s));
    expect(s.winner).not.toBeNull();
  });
});

describe("brutes lead elite fights", () => {
  it("every arena has room for its region's brute, clear of the party and the other foes", () => {
    for (const r of REGIONS) {
      if (!r.brute) continue;
      expect(r.brute.size).toBe(2);
      for (const a of r.arenas) {
        expect(a.giant).toBeDefined();
        const cells = cellsOf(a.giant!, 2);
        const others = [a.hero, ...a.allies, ...a.foes.slice(1)];
        expect(cells.some((c) => others.some((p) => p.x === c.x && p.y === c.y))).toBe(false);
      }
    }
  });

  it("fields the brute as a 2x2 giant in elite fights, in both regions, ambushes and floods included", () => {
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const run = newRun(`brute${i}`);
      for (const region of [0, 1]) {
        const r = { ...run, region };
        for (const n of r.map.nodes.filter((n) => n.kind === "elite")) {
          const setup = battleSetup(r, n.id, "en");
          const s = createBattle(setup); // throws if any body stands where it can't
          const brute = s.units.find((u) => u.look === REGIONS[region]!.brute!.look);
          expect(brute?.size).toBe(2);
          expect(brute?.marked).toBeFalsy();
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
