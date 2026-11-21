import { describe, expect, it } from "vitest";
import { ABILITIES } from "../src/data/abilities";
import { castProblem } from "../src/engine/combat";
import { parseMap } from "../src/engine/grid";
import { reachAt, reachBound } from "../src/engine/reach";
import { sightBlocker } from "../src/engine/sight";
import { createBattle, type UnitSpec } from "../src/engine/state";

const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
});
const battle = (row: string) => createBattle({ seed: 3, map: parseMap("r", [row]), units: [
  unit({ id: "h", team: "heroes", pos: { x: 0, y: 0 }, speed: 60 }),
  unit({ id: "f", team: "foes", pos: { x: 7, y: 0 } }),
] });
const hero = (s: ReturnType<typeof battle>) => s.units[0]!;

describe("reach, explained", () => {
  it("credits height for tiles only reached from above", () => {
    const s = battle("g2 g0 g0 g0 g0 g0 g0 g0");
    const r = reachAt(s, hero(s), ABILITIES.ray!, { x: 6, y: 0 });
    expect(r).toMatchObject({ dist: 6, base: 5, max: 7, height: 2, aim: 0, problem: null });
    expect(reachBound(s, hero(s), ABILITIES.ray!)).toBe(7);
  });
  it("tells lost-to-low-ground apart from simply too far", () => {
    const s = battle("g0 g0 g0 g0 g2 g0 g0 g0");
    expect(reachAt(s, hero(s), ABILITIES.ray!, { x: 4, y: 0 })).toMatchObject({ max: 3, height: -2, problem: "low" });
    expect(reachAt(s, hero(s), ABILITIES.ray!, { x: 6, y: 0 }).problem).toBe("far");
  });
  it("names the tile that cuts the line of sight, and agrees with the rules", () => {
    const s = battle("g0 g0 t0 g0 g0 g0 g0 g0");
    const r = reachAt(s, hero(s), ABILITIES.ray!, { x: 4, y: 0 });
    expect(r.problem).toBe("sight");
    expect(r.blocker).toEqual({ x: 2, y: 0 });
    expect(castProblem(s, hero(s), "ray", { x: 4, y: 0 })).toBe("no line of sight");
    expect(sightBlocker(s.map, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
  it("matches castProblem's range verdict on every tile", () => {
    const s = createBattle({ seed: 3, map: parseMap("m", ["g0 g1 g2 g0 t0 g0", "g0 g3 g0 g1 g0 g0", "g1 g0 g0 g2 g0 r0", "g0 g0 g1 g0 g0 g0"]), units: [
      unit({ id: "h", team: "heroes", pos: { x: 1, y: 1 }, speed: 60, abilities: ["ray", "flare", "prism"] }),
      unit({ id: "f", team: "foes", pos: { x: 5, y: 3 } }),
    ] });
    for (const id of ["ray", "flare", "prism", "bite"]) for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
      const r = reachAt(s, hero(s), ABILITIES[id]!, { x, y });
      const why = castProblem(s, { ...hero(s), abilities: [id] }, id, { x, y });
      expect(r.problem === "near" || r.problem === "far" || r.problem === "low", `${id} ${x},${y}`).toBe(why === "out of range");
      if (r.problem === "sight") expect(why).toBe("no line of sight");
    }
  });
});
