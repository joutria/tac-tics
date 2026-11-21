import { describe, expect, it } from "vitest";
import { ABILITIES, type Ability } from "../src/data/abilities";
import { elementMultiplier } from "../src/data/elements";
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { planTurn } from "../src/engine/ai";
import { castProblem, fallDamage, damageFactor, damagePreview, directionBonus, maxRange, previewEffects } from "../src/engine/combat";
import { parseMap } from "../src/engine/grid";
import { canStep, reachable } from "../src/engine/movement";
import { rngNext, seedFrom } from "../src/engine/rng";
import { fromJSON, replay, toJSON } from "../src/engine/save";
import { hasLineOfSight } from "../src/engine/sight";
import { abilityReaches, dangerZone, nextTurnSpots } from "../src/engine/threat";
import { activeUnit, applyCommand, BattleSetup, BattleState, Command, createBattle, delayFor, roundOf, UnitSpec, unitAt, unitById, upcomingTurns } from "../src/engine/state";
import { activeRivals, afterBattle, pickCounter, readStyle, rivalSpec, rivalTaunt, RESIST_STEP } from "../src/run/rivals";
import { BLAST_DAMAGE, IMPACT } from "../src/engine/terrain";
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

describe("status effects", () => {
  // Test-only abilities, one per status.
  const mk = (id: string, status: Ability["status"], target: Ability["target"] = "foe", damage = true): Ability => ({
    id, element: "neutral", ap: 2, range: [0, 6], los: false, target, area: "single", cooldown: 0, perTurn: 3,
    ...(damage ? { damage: { min: 1, max: 1, stat: "mag" as const } } : {}), status,
  });
  Object.assign(ABILITIES, {
    tBurn: mk("tBurn", { id: "burn", turns: 2, power: 5 }),
    tPoison: mk("tPoison", { id: "poison", turns: 3, power: 4 }),
    tStun: mk("tStun", { id: "stun", turns: 1, power: 0 }),
    tSlow: mk("tSlow", { id: "slow", turns: 2, power: 2 }),
    tWeak: mk("tWeak", { id: "weaken", turns: 2, power: 0 }),
    tShield: mk("tShield", { id: "shield", turns: 2, power: 10 }, "ally", false),
    tRegen: mk("tRegen", { id: "regen", turns: 2, power: 6 }, "ally", false),
    tSplash: { ...mk("tSplash", undefined), element: "water" as const },
    tHeal: { ...mk("tHeal", undefined, "ally", false), heal: { min: 10, max: 10 } },
  });
  const duel = () => createBattle({ seed: 9, map: flat(), units: [
    unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 60, abilities: Object.keys(ABILITIES).filter((k) => k.startsWith("t")) }),
    unit({ id: "f", team: "foes", pos: { x: 3, y: 0 }, hp: 100 }),
  ] });
  const end = (s: BattleState, id: string) => play(s, [{ t: "endTurn", unit: id }]);
  const cast = (s: BattleState, ability: string, target = { x: 3, y: 0 }) => play(s, [{ t: "cast", unit: "h", ability, target }]);

  it("burn hurts at the start of the target's turns, then wears off", () => {
    let s = cast(duel(), "tBurn");
    const hp = unitById(s, "f").hp;
    const ticks: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = applyCommand(s, { t: "endTurn", unit: s.active });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      for (const e of r.events) if (e.e === "tick") ticks.push(e.damage);
    }
    expect(ticks).toEqual([5, 5]);
    expect(unitById(s, "f").hp).toBe(hp - 10);
    expect(unitById(s, "f").statuses).toEqual([]);
  });
  it("water puts out a burn", () => {
    const s = cast(cast(duel(), "tBurn"), "tSplash");
    expect(unitById(s, "f").statuses).toEqual([]);
  });
  it("poison halves healing", () => {
    let s = duel();
    const h = s.units.find((u) => u.id === "h")!;
    h.hp = 20; h.statuses.push({ id: "poison", turns: 2, power: 1 });
    s = cast(s, "tHeal", { x: 0, y: 0 });
    expect(unitById(s, "h").hp).toBe(25);
  });
  it("stun skips one turn and cannot chain", () => {
    let s = cast(duel(), "tStun");
    const r = applyCommand(s, { t: "endTurn", unit: "h" });
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.e === "stunned" && e.unit === "f")).toBe(true);
    expect(r.state.active).toBe("h");
    s = cast(r.state, "tStun");
    expect(unitById(s, "f").statuses.some((x) => x.id === "stun")).toBe(false);
  });
  it("slow takes MP and weaken cuts damage", () => {
    let s = cast(cast(duel(), "tSlow"), "tWeak");
    s = end(s, "h");
    expect(unitById(s, "f").mp).toBe(1);
    const f = unitById(s, "f"), h = unitById(s, "h");
    expect(damageFactor(s, f, h, ABILITIES.ray!)).toBeCloseTo(damageFactor(s, { ...f, statuses: [] }, h, ABILITIES.ray!) * 0.75);
  });
  it("shield soaks damage and regen heals", () => {
    let s = duel();
    s.units.find((u) => u.id === "h")!.hp = 20;
    s = cast(cast(s, "tShield", { x: 0, y: 0 }), "tRegen", { x: 0, y: 0 });
    s = end(s, "h");
    const before = unitById(s, "h").hp;
    s = play(s, [{ t: "cast", unit: "f", ability: "ray", target: { x: 0, y: 0 } }]);
    expect(unitById(s, "h").hp).toBe(before);
    s = end(s, "f");
    expect(unitById(s, "h").hp).toBe(before + 6);
  });
});

describe("interactive terrain", () => {
  const ab = (id: string, element: Ability["element"], extra: Partial<Ability> = {}): Ability => ({
    id, element, ap: 1, range: [1, 8], los: false, target: "any", area: "single", cooldown: 0, perTurn: 9, damage: { min: 2, max: 2, stat: "mag" }, ...extra,
  });
  Object.assign(ABILITIES, {
    xFire: ab("xFire", "fire"), xIce: ab("xIce", "ice", { damage: undefined }), xBolt: ab("xBolt", "bolt", { target: "foe", damage: { min: 10, max: 10, stat: "mag" } }),
    xHit: ab("xHit", "neutral", { target: "foe", damage: { min: 5, max: 5, stat: "mag" } }), xShove: ab("xShove", "neutral", { target: "foe", damage: undefined, push: 2 }),
  });
  const kit = ["xFire", "xIce", "xBolt", "xHit", "xShove", "ray"];
  const field = (rows: string[], units: UnitSpec[]) => createBattle({ seed: 4, map: parseMap("t", rows), units });
  const hero = (pos: { x: number; y: number }, o: Partial<UnitSpec> = {}) => unit({ id: "h", team: "heroes", pos, speed: 90, abilities: kit, ...o });
  const foe = (id: string, pos: { x: number; y: number }) => unit({ id, team: "foes", pos, hp: 60 });
  const tile = (s: BattleState, x: number, y: number) => s.map.tiles[y * s.map.w + x]!;
  const cast = (s: BattleState, ability: string, target: { x: number; y: number }) => play(s, [{ t: "cast", unit: "h", ability, target }]);

  it("reads objects from map rows", () => {
    const m = parseMap("p", ["g0B g0C b0 i0"]);
    expect(m.tiles.map((t) => [t.terrain, t.prop])).toEqual([["grass", "barrel"], ["grass", "crate"], ["bridge", undefined], ["ice", undefined]]);
    expect(() => parseMap("p", ["g0X"])).toThrow();
  });
  it("fire sets grass alight, burns whoever walks in, then leaves dirt", () => {
    let s = field(["g0 g0 g0 g0 g0 g0"], [hero({ x: 0, y: 0 }), foe("f", { x: 5, y: 0 })]);
    s = cast(s, "xFire", { x: 2, y: 0 });
    expect(tile(s, 2, 0).fireUntil).toBeGreaterThan(s.clock);
    const r = applyCommand(s, { t: "move", unit: "h", to: { x: 2, y: 0 } });
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.e === "caughtFire")).toBe(true);
    s = play(r.state, [{ t: "move", unit: "h", to: { x: 1, y: 0 } }]);
    for (let i = 0; i < 8; i++) s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(tile(s, 2, 0).terrain).toBe("dirt");
    expect(tile(s, 2, 0).fireUntil).toBeUndefined();
  });
  it("ice makes water walkable until it thaws, and fire melts it", () => {
    let s = field(["g0 w0 w0 g0 g0 g0"], [hero({ x: 0, y: 0 }), foe("f", { x: 5, y: 0 })]);
    expect(applyCommand(s, { t: "move", unit: "h", to: { x: 1, y: 0 } }).ok).toBe(false);
    s = cast(cast(s, "xIce", { x: 1, y: 0 }), "xIce", { x: 2, y: 0 });
    expect(applyCommand(s, { t: "move", unit: "h", to: { x: 1, y: 0 } }).ok).toBe(true);
    s = cast(s, "xFire", { x: 2, y: 0 });
    expect(tile(s, 2, 0).terrain).toBe("water");
    while (s.clock < 500) s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(tile(s, 1, 0).terrain).toBe("water");
  });
  it("barrels blow up the 3x3 around them and set off their neighbours", () => {
    let s = field(["g0 g0 g0B g0B g0", "g0 g0 g0 g0 g0"], [hero({ x: 0, y: 0 }), foe("a", { x: 1, y: 1 }), foe("b", { x: 4, y: 1 })]);
    const r = applyCommand(s, { t: "cast", unit: "h", ability: "xHit", target: { x: 2, y: 0 } });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(tile(s, 2, 0).prop).toBeUndefined();
    expect(tile(s, 3, 0).prop).toBeUndefined();
    expect(unitById(s, "a").hp).toBe(60 - BLAST_DAMAGE);
    expect(unitById(s, "b").hp).toBe(60 - BLAST_DAMAGE);
    expect(unitById(s, "a").statuses.some((x) => x.id === "burn")).toBe(true);
    expect(unitById(s, "h").hp).toBe(40);
    const ev = r.events.find((e) => e.e === "cast");
    expect(ev?.e === "cast" && ev.fx.filter((f) => f.fx === "explode").length).toBe(2);
  });
  it("crates break under enough damage and slide when pushed", () => {
    let s = field(["g0 g0 g0C g0 g0 g0"], [hero({ x: 0, y: 0 }), foe("f", { x: 5, y: 0 })]);
    s = cast(s, "xShove", { x: 2, y: 0 });
    expect(tile(s, 4, 0).prop).toBe("crate");
    s = cast(cast(s, "xHit", { x: 4, y: 0 }), "xHit", { x: 4, y: 0 });
    expect(tile(s, 4, 0).prop).toBe("crate");
    s = cast(s, "xHit", { x: 4, y: 0 });
    expect(tile(s, 4, 0).prop).toBeUndefined();
  });
  it("bolt runs through water to everyone on the same pond", () => {
    const s0 = field(["g0 g0 g0 g0 g0 g0", "g0 w0 w0 w0 g0 g0", "g0 g0 g0 g0 g0 g0"],
      [hero({ x: 0, y: 2 }), foe("a", { x: 1, y: 0 }), foe("b", { x: 3, y: 2 }), foe("c", { x: 5, y: 2 })]);
    const s = cast(s0, "xBolt", { x: 1, y: 0 });
    const hitA = 60 - unitById(s, "a").hp;
    expect(hitA).toBeGreaterThan(0);
    expect(unitById(s, "b").hp).toBe(60 - Math.floor(hitA * 0.5));
    expect(unitById(s, "c").hp).toBe(60);
  });
});

describe("effect preview", () => {
  it("shows where a push ends and the bump damage, exactly as the cast does", () => {
    const s = createBattle({ seed: 5, map: parseMap("p", ["g0 g0 g0 g0 r0 g0"]), units: [
      unit({ id: "h", team: "heroes", pos: { x: 1, y: 0 }, speed: 90, abilities: ["undertow"], str: 0 }),
      unit({ id: "f", team: "foes", pos: { x: 2, y: 0 } }),
    ] });
    const pv = previewEffects(s, unitById(s, "h"), ABILITIES.undertow!, { x: 2, y: 0 });
    expect(pv.moves).toEqual([{ from: { x: 2, y: 0 }, to: { x: 3, y: 0 }, unit: "f", bump: 4, fall: 0, fell: 0, slammed: "rock" }]); // 3 x 1.5 for rock
    const after = play(s, [{ t: "cast", unit: "h", ability: "undertow", target: { x: 2, y: 0 } }]);
    expect(unitById(after, "f").pos).toEqual({ x: 3, y: 0 });
    expect(unitById(s, "f").pos).toEqual({ x: 2, y: 0 }); // the preview never touches the real state
  });
});

describe("falls and shove", () => {
  const ledge = (rows = ["d3 d3 d0 d0"]) => parseMap("ledge", rows);
  it("shove is free, once a turn, and a push down a drop hurts by the levels fallen", () => {
    const s = createBattle({ seed: 1, map: ledge(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90 }),
      unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } }),
    ] });
    const pv = previewEffects(s, unitById(s, "h"), ABILITIES.shove!, { x: 1, y: 0 });
    // 4 per level x 3 levels, x 0.9 for Agility 10, on dirt: 10.
    expect(pv.moves).toEqual([{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, unit: "f", bump: 0, fall: 10, fell: 3 }]);
    const after = play(s, [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(unitById(after, "f").pos).toEqual({ x: 2, y: 0 });
    expect(unitById(after, "f").hp).toBe(30);
    expect(unitById(after, "h").ap).toBe(6);
    expect(castProblem(after, unitById(after, "h"), "shove", { x: 2, y: 0 })).not.toBeNull();
  });
  it("fall damage grows with Strength and a hard landing, and shrinks with Agility and Stone resistance", () => {
    const s = createBattle({ seed: 1, map: ledge(), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, str: 50 }),
      unit({ id: "f", team: "foes", pos: { x: 1, y: 0 }, agi: 0 }),
      unit({ id: "g", team: "foes", pos: { x: 3, y: 0 }, agi: 40, res: { stone: 50 } }),
    ] });
    const h = unitById(s, "h"), f = unitById(s, "f"), g = unitById(s, "g");
    expect(fallDamage(s, h, f, 2, "dirt")).toBe(12);   // 4 x 2 x 1.5
    expect(fallDamage(s, h, f, 2, "ice")).toBe(15);    // x 1.25
    expect(fallDamage(s, h, f, 2, "grass")).toBe(10);  // x 0.85
    expect(fallDamage(s, h, g, 2, "dirt")).toBe(3);    // x 0.6 x 0.5
    expect(fallDamage(s, h, f, 0, "dirt")).toBe(0);
  });
  it("a strong shover pushes 2 tiles, and heavy units do not budge", () => {
    const s = createBattle({ seed: 1, map: flat(1, 5), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, str: 20 }),
      unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } }),
    ] });
    expect(previewEffects(s, unitById(s, "h"), ABILITIES.shove!, { x: 1, y: 0 }).moves[0]!.to).toEqual({ x: 3, y: 0 });
    const boss = createBattle({ seed: 1, map: flat(1, 5), units: [
      unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, str: 20 }),
      unit({ id: "f", team: "foes", pos: { x: 1, y: 0 }, heavy: true }),
    ] });
    expect(castProblem(boss, unitById(boss, "h"), "shove", { x: 1, y: 0 })).toBe("too heavy to shove");
  });
});

describe("what a push slams into", () => {
  const setup = (row: string[], extra: UnitSpec[] = [], str = 0) => createBattle({ seed: 1, map: parseMap("slam", row), units: [
    unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90, str }),
    unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } }),
    ...extra,
  ] });
  const shove = (s: BattleState) => play(s, [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
  it("rock and trees hit harder than the map edge, water softer, and a tall wall harder per level", () => {
    expect(unitById(shove(setup(["g0 g0 r0"])), "f").hp).toBe(40 - 4);  // 3 x 1.5
    expect(unitById(shove(setup(["g0 g0 t0"])), "f").hp).toBe(40 - 4);
    expect(unitById(shove(setup(["g0 g0"])), "f").hp).toBe(40 - 3);     // edge
    expect(unitById(shove(setup(["g0 g0 w0"])), "f").hp).toBe(40 - 1);  // 3 x 0.5
    expect(unitById(shove(setup(["g0 g0 g3"])), "f").hp).toBe(40 - 5);  // 3 x 1.75
  });
  it("a crate takes the slam too, and a barrel goes off", () => {
    const c = shove(setup(["g0 g0 g0C"]));
    expect(c.map.tiles[2]!.propHp).toBe(12 - 3);
    const b = shove(setup(["g0 g0 g0B g0"]));
    expect(b.map.tiles[2]!.prop).toBeUndefined();
    expect(unitById(b, "f").hp).toBe(40 - 3 - 10); // slam + blast
  });
  it("a unit slammed into takes half", () => {
    const s = shove(setup(["g0 g0 g0"], [unit({ id: "g", team: "foes", pos: { x: 2, y: 0 } })], 20)); // 2 tiles, stopped at once: 6
    expect(unitById(s, "f").hp).toBe(40 - 6);
    expect(unitById(s, "g").hp).toBe(40 - 3);
  });
  it("falling onto a unit below hurts it fully and the faller half, and knocks it aside when it can", () => {
    const g = unit({ id: "g", team: "foes", pos: { x: 2, y: 0 } });
    const pv = previewEffects(setup(["d3 d3 d0 d0"], [g]), unitById(setup(["d3 d3 d0 d0"], [g]), "h"), ABILITIES.shove!, { x: 1, y: 0 });
    expect(pv.splashes).toEqual([{ unit: "g", damage: 10 }]);
    const s = shove(setup(["d3 d3 d0 d0"], [g]));
    expect(unitById(s, "g").hp).toBe(40 - 10);   // the full 3-level fall
    expect(unitById(s, "f").hp).toBe(40 - 5);    // half, cushioned
    expect(unitById(s, "f").pos).toEqual({ x: 2, y: 0 });
    expect(unitById(s, "g").pos).toEqual({ x: 3, y: 0 });
    const blocked = shove(setup(["d3 d3 d0 r0"], [g]));
    expect(unitById(blocked, "f").pos).toEqual({ x: 1, y: 0 }); // bounces back onto the ledge
    expect(unitById(blocked, "g").hp).toBe(40 - 10);
  });
});

describe("quick actions", () => {
  const battle = (rows: string[], units: UnitSpec[]) => createBattle({ seed: 3, map: parseMap("q", rows), units });
  const hero = (o: Partial<UnitSpec> = {}) => unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90, ...o });
  it("are free and share one use per turn", () => {
    const s = battle(["g0 g0 g0 g0"], [hero(), unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } })]);
    const a = play(s, [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(unitById(a, "h").ap).toBe(6);
    expect(castProblem(a, unitById(a, "h"), "jump", { x: 1, y: 0 })).toBe("quick action already used this turn");
    expect(applyCommand(a, { t: "wait", unit: "h" }).ok).toBe(false);
  });
  it("Jump hops 1, or 2 over a gap or a unit, and climbs Jump + 1 levels", () => {
    const s = battle(["g0 w0 g0 g0", "g0 g0 g0 g3", "g2 g0 g0 g0"], [hero({ jump: 1 })]);
    const h = unitById(s, "h");
    expect(castProblem(s, h, "jump", { x: 2, y: 0 })).toBeNull();                      // over water
    expect(castProblem(s, h, "jump", { x: 0, y: 2 })).toBe("jump 2 only over a gap or a unit");
    expect(castProblem(s, h, "jump", { x: 1, y: 1 })).toBe("jumps go straight");
    const up = battle(["g0 g2 g3"], [hero({ jump: 1 })]);
    expect(castProblem(up, unitById(up, "h"), "jump", { x: 1, y: 0 })).toBeNull();     // 2 levels with Jump 1
    const after = play(up, [{ t: "cast", unit: "h", ability: "jump", target: { x: 1, y: 0 } }]);
    expect(unitById(after, "h").pos).toEqual({ x: 1, y: 0 });
  });
  it("Throw sends a crate into whoever is in the way, and a barrel goes off where it lands", () => {
    const s = battle(["g0 g0C g0 g0 g0"], [hero(), unit({ id: "f", team: "foes", pos: { x: 3, y: 0 } })]);
    const a = play(s, [{ t: "cast", unit: "h", ability: "throw", target: { x: 1, y: 0 } }]);
    expect(unitById(a, "f").hp).toBe(40 - 6);
    expect(a.map.tiles[1]!.prop).toBeUndefined();
    const b = play(battle(["g0 g0B g0 g0 g0 g0"], [hero(), unit({ id: "f", team: "foes", pos: { x: 5, y: 0 } })]),
      [{ t: "cast", unit: "h", ability: "throw", target: { x: 1, y: 0 } }]);
    expect(unitById(b, "f").hp).toBe(40 - 10); // landed next to it (4 tiles at most... 3 here) and blew up
  });
  it("Shove pushes crates, barrels and boulders into foes, and they hurt", () => {
    const foeAt = (x: number) => unit({ id: "f", team: "foes", pos: { x, y: 0 } });
    // A crate shoved 1 tile into a foe right behind it: the base impact; the crate takes it too.
    const c = play(battle(["g0 g0C g0 g0"], [hero(), foeAt(2)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(unitById(c, "f").hp).toBe(40 - IMPACT.crate.base);
    expect(c.map.tiles[1]!.prop).toBe("crate");
    expect(c.map.tiles[1]!.propHp).toBe(12 - IMPACT.crate.base);
    // A boulder keeps rolling and hits harder for every tile it rolled.
    const b = play(battle(["g0 g0O g0 g0 g0 g0"], [hero(), foeAt(5)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(b.map.tiles[4]!.prop).toBe("boulder");
    expect(unitById(b, "f").hp).toBe(40 - (IMPACT.boulder.base + 3 * IMPACT.boulder.perTile));
    // Rolling down a ledge adds the drop.
    const d = play(battle(["g2 g2O g0 g0"], [hero(), foeAt(3)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(unitById(d, "f").hp).toBe(40 - (IMPACT.boulder.base + IMPACT.boulder.perTile + 2 * IMPACT.boulder.perLevel));
    // A barrel rolled into a foe goes off next to it.
    const r = play(battle(["g0 g0B g0 g0"], [hero(), foeAt(2)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(r.map.tiles[1]!.prop).toBeUndefined();
    expect(unitById(r, "f").hp).toBe(40 - BLAST_DAMAGE);
    // With nobody in the way a barrel just rolls; water swallows a crate.
    const free = play(battle(["g0 g0B g0 g0"], [hero(), foeAt(3)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(free.map.tiles[2]!.prop).toBe("barrel");
    const sunk = play(battle(["g0 g0C w0 g0"], [hero(), foeAt(3)]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(sunk.map.tiles.some((t) => t.prop)).toBe(false);
  });
  it("the preview shows who a pushed object hits, and Hurl moves objects too", () => {
    const s = battle(["g0 g0O g0 g0"], [hero({ quick: "hurl" }), unit({ id: "f", team: "foes", pos: { x: 3, y: 0 } })]);
    const pv = previewEffects(s, unitById(s, "h"), ABILITIES.shove!, { x: 1, y: 0 });
    expect(pv.splashes).toEqual([{ unit: "f", damage: IMPACT.boulder.base + IMPACT.boulder.perTile }]);
    expect(pv.moves).toEqual([{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, bump: 0, fall: 0, fell: 0 }]);
    expect(castProblem(s, unitById(s, "h"), "hurl", { x: 1, y: 0 })).toBeNull();
    expect(castProblem(s, unitById(s, "h"), "throw", { x: 1, y: 0 })).toBe("needs a crate or barrel");
  });
  it("Dip needs fire next to you and makes the next attack burn", () => {
    const s = battle(["g0 g0 g0"], [hero({ abilities: ["ray"] }), unit({ id: "f", team: "foes", pos: { x: 2, y: 0 } })]);
    expect(castProblem(s, unitById(s, "h"), "dip", { x: 0, y: 0 })).toBe("needs fire or Sap next to you");
    s.map.tiles[1]!.fireUntil = s.clock + 500;
    const a = play(s, [{ t: "cast", unit: "h", ability: "dip", target: { x: 0, y: 0 } }, { t: "cast", unit: "h", ability: "ray", target: { x: 2, y: 0 } }]);
    expect(unitById(a, "f").statuses.some((x) => x.id === "burn")).toBe(true);
    expect(unitById(a, "h").dipped).toBe(false);
  });
  it("Aim adds 1 reach to the next ranged ability; Hurl moves friends too; Zip ignores Lock", () => {
    const s = battle(["g0 g0 g0 g0 g0 g0 g0"], [hero({ abilities: ["ray"], quick: "aim" }), unit({ id: "f", team: "foes", pos: { x: 6, y: 0 } })]);
    expect(castProblem(s, unitById(s, "h"), "ray", { x: 6, y: 0 })).toBe("out of range");
    const a = play(s, [{ t: "cast", unit: "h", ability: "aim", target: { x: 0, y: 0 } }]);
    expect(castProblem(a, unitById(a, "h"), "ray", { x: 6, y: 0 })).toBeNull();
    const g = battle(["g0 g0 g0 g0", "g0 g0 g0 g0"], [hero({ quick: "hurl", str: 11 }), unit({ id: "b", team: "heroes", pos: { x: 1, y: 0 } }), unit({ id: "f", team: "foes", pos: { x: 3, y: 1 } })]);
    expect(unitById(play(g, [{ t: "cast", unit: "h", ability: "hurl", target: { x: 1, y: 0 } }]), "b").pos).toEqual({ x: 3, y: 0 });
    const z = battle(["g0 g0", "g0 g0"], [hero({ quick: "zip" }), unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } })]);
    const zz = play(z, [{ t: "cast", unit: "h", ability: "zip", target: { x: 0, y: 1 } }]);
    expect(unitById(zz, "h").pos).toEqual({ x: 0, y: 1 });
    expect(unitById(zz, "h").mp).toBe(3);
  });
});

describe("surfaces", () => {
  const ab = (id: string, element: Ability["element"], extra: Partial<Ability> = {}): Ability => ({
    id, element, ap: 1, range: [0, 8], los: false, target: "any", area: "single", cooldown: 0, perTurn: 9, ...extra,
  });
  Object.assign(ABILITIES, {
    sFire: ab("sFire", "fire", { damage: { min: 2, max: 2, stat: "mag" } }), sLight: ab("sLight", "light"), sWater: ab("sWater", "water"), sIce: ab("sIce", "ice"),
    sBolt: ab("sBolt", "bolt", { target: "foe", damage: { min: 10, max: 10, stat: "mag" } }), sHit: ab("sHit", "neutral", { target: "foe", damage: { min: 4, max: 4, stat: "mag" } }),
  });
  const kit = ["sFire", "sLight", "sWater", "sIce", "sBolt", "sHit"];
  const field = (rows: string[], units: UnitSpec[], seed: string | number = 4) => createBattle({ seed, map: parseMap("t", rows), units });
  const hero = (pos: { x: number; y: number }, o: Partial<UnitSpec> = {}) => unit({ id: "h", team: "heroes", pos, speed: 90, abilities: kit, ...o });
  const foe = (id: string, pos: { x: number; y: number }, o: Partial<UnitSpec> = {}) => unit({ id, team: "foes", pos, hp: 60, ...o });
  const tile = (s: BattleState, x: number, y: number) => s.map.tiles[y * s.map.w + x]!;
  const cast = (s: BattleState, ability: string, target: { x: number; y: number }) => play(s, [{ t: "cast", unit: "h", ability, target }]);

  it("reads oil, Sap and Sap sources from map rows", () => {
    const m = parseMap("p", ["d0o g0s g0S g0Co"]);
    expect(m.tiles.map((t) => [t.surface, !!t.sapSource, t.prop])).toEqual([["oil", false, undefined], ["sap", false, undefined], ["sap", true, undefined], ["oil", false, "crate"]]);
    expect(() => parseMap("p", ["w0o"])).toThrow();
    expect(() => parseMap("p", ["g0x"])).toThrow();
  });
  it("oil costs 1 extra MP to walk out of", () => {
    const s = field(["d0o d0 d0 d0 d0 d0"], [hero({ x: 0, y: 0 }), foe("f", { x: 5, y: 0 })]);
    expect(applyCommand(s, { t: "move", unit: "h", to: { x: 3, y: 0 } }).ok).toBe(false);
    expect(applyCommand(s, { t: "move", unit: "h", to: { x: 2, y: 0 } }).ok).toBe(true);
  });
  it("fire makes the whole oil puddle flare up, hitting everyone next to it once and setting off barrels", () => {
    let s = field(["d0 d0 d0o d0o d0 d0 d0 d0B", "d0 d0 d0 d0o d0o d0o d0o d0"], [hero({ x: 0, y: 0 }), foe("f", { x: 4, y: 0 }), foe("g", { x: 7, y: 1 }), foe("far", { x: 0, y: 1 })]);
    s = cast(s, "sFire", { x: 2, y: 0 });
    expect(unitById(s, "f").hp).toBe(60 - 6); // next to three oil tiles, hit once
    expect(unitById(s, "f").statuses.some((x) => x.id === "burn")).toBe(true);
    for (const [x, y] of [[2, 0], [3, 0], [3, 1], [4, 1], [5, 1], [6, 1]] as const) {
      expect(tile(s, x, y).surface).toBeUndefined();
      expect(tile(s, x, y).fireUntil).toBeGreaterThan(s.clock);
    }
    expect(tile(s, 7, 0).prop).toBeUndefined(); // the barrel by the far end of the puddle went off
    expect(unitById(s, "g").hp).toBe(60 - 6 - BLAST_DAMAGE);
    expect(unitById(s, "far").hp).toBe(60);
    expect(previewEffects(field(["d0 d0 d0o d0"], [hero({ x: 0, y: 0 }), foe("f", { x: 3, y: 0 })]), unitById(s, "h"), ABILITIES.sFire!, { x: 2, y: 0 }).blasts).toEqual([{ x: 2, y: 0 }]);
  });
  it("Sap poisons the party and feeds foes; fire burns it to dirt and Light cleanses it", () => {
    let s = field(["g0 g0s g0 g0s g0s", "g0 g0 g0 g0 g0"], [hero({ x: 0, y: 0 }), foe("f", { x: 4, y: 0 }, { speed: 10 })]);
    const r = applyCommand(s, { t: "move", unit: "h", to: { x: 1, y: 0 } });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ e: "sapped", unit: "h", status: "poison" });
    s = cast(cast(r.state, "sFire", { x: 3, y: 0 }), "sLight", { x: 1, y: 0 });
    expect(tile(s, 3, 0).surface).toBeUndefined();
    expect(tile(s, 3, 0).terrain).toBe("dirt");
    expect(tile(s, 1, 0).surface).toBeUndefined();
    expect(tile(s, 1, 0).fireUntil).toBeUndefined();
    let saw = false;
    for (let i = 0; i < 6 && !saw; i++) {
      const e = applyCommand(s, { t: "endTurn", unit: s.active });
      if (!e.ok) throw new Error(e.error);
      saw = e.events.some((x) => x.e === "sapped" && x.unit === "f" && x.status === "regen");
      s = e.state;
    }
    expect(saw).toBe(true);
  });
  it("a Sap source grows the Sap one tile a round, up to two tiles away", () => {
    let s = field(["g0S g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0"], [hero({ x: 6, y: 2 }), foe("f", { x: 6, y: 1 })]);
    while (s.clock < 900) s = play(s, [{ t: "endTurn", unit: s.active }]);
    const sap = s.map.tiles.map((t, i) => (t.surface === "sap" ? `${i % s.map.w},${Math.floor(i / s.map.w)}` : "")).filter(Boolean);
    expect(sap.sort()).toEqual(["0,0", "0,1", "0,2", "1,0", "1,1", "2,0"]);
  });
  it("a bolt charges the water it runs through, and starting a turn next to it may stun", () => {
    let s = field(["g0 g0 g0 g0", "w0 w0 w0 w0"], [hero({ x: 0, y: 0 }), foe("f", { x: 1, y: 0 }), foe("g", { x: 3, y: 0 })]);
    s = cast(s, "sBolt", { x: 1, y: 0 });
    expect([0, 1, 2, 3].every((x) => (tile(s, x, 1).chargedUntil ?? 0) > s.clock)).toBe(true);
    const calmed = cast(s, "sWater", { x: 2, y: 1 });
    expect(tile(calmed, 2, 1).chargedUntil).toBeUndefined();
    // Over many seeds, some turns next to charged water are lost and some are not.
    let shocked = 0;
    for (let seed = 0; seed < 40; seed++) {
      let b = field(["g0 g0 g0 g0", "w0 w0 w0 w0"], [hero({ x: 0, y: 0 }), foe("f", { x: 3, y: 0 })], seed);
      for (const t of b.map.tiles) if (t.terrain === "water") t.chargedUntil = 9999;
      const r = applyCommand(b, { t: "endTurn", unit: b.active });
      if (!r.ok) throw new Error(r.error);
      if (r.events.some((e) => e.e === "shocked")) shocked++;
      b = r.state;
    }
    expect(shocked).toBeGreaterThan(3);
    expect(shocked).toBeLessThan(30);
  });
  it("fire on water makes steam that blocks sight for a round; ice freezes charged water", () => {
    let s = field(["g0 g0 g0 g0 g0", "g0 g0 w0 g0 g0", "g0 g0 g0 g0 g0"], [hero({ x: 0, y: 1 }), foe("f", { x: 4, y: 1 })]);
    expect(hasLineOfSight(s.map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(true);
    tile(s, 2, 1).chargedUntil = 9999;
    s = cast(s, "sFire", { x: 2, y: 1 });
    expect(tile(s, 2, 1).steamUntil).toBeGreaterThan(s.clock);
    expect(tile(s, 2, 1).chargedUntil).toBeUndefined();
    expect(hasLineOfSight(s.map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    while (s.clock < 300) s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(tile(s, 2, 1).steamUntil).toBeUndefined();
    const t2 = field(["g0 w0 g0"], [hero({ x: 0, y: 0 }), foe("f", { x: 2, y: 0 })]);
    tile(t2, 1, 0).chargedUntil = 9999;
    const iced = cast(t2, "sIce", { x: 1, y: 0 });
    expect(tile(iced, 1, 0).terrain).toBe("ice");
    expect(tile(iced, 1, 0).chargedUntil).toBeUndefined();
  });
  it("Dip next to Sap makes the next attack poison", () => {
    const s = field(["g0 g0s g0"], [hero({ x: 0, y: 0 }, { abilities: ["sHit"] }), foe("f", { x: 2, y: 0 })]);
    const a = play(s, [{ t: "cast", unit: "h", ability: "dip", target: { x: 0, y: 0 } }, { t: "cast", unit: "h", ability: "sHit", target: { x: 2, y: 0 } }]);
    expect(unitById(a, "f").statuses.some((x) => x.id === "poison")).toBe(true);
  });
});

describe("guard", () => {
  Object.assign(ABILITIES, {
    gHit: { id: "gHit", element: "neutral", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 8, max: 8, stat: "str" } } as Ability,
    gFar: { id: "gFar", element: "neutral", ap: 3, range: [2, 5], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 9, max: 9, stat: "mag" } } as Ability,
  });
  const field = (units: UnitSpec[], rows = ["g0 g0 g0 g0 g0 g0"]) => createBattle({ seed: 3, map: parseMap("t", rows), units });
  const guardian = (o: Partial<UnitSpec> = {}) => unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90, abilities: ["gHit"], ...o });

  it("ends the turn with a full delay and strikes the first enemy that steps next to it, once", () => {
    let s = field([guardian(), unit({ id: "f", team: "foes", pos: { x: 4, y: 0 }, hp: 40, mp: 4 }), unit({ id: "g", team: "foes", pos: { x: 5, y: 1 }, hp: 40, mp: 6 })], ["g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0"]);
    const r = applyCommand(s, { t: "guard", unit: "h" });
    if (!r.ok) throw new Error(r.error);
    expect(unitById(r.state, "h").ct).toBe(unitById(s, "h").ct + delayFor(90));
    s = r.state;
    while (s.active !== "f") s = play(s, [{ t: "endTurn", unit: s.active }]);
    const m = applyCommand(s, { t: "move", unit: "f", to: { x: 1, y: 0 } });
    if (!m.ok) throw new Error(m.error);
    expect(m.events.some((e) => e.e === "guardHit" && e.unit === "h" && e.target === "f")).toBe(true);
    expect(unitById(m.state, "f").hp).toBe(40 - 8);
    expect(unitById(m.state, "f").pos).toEqual({ x: 1, y: 0 });
    expect(unitById(m.state, "h").guard).toBeUndefined();
    // Spent: the next enemy to come close is not hit.
    s = play(m.state, [{ t: "endTurn", unit: "f" }]);
    while (s.active !== "g") s = play(s, [{ t: "endTurn", unit: s.active }]);
    const n = applyCommand(s, { t: "move", unit: "g", to: { x: 0, y: 1 } });
    if (!n.ok) throw new Error(n.error);
    expect(n.events.some((e) => e.e === "guardHit")).toBe(false);
  });
  it("a guard hit that downs the walker stops it there and ends its turn", () => {
    let s = field([guardian(), unit({ id: "f", team: "foes", pos: { x: 4, y: 0 }, hp: 5, mp: 5 }), unit({ id: "g", team: "foes", pos: { x: 5, y: 1 }, hp: 40 })], ["g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0"]);
    s = play(s, [{ t: "guard", unit: "h" }]);
    while (s.active !== "f") s = play(s, [{ t: "endTurn", unit: s.active }]);
    const m = applyCommand(s, { t: "move", unit: "f", to: { x: 0, y: 1 } });
    if (!m.ok) throw new Error(m.error);
    const f = unitById(m.state, "f");
    expect(f.life).not.toBe("up");
    expect(m.state.active).not.toBe("f");
  });
  it("needs AP for an attack that reaches the next tile, and ends at the guard's next turn", () => {
    const far = field([guardian({ abilities: ["gFar"] }), unit({ id: "f", team: "foes", pos: { x: 5, y: 0 } })]);
    expect(applyCommand(far, { t: "guard", unit: "h" }).ok).toBe(false);
    let s = play(field([guardian(), unit({ id: "f", team: "foes", pos: { x: 5, y: 0 }, mp: 0 })]), [{ t: "guard", unit: "h" }]);
    expect(unitById(s, "h").guard).toBe("gHit");
    while (s.active !== "h") s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(unitById(s, "h").guard).toBeUndefined();
  });
});

describe("ice slides and Help up frees", () => {
  Object.assign(ABILITIES, {
    iPush: { id: "iPush", element: "neutral", ap: 1, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 9, push: 1 } as Ability,
  });
  it("a push that ends on ice slides one tile further", () => {
    const s = createBattle({ seed: 1, map: parseMap("t", ["g0 g0 i0 i0 g0 g0"]), units: [unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90, abilities: ["iPush"] }), unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } })] });
    const a = play(s, [{ t: "cast", unit: "h", ability: "iPush", target: { x: 1, y: 0 } }]);
    expect(unitById(a, "f").pos).toEqual({ x: 3, y: 0 });
    const dry = createBattle({ seed: 1, map: parseMap("t", ["g0 g0 g0 g0 g0 g0"]), units: [unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90, abilities: ["iPush"] }), unit({ id: "f", team: "foes", pos: { x: 1, y: 0 } })] });
    expect(unitById(play(dry, [{ t: "cast", unit: "h", ability: "iPush", target: { x: 1, y: 0 } }]), "f").pos).toEqual({ x: 2, y: 0 });
  });
  it("Help up frees a standing ally from Root and Stun", () => {
    const s = createBattle({ seed: 1, map: parseMap("t", ["g0 g0 g0 g0 g0 g0"]), units: [unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 90 }), unit({ id: "a", team: "heroes", pos: { x: 1, y: 0 } }), unit({ id: "f", team: "foes", pos: { x: 5, y: 0 } })] });
    expect(castProblem(s, unitById(s, "h"), "helpUp", { x: 1, y: 0 })).toBe("needs a downed, rooted or stunned ally");
    const a = unitById(s, "a"); a.rooted = true; a.statuses.push({ id: "stun", turns: 1, power: 0 });
    const r = play(s, [{ t: "cast", unit: "h", ability: "helpUp", target: { x: 1, y: 0 } }]);
    expect(unitById(r, "a").rooted).toBe(false);
    expect(unitById(r, "a").statuses.some((x) => x.id === "stun")).toBe(false);
  });
});
