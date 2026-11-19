import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/data/abilities";
import { elementMultiplier } from "../src/data/elements";
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { planTurn } from "../src/engine/ai";
import { castProblem, damageFactor, damagePreview, directionBonus, maxRange } from "../src/engine/combat";
import { parseMap } from "../src/engine/grid";
import { canStep, reachable } from "../src/engine/movement";
import { rngNext, seedFrom } from "../src/engine/rng";
import { fromJSON, replay, toJSON } from "../src/engine/save";
import { hasLineOfSight } from "../src/engine/sight";
import { abilityReaches, dangerZone, nextTurnSpots } from "../src/engine/threat";
import { activeUnit, applyCommand, BattleSetup, BattleState, Command, createBattle, delayFor, roundOf, UnitSpec, unitAt, unitById, upcomingTurns } from "../src/engine/state";
import { activeRivals, afterBattle, pickCounter, readStyle, rivalSpec, rivalTaunt, RESIST_STEP } from "../src/run/rivals";
import { ESCAPE_FROM_ROUND, FLEE_TAKEN, RETREAT_TAKEN, turnMp, wavering } from "../src/engine/escape";

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

describe("escapes", () => {
  // Hero h (fast) and a Savia-marked foe f in the middle of a 7x7 field.
  const field = (foe: Partial<UnitSpec> = {}, hero: Partial<UnitSpec> = {}) => createBattle({ seed: 3, map: flat(7, 7), units: [
    unit({ id: "h", team: "heroes", pos: { x: 3, y: 5 }, speed: 60, ...hero }),
    unit({ id: "f", team: "foes", pos: { x: 3, y: 3 }, speed: 50, marked: true, ...foe }),
  ] });
  const pass = (s: BattleState) => play(s, [{ t: "endTurn", unit: activeUnit(s).id }]);
  const toRound = (s: BattleState, r: number) => { while (roundOf(s) < r) s = pass(s); return s; };

  it("waits for round 3, then a foe under 5% HP flees", () => {
    let s = field();
    unitById(s, "f").hp = 1;
    s = pass(s);
    expect(unitById(s, "f").escape).toBe("none");
    expect(wavering(unitById(s, "f"), roundOf(s))).toBe(true);
    s = toRound(s, ESCAPE_FROM_ROUND);
    expect(unitById(s, "f").escape).toBe("flee");
  });

  it("retreats only after downing someone, under half HP, and never steps back down", () => {
    let s = toRound(field(), ESCAPE_FROM_ROUND);
    unitById(s, "f").hp = 15;
    s = pass(s);
    expect(unitById(s, "f").escape).toBe("none");
    unitById(s, "f").downs = 1;
    const r = applyCommand(s, { t: "endTurn", unit: activeUnit(s).id });
    expect(r.ok && unitById(r.state, "f").escape).toBe("retreat");
    expect(r.ok && r.events.some((e) => e.e === "escapeState" && e.unit === "f")).toBe(true);
    if (!r.ok) return;
    unitById(r.state, "f").hp = 40;
    expect(unitById(pass(r.state), "f").escape).toBe("retreat");
  });

  it("changes damage taken and MP", () => {
    const s = field({}, { mag: 100 });
    const h = unitById(s, "h"), f = unitById(s, "f"), ray = ABILITIES.ray!;
    const base = damageFactor(s, h, f, ray);
    f.escape = "retreat";
    expect(damageFactor(s, h, f, ray)).toBeCloseTo(base * RETREAT_TAKEN);
    expect(turnMp(f)).toBe(2);
    f.escape = "flee";
    expect(damageFactor(s, h, f, ray)).toBeCloseTo(base * FLEE_TAKEN);
    expect(turnMp(f)).toBe(5);
  });

  it("pins a fleeing foe with Lock 2 per adjacent enemy, whatever the agility", () => {
    const s = field({ agi: 50 }, { pos: { x: 3, y: 4 }, agi: 1 });
    while (activeUnit(s).id !== "f") Object.assign(s, pass(s));
    const f = unitById(s, "f");
    f.escape = "flee"; f.mp = 5;
    const r = applyCommand(s, { t: "move", unit: "f", to: { x: 2, y: 3 } });
    expect(r.ok && unitById(r.state, "f").mp).toBe(2); // 1 step + Lock 2
  });

  it("lets an escaping foe leave only from the edge; the last one out ends the battle", () => {
    let s = field({ pos: { x: 3, y: 1 } });
    while (activeUnit(s).id !== "f") s = pass(s);
    expect(applyCommand(s, { t: "escape", unit: "f" }).ok).toBe(false); // not escaping yet
    unitById(s, "f").escape = "flee";
    expect(applyCommand(s, { t: "escape", unit: "f" }).ok).toBe(false); // not on the edge
    s = play(s, [{ t: "move", unit: "f", to: { x: 3, y: 0 } }]);
    expect(applyCommand(s, { t: "escape", unit: "f" }).ok).toBe(false); // reached the edge this turn: one more turn
    s = play(s, [{ t: "endTurn", unit: "f" }]);
    while (activeUnit(s).id !== "f") s = pass(s);
    s = play(s, [{ t: "escape", unit: "f" }]);
    expect(unitById(s, "f").life).toBe("escaped");
    expect(unitAt(s, { x: 3, y: 0 })).toBeUndefined();
    expect(s.winner).toBe("heroes");
  });

  it("the AI runs a fleeing foe to the edge, then out on its next turn", () => {
    let s = field({ pos: { x: 3, y: 2 } });
    while (activeUnit(s).id !== "f") s = pass(s);
    unitById(s, "f").escape = "flee";
    unitById(s, "f").mp = turnMp(unitById(s, "f"));
    s = play(s, planTurn(s));
    expect(unitById(s, "f").pos.y).toBe(0);
    expect(unitById(s, "f").life).toBe("up");
    while (activeUnit(s).id !== "f") s = pass(s);
    const cmds = planTurn(s);
    expect(cmds.at(-1)).toEqual({ t: "escape", unit: "f" });
    expect(unitById(play(s, cmds), "f").life).toBe("escaped");
  });

  it("danger zone counts the tile the foe stands on", () => {
    const s = field();
    unitById(s, "f").rooted = true;
    expect(nextTurnSpots(s, unitById(s, "f"))).toEqual([{ x: 3, y: 3 }]);
    expect(dangerZone(s, unitById(s, "f")).size).toBeGreaterThan(0);
  });
});

describe("rivals", () => {
  // The hero shoots the foe from range with Ray (light), then the foe runs off the edge.
  const units = [
    unit({ id: "h", name: "Tila", team: "heroes", pos: { x: 3, y: 5 }, speed: 60, abilities: ["ray", "glow"] }),
    unit({ id: "f", team: "foes", pos: { x: 3, y: 1 }, speed: 50, marked: true, abilities: ["bite"] }),
  ];
  const setup: BattleSetup = { seed: 9, map: flat(7, 7), units };
  function escapedBattle() {
    let s = createBattle(setup);
    const cmds: Command[] = [];
    const run = (c: Command) => { s = play(s, [c]); cmds.push(c); };
    run({ t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 1 } });
    run({ t: "cast", unit: "h", ability: "glow", target: { x: 3, y: 5 } });
    run({ t: "endTurn", unit: "h" });
    // Fast-forward: the foe is fleeing and steps to the edge, then leaves on its next turn.
    unitById(s, "f").escape = "flee";
    run({ t: "move", unit: "f", to: { x: 3, y: 0 } });
    run({ t: "endTurn", unit: "f" });
    while (activeUnit(s).id !== "f") run({ t: "endTurn", unit: activeUnit(s).id });
    s = { ...s };
    return { s, cmds };
  }

  it("reads the party's style from the battle", () => {
    const { cmds } = escapedBattle();
    const style = readStyle(setup, cmds.slice(0, 3));
    expect(style).toEqual({ element: "light", range: "far", opener: "ray", protects: true });
  });

  it("turns an escaped foe into a rival with a counter, and makes it stronger each time it gets away", () => {
    const base = createBattle(setup);
    const end = structuredClone(base);
    unitById(end, "f").life = "escaped"; end.winner = "heroes";
    const cmds: Command[] = [{ t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 1 } }];
    let rivals = afterBattle([], setup, cmds, end);
    expect(rivals).toHaveLength(1);
    const r = rivals[0]!;
    expect(r.cause).toEqual({ kind: "escaped", hero: "Tila" });
    expect(r.counters).toEqual([{ kind: "resist", element: "light" }]);
    const spec = rivalSpec(r, "en");
    expect(spec.res.light).toBe(RESIST_STEP);
    expect(spec.rival).toBe(true);
    expect(rivalTaunt(r, "en")).toContain("light");
    expect(rivalTaunt(r, "es")).toContain("luz");
    // Same battle, same rival: deterministic.
    expect(afterBattle([], setup, cmds, end)).toEqual(rivals);
    // It gets away again: level 2, and its light resistance grows, since the party still leans on light.
    rivals = afterBattle(rivals, setup, cmds, end);
    expect(rivals[0]!.level).toBe(2);
    expect(rivals[0]!.counters.map((c) => c.kind)).toEqual(["resist", "resist"]);
    expect(rivalSpec(rivals[0]!, "en").res.light).toBe(2 * RESIST_STEP);
    expect(rivalSpec(rivals[0]!, "en").hp).toBeGreaterThan(40);
  });

  it("is finished when the party beats it", () => {
    const base = createBattle(setup);
    const end = structuredClone(base);
    unitById(end, "f").life = "escaped"; end.winner = "heroes";
    const rivals = afterBattle([], setup, [], end);
    const beaten = structuredClone(base);
    unitById(beaten, "f").life = "dead"; beaten.winner = "heroes";
    expect(activeRivals(afterBattle(rivals, setup, [], beaten))).toHaveLength(0);
  });

  it("picks counters it lacks before repeating one", () => {
    const style = { element: null, range: "far" as const, opener: null, protects: true };
    expect(pickCounter({ counters: [] }, style).kind).toBe("closer");
    expect(pickCounter({ counters: [{ kind: "closer" }] }, style).kind).toBe("hunter");
  });

  it("a hunter goes for the healer", () => {
    const s = createBattle({ seed: 2, map: flat(7, 7), units: [
      unit({ id: "a", team: "heroes", pos: { x: 2, y: 3 }, speed: 10, hp: 30, abilities: ["ray"] }),
      unit({ id: "b", team: "heroes", pos: { x: 4, y: 3 }, speed: 10, hp: 40, abilities: ["glow"] }),
      unit({ id: "f", team: "foes", pos: { x: 3, y: 3 }, speed: 90, abilities: ["bite"], hunts: "healer", mp: 0 }),
    ] });
    const cast = planTurn(s).find((c) => c.t === "cast");
    expect(cast && cast.t === "cast" && cast.target).toEqual({ x: 4, y: 3 });
  });
});

describe("point-blank", () => {
  it("the hero can Ray an adjacent foe, and Flare next to itself spares the caster", () => {
    let s = createBattle({ seed: 4, map: flat(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 2, y: 2 }, speed: 90, abilities: ["ray", "flare"] }),
      unit({ id: "f", team: "foes", pos: { x: 2, y: 3 }, speed: 10 }),
    ] });
    expect(castProblem(s, unitById(s, "h"), "ray", { x: 2, y: 3 })).toBeNull();
    s = play(s, [{ t: "cast", unit: "h", ability: "flare", target: { x: 2, y: 3 } }]);
    expect(unitById(s, "h").hp).toBe(40);
    expect(unitById(s, "f").hp).toBeLessThan(40);
  });
});
