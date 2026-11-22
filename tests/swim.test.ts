import { describe, expect, it } from "vitest";
import { ABILITIES, type Ability } from "../src/data/abilities";
import { planTurn } from "../src/engine/ai";
import { castProblem, previewEffects } from "../src/engine/combat";
import { parseMap, rockSizeAt, sightBlock } from "../src/engine/grid";
import { reachable } from "../src/engine/movement";
import { applyCommand, createBattle, moveRules, unitById, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { ROCK } from "../src/engine/terrain";
import { SWIM_EXTRA_MP } from "../src/engine/swim";

function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 4, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray", "bite"], ...o,
});
const battle = (rows: string[], units: UnitSpec[]) => createBattle({ seed: 5, map: parseMap("swim", rows), units });
const hero = (pos: { x: number; y: number }, o: Partial<UnitSpec> = {}) => unit({ id: "h", team: "heroes", pos, speed: 90, ...o });
const foe = (pos: { x: number; y: number }, o: Partial<UnitSpec> = {}) => unit({ id: "f", team: "foes", pos, ...o });
const key = (x: number, y: number) => `${x},${y}`;

describe("swimming", () => {
  it("any small unit can swim, for an extra MP per step into water; water creatures swim freely", () => {
    const s = battle(["g0 w0 w0 g0"], [hero({ x: 0, y: 0 }), foe({ x: 3, y: 0 })]);
    const r = reachable(s.map, { x: 0, y: 0 }, moveRules(s, unitById(s, "h")));
    expect(r.get(key(1, 0))?.cost).toBe(1 + SWIM_EXTRA_MP);
    expect(r.get(key(2, 0))?.cost).toBe(2 * (1 + SWIM_EXTRA_MP));
    const otter = battle(["g0 w0 w0 g0"], [hero({ x: 0, y: 0 }, { element: "water" }), foe({ x: 3, y: 0 })]);
    expect(reachable(otter.map, { x: 0, y: 0 }, moveRules(otter, unitById(otter, "h"))).get(key(2, 0))?.cost).toBe(2);
  });
  it("giants cannot swim", () => {
    const s = battle(["g0 g0 w0 w0 g0", "g0 g0 w0 w0 g0"], [hero({ x: 0, y: 0 }, { size: 2 }), foe({ x: 4, y: 0 })]);
    const r = reachable(s.map, { x: 0, y: 0 }, moveRules(s, unitById(s, "h")));
    expect(r.has(key(1, 0))).toBe(false);
  });
  it("a swimmer can only use close moves and Water abilities, and cannot Guard or Jump", () => {
    const s = play(battle(["g0 w0 g0 g0 g0"], [hero({ x: 0, y: 0 }, { abilities: ["ray", "bite", "splash"] }), foe({ x: 2, y: 0 })]),
      [{ t: "move", unit: "h", to: { x: 1, y: 0 } }]);
    const h = unitById(s, "h");
    expect(castProblem(s, h, "ray", { x: 2, y: 0 })).toBe("only close moves while swimming");
    expect(castProblem(s, h, "bite", { x: 2, y: 0 })).toBeNull();
    expect(castProblem(s, h, "splash", { x: 2, y: 0 })).toBeNull();
    expect(castProblem(s, h, "jump", { x: 3, y: 0 })).toBe("no footing while swimming");
    expect(applyCommand(s, { t: "guard", unit: "h" }).ok).toBe(false);
    // A water creature is not held back.
    const o = play(battle(["g0 w0 g0 g0 g0"], [hero({ x: 0, y: 0 }, { element: "water" }), foe({ x: 3, y: 0 })]), [{ t: "move", unit: "h", to: { x: 1, y: 0 } }]);
    expect(castProblem(o, unitById(o, "h"), "ray", { x: 3, y: 0 })).toBeNull();
  });
  it("a unit shoved into water swims, and the water puts out its Burn", () => {
    const s = battle(["g0 g0 w0 g0"], [hero({ x: 0, y: 0 }), foe({ x: 1, y: 0 })]);
    s.units.find((u) => u.id === "f")!.statuses.push({ id: "burn", turns: 2, power: 3 });
    const a = play(s, [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    const f = unitById(a, "f");
    expect(f.pos).toEqual({ x: 2, y: 0 });
    expect(f.hp).toBe(40);
    expect(f.statuses.some((x) => x.id === "burn")).toBe(false);
  });
  it("ice freezes a swimmer in place for its next turn", () => {
    const ab: Ability = { id: "xFreeze", element: "ice", ap: 1, range: [1, 6], los: false, target: "any", area: "single", cooldown: 0, perTurn: 9 };
    Object.assign(ABILITIES, { xFreeze: ab });
    const s = battle(["g0 g0 w0 g0"], [hero({ x: 0, y: 0 }, { abilities: ["xFreeze"] }), foe({ x: 1, y: 0 })]);
    const a = play(s, [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }, { t: "cast", unit: "h", ability: "xFreeze", target: { x: 2, y: 0 } }]);
    expect(a.map.tiles[2]!.terrain).toBe("ice");
    expect(unitById(a, "f").rooted).toBe(true);
  });
  it("a bolt on a swimmer runs through the water to others swimming in it", () => {
    const bolt: Ability = { id: "xZap", element: "bolt", ap: 1, range: [1, 6], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 9, damage: { min: 10, max: 10, stat: "mag" } };
    Object.assign(ABILITIES, { xZap: bolt });
    const s = battle(["g0 g0 g0 w0 w0 w0 g0"], [hero({ x: 0, y: 0 }, { abilities: ["xZap"] }), foe({ x: 2, y: 0 }), unit({ id: "g", team: "foes", pos: { x: 6, y: 0 } })]);
    s.units.find((u) => u.id === "f")!.pos = { x: 3, y: 0 };
    s.units.find((u) => u.id === "g")!.pos = { x: 5, y: 0 };
    const a = play(s, [{ t: "cast", unit: "h", ability: "xZap", target: { x: 3, y: 0 } }]);
    expect(unitById(a, "g").hp).toBeLessThan(40);
  });
  it("a rock rolled into water hits a swimmer there instead of sinking", () => {
    const s = battle(["g0 r0s g0 w0 g0"], [hero({ x: 0, y: 0 }), foe({ x: 4, y: 0 })]);
    s.units.find((u) => u.id === "f")!.pos = { x: 3, y: 0 };
    const pv = previewEffects(s, unitById(s, "h"), ABILITIES.shove!, { x: 1, y: 0 });
    expect(pv.splashes[0]?.unit).toBe("f");
  });
  it("the AI does not stop in water to cast spells it cannot use there", () => {
    const s = battle(["g0 g0 g0 g0 g0 g0", "w0 w0 w0 w0 w0 w0", "g0 g0 g0 g0 g0 g0"],
      [hero({ x: 0, y: 0 }, { speed: 10 }), foe({ x: 5, y: 2 }, { speed: 90, ai: "caster", abilities: ["ray"] })]);
    const cmds = planTurn(s);
    const moved = cmds.find((c) => c.t === "move");
    if (moved && moved.t === "move") expect(s.map.tiles[moved.to.y * 6 + moved.to.x]!.terrain).not.toBe("water");
  });
});

describe("rock sizes", () => {
  it("small rocks roll far and hit lightly, big ones barely roll and hit hard", () => {
    const shove = (size: string) => play(battle([`g0 r0${size} g0 g0 g0 g0 g0 g0 g0`], [hero({ x: 0, y: 0 }), foe({ x: 8, y: 0 })]),
      [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    const at = (s: BattleState) => s.map.tiles.findIndex((t) => t.prop === "rock");
    expect(at(shove("s"))).toBe(1 + ROCK.s.roll);
    expect(at(shove("m"))).toBe(1 + ROCK.m.roll);
    expect(at(shove("l"))).toBe(1 + ROCK.l.roll);
    expect(shove("l").map.tiles[1 + ROCK.l.roll]!.rockSize).toBe("l"); // keeps its size when it rolls
    const hit = (size: string) => 40 - unitById(play(battle([`g0 r0${size} g0`], [hero({ x: 0, y: 0 }), foe({ x: 2, y: 0 })]),
      [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]), "f").hp;
    expect(hit("s")).toBeLessThan(hit("m"));
    expect(hit("m")).toBeLessThan(hit("l"));
  });
  it("small stones do not hide anyone; a small rock stops at a crate, a big one flattens it", () => {
    const m = parseMap("r", ["r0s r0m r0l"]);
    expect(m.tiles.map(sightBlock)).toEqual([0, 1, 1]);
    const a = play(battle(["g0 r0s g0 g0C g0"], [hero({ x: 0, y: 0 }), foe({ x: 4, y: 0 })]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(a.map.tiles[3]!.prop).toBe("crate");
    const b = play(battle(["g0 r0l g0C g0 g0"], [hero({ x: 0, y: 0 }), foe({ x: 4, y: 0 })]), [{ t: "cast", unit: "h", ability: "shove", target: { x: 1, y: 0 } }]);
    expect(b.map.tiles[2]!.prop).toBeUndefined();
  });
  it("maps mix the sizes, the same way every time", () => {
    const sizes = Array.from({ length: 400 }, (_, i) => rockSizeAt({ x: i % 20, y: Math.floor(i / 20) }));
    for (const z of ["s", "m", "l"] as const) expect(sizes.filter((x) => x === z).length).toBeGreaterThan(60);
    expect(rockSizeAt({ x: 3, y: 4 })).toBe(rockSizeAt({ x: 3, y: 4 }));
  });
});
