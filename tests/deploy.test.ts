/* Placing the party before a fight (run/deploy.ts). */
import { describe, expect, it } from "vitest";
import { parseMap, manhattan } from "../src/engine/grid";
import type { BattleSetup, UnitSpec } from "../src/engine/state";
import { deployUnit, deployZone, DEPLOY } from "../src/run/deploy";
import { battleSetup, newRun } from "../src/run/run";
import { newMember } from "../src/run/party";

const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 10, agi: 10, res: {}, abilities: ["ray"], ...o,
});
const setup = (): BattleSetup => ({
  seed: "deploy",
  map: parseMap("d", ["g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 w0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0", "g0 g0 g0 g0 g0 g0 g0"]),
  units: [
    unit({ id: "hero", team: "heroes", pos: { x: 3, y: 6 } }),
    unit({ id: "pal", team: "heroes", pos: { x: 2, y: 6 } }),
    unit({ id: "foe", team: "foes", pos: { x: 3, y: 1 } }),
  ],
});

describe("deploy", () => {
  it("offers free tiles near the start, never next to a foe or on water", () => {
    const s = setup(), zone = deployZone(s);
    expect(zone).toContainEqual({ x: 3, y: 6 });
    expect(zone).toContainEqual({ x: 3, y: 4 });
    expect(zone).not.toContainEqual({ x: 3, y: 3 }); // water
    for (const p of zone) expect(manhattan(p, { x: 3, y: 1 })).toBeGreaterThanOrEqual(DEPLOY.foeGap);
    for (const p of zone) expect(Math.min(manhattan(p, { x: 3, y: 6 }), manhattan(p, { x: 2, y: 6 }))).toBeLessThanOrEqual(DEPLOY.reach);
  });

  it("moves a party member, swaps two, and refuses tiles outside the zone or foes", () => {
    const s = setup(), zone = deployZone(s);
    const moved = deployUnit(s, "hero", { x: 4, y: 5 }, zone);
    expect(moved.units[0]!.pos).toEqual({ x: 4, y: 5 });
    const swapped = deployUnit(s, "hero", { x: 2, y: 6 }, zone);
    expect(swapped.units[0]!.pos).toEqual({ x: 2, y: 6 });
    expect(swapped.units[1]!.pos).toEqual({ x: 3, y: 6 });
    expect(deployUnit(s, "hero", { x: 0, y: 0 }, zone)).toBe(s);
    expect(deployUnit(s, "foe", { x: 4, y: 5 }, zone)).toBe(s);
  });

  it("works on real run arenas: every party member starts inside the zone", () => {
    const run = newRun("deploy-run");
    run.party = [newMember("remanso", 0, true)];
    for (const node of run.map.nodes.filter((n) => n.kind === "battle").slice(0, 6)) {
      const s = battleSetup(run, node.id, "en"), zone = deployZone(s);
      for (const u of s.units.filter((u) => u.team === "heroes")) expect(zone).toContainEqual(u.pos);
      expect(zone.length).toBeGreaterThan(s.units.filter((u) => u.team === "heroes").length);
    }
  });
});
