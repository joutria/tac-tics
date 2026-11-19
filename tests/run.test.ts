import { describe, expect, it } from "vitest";
import { HERO } from "../src/data/region";
import { createBattle, type BattleState } from "../src/engine/state";
import { aheadOf, generateMap, MAP_LAYERS } from "../src/run/map";
import { battleSetup, enterNode, finishBattle, newRun, nextNodes, REST_HEAL, type RunState } from "../src/run/run";

/** Ends the current battle: the hero wins (every foe dead, or `escaped` gets away) or loses. */
function end(run: RunState, how: "win" | "lose", escaped?: string): BattleState {
  const s = createBattle(run.battle!.setup);
  for (const u of s.units) {
    if (u.team === "foes") u.life = u.id === escaped ? "escaped" : "dead";
    if (u.team === "heroes" && how === "lose") u.life = "dead";
  }
  s.winner = how === "win" ? "heroes" : "foes";
  return s;
}

describe("run map", () => {
  it("is the same for the same seed and links every node from the start to the boss", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const m = generateMap(seed);
      expect(generateMap(seed)).toEqual(m);
      expect(m.nodes.filter((n) => n.kind === "boss")).toHaveLength(1);
      expect(m.nodes.at(-1)!.layer).toBe(MAP_LAYERS - 1);
      expect(m.nodes.length).toBeGreaterThanOrEqual(10);
      expect(m.nodes.length).toBeLessThanOrEqual(19);
      const reach = aheadOf(m, null);
      for (const n of m.nodes) expect(reach.has(n.id)).toBe(true);
      for (const n of m.nodes) if (n.kind !== "boss") expect(aheadOf(m, n.id).has(m.nodes.at(-1)!.id)).toBe(true);
      expect(m.nodes.filter((n) => n.layer === MAP_LAYERS - 2).every((n) => n.kind === "rest")).toBe(true);
    }
  });
});

describe("run", () => {
  it("only enters open nodes, and rests heal", () => {
    let run = newRun("r1");
    const closed = run.map.nodes.find((n) => n.layer === 2)!;
    expect(() => enterNode(run, closed.id, "en")).toThrow();
    run = { ...run, heroHp: 10 };
    const rest = run.map.nodes.find((n) => n.kind === "rest")!;
    const healed = enterNode({ ...run, at: run.map.nodes.find((n) => n.next.includes(rest.id))!.id }, rest.id, "en");
    expect(healed.heroHp).toBe(10 + Math.round(HERO.hp * REST_HEAL));
    expect(healed.battle).toBeUndefined();
  });

  it("carries the hero's HP into battle and out of it, and ends when the hero falls", () => {
    let run = { ...newRun("r2"), heroHp: 30 };
    run = enterNode(run, nextNodes(run)[0]!.id, "en");
    expect(createBattle(run.battle!.setup).units.find((u) => u.team === "heroes")!.hp).toBe(30);
    const won = finishBattle(run, end(run, "win"));
    expect(won.over).toBeNull();
    expect(won.path).toHaveLength(1);
    expect(won.heroHp).toBeGreaterThan(30);
    const lost = finishBattle(run, end(run, "lose"));
    expect(lost.over).toBe("lost");
  });

  it("puts a new rival on a node ahead, and fields it there", () => {
    let run = newRun("r3");
    run = enterNode(run, nextNodes(run)[0]!.id, "en");
    const foe = run.battle!.setup.units.find((u) => u.team === "foes")!;
    run = finishBattle(run, end(run, "win", foe.id));
    expect(run.rivals).toHaveLength(1);
    const node = run.map.nodes.find((n) => n.rival === foe.id)!;
    expect(node.kind).toBe("rival");
    expect(aheadOf(run.map, run.at).has(node.id)).toBe(true);
    const setup = battleSetup(run, node.id, "en");
    const rival = setup.units.find((u) => u.id === foe.id)!;
    expect(rival.rival).toBe(true);
    expect(rival.name).toContain(foe.name);
  });

  it("wins the run by beating the boss", () => {
    let run = newRun("r4");
    while (!run.over) {
      const pick = nextNodes(run)[0]!;
      run = enterNode(run, pick.id, "en");
      if (run.battle) run = finishBattle(run, end(run, "win"));
    }
    expect(run.over).toBe("won");
    expect(run.path).toHaveLength(MAP_LAYERS);
  });
});
