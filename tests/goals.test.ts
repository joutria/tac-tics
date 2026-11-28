import { describe, expect, it } from "vitest";
import { planTurn } from "../src/engine/ai";
import { parseMap } from "../src/engine/grid";
import { goalStatus, roundsLeft } from "../src/engine/goals";
import { activeUnit, applyCommand, createBattle, roundOf, upcomingTurns, type BattleSetup, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { readDeeds } from "../src/run/party";
import { battleSetup, enterNode, finishBattle, goalAt, newRun, type RunState } from "../src/run/run";
import { deployUnit, deployZone, partyStarts } from "../src/run/deploy";
import { GOAL } from "../src/data/goals";

const flat = (rows = 8, cols = 8) => parseMap("flat", Array.from({ length: rows }, () => Array(cols).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 6, mag: 6, agi: 10, res: {}, abilities: ["ray"], ...o,
});

function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}

/** AI against AI until someone wins (or a long while passes). */
function fight(setup: BattleSetup, cap = 200): { s: BattleState; cmds: Command[]; actors: Set<string> } {
  let s = createBattle(setup);
  const cmds: Command[] = [], actors = new Set<string>();
  while (!s.winner && s.turns < cap) {
    actors.add(s.active);
    for (const c of planTurn(s)) { s = play(s, [c]); cmds.push(c); }
  }
  return { s, cmds, actors };
}

describe("goals on the run map", () => {
  it("are seeded per node, only on plain fights from layer 1, and every kind turns up", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const run = newRun(`goal-seed-${i}`);
      for (const n of run.map.nodes) {
        const g = goalAt(run, n);
        expect(goalAt(run, n)).toBe(g);
        if (!g) continue;
        seen.add(g);
        expect(n.kind).toBe("battle");
        expect(n.layer).toBeGreaterThanOrEqual(1);
        const setup = battleSetup(run, n.id, "en");
        expect(setup.goal?.kind).toBe(g);
        expect(setup.ambush).toBeFalsy();
      }
    }
    expect([...seen].sort()).toEqual(["catch", "protect", "survive"]);
  });

  it("put the survivor clear of both sides and the courier deep in the map; neither can be placed by the player", () => {
    let checked = 0;
    for (let i = 0; i < 60 && checked < 6; i++) {
      const run = newRun(`goal-place-${i}`);
      for (const n of run.map.nodes) {
        const g = goalAt(run, n);
        if (g !== "protect" && g !== "catch") continue;
        const setup = battleSetup(run, n.id, "en");
        const who = setup.units.find((u) => (g === "protect" ? u.ward : u.runner))!;
        expect(who).toBeTruthy();
        const gap = (team: string) => Math.min(...setup.units.filter((u) => u.team === team && u !== who).map((u) => Math.abs(u.pos.x - who.pos.x) + Math.abs(u.pos.y - who.pos.y)));
        expect(gap("heroes")).toBeGreaterThanOrEqual(3);
        if (g === "protect") {
          expect(gap("foes")).toBeGreaterThanOrEqual(3);
          expect(partyStarts(setup)).not.toContainEqual(who.pos);
          const zone = deployZone(setup);
          expect(deployUnit(setup, who.id, zone[0]!, zone)).toBe(setup);
        }
        createBattle(setup); // a legal battle
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("protect", () => {
  const setup: BattleSetup = {
    seed: "protect", map: flat(), goal: { kind: "protect", ward: "ward" },
    units: [
      unit({ id: "hero", team: "heroes", pos: { x: 0, y: 7 } }),
      unit({ id: "ward", team: "heroes", pos: { x: 4, y: 4 }, hp: 20, abilities: [], ward: true, speed: 60 }),
      unit({ id: "f1", team: "foes", pos: { x: 4, y: 1 }, ai: "bruiser" }),
    ],
  };

  it("the survivor never takes a turn and never shows in the turn order", () => {
    const s = createBattle(setup);
    expect(upcomingTurns(s, 10)).not.toContain("ward");
    const { actors } = fight(setup);
    expect(actors.has("ward")).toBe(false);
  });

  it("foes go for the survivor, and losing it fails the goal without ending the fight", () => {
    const { s, cmds } = fight({ ...setup, units: setup.units.map((u) => (u.id === "hero" ? { ...u, mp: 0, abilities: [] } : u)) }, 120);
    const ward = s.units.find((u) => u.id === "ward")!;
    expect(ward.life === "downed" || ward.life === "dead").toBe(true);
    // The foe struck the survivor before the hero, who stood further off.
    const first = cmds.find((c) => c.t === "cast" && c.unit === "f1") as Extract<Command, { t: "cast" }> | undefined;
    expect(first?.target).toEqual({ x: 4, y: 4 });
    if (ward.life === "dead") expect(goalStatus(s)).toBe("failed");
  });

  it("a survivor alone cannot keep the party in the fight", () => {
    let s = createBattle(setup);
    s = { ...s, units: s.units.map((u) => (u.id === "hero" ? { ...u, life: "dead" as const } : u)) };
    // Any command re-checks the winner.
    const r = applyCommand(s, { t: "endTurn", unit: s.active });
    expect(r.ok && r.state.winner).toBe("foes");
  });

  it("is met once the party wins with the survivor alive", () => {
    const strong = { ...setup, units: setup.units.map((u) => (u.id === "hero" ? { ...u, str: 30, mag: 30, hp: 200, pos: { x: 4, y: 3 } } : u.id === "f1" ? { ...u, hp: 10 } : u)) };
    const { s } = fight(strong);
    expect(s.winner).toBe("heroes");
    expect(goalStatus(s)).toBe("met");
  });
});

describe("survive", () => {
  it("the party wins when the round after the last one to hold out begins", () => {
    const setup: BattleSetup = {
      seed: "survive", map: flat(10, 10), goal: { kind: "survive", rounds: 3 },
      units: [
        unit({ id: "hero", team: "heroes", pos: { x: 0, y: 9 }, hp: 500, abilities: [] }),
        unit({ id: "f1", team: "foes", pos: { x: 9, y: 0 }, hp: 500, mp: 1 }),
      ],
    };
    let s = createBattle(setup);
    expect(roundsLeft(s, roundOf(s))).toBe(3);
    while (!s.winner && s.turns < 100) s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(s.winner).toBe("heroes");
    expect(goalStatus(s)).toBe("met");
    expect(roundOf(s)).toBe(4);
    expect(s.units.find((u) => u.id === "f1")!.life).toBe("up");
  });

  it("asks for a clean hold: anyone in the party downed fails the goal, though holding out still ends the fight", () => {
    const setup: BattleSetup = {
      seed: "survive", map: flat(10, 10), goal: { kind: "survive", rounds: 2 },
      units: [
        unit({ id: "hero", team: "heroes", pos: { x: 0, y: 9 }, hp: 500, abilities: [] }),
        unit({ id: "a", team: "heroes", pos: { x: 1, y: 9 }, hp: 500, abilities: [] }),
        unit({ id: "f1", team: "foes", pos: { x: 9, y: 0 }, hp: 500, mp: 1 }),
      ],
    };
    let s = createBattle(setup);
    s.units.find((u) => u.id === "a")!.revives = 1; // fell once and was helped up
    expect(goalStatus(s)).toBe("failed");
    while (!s.winner && s.turns < 100) s = play(s, [{ t: "endTurn", unit: s.active }]);
    expect(s.winner).toBe("heroes");
    expect(goalStatus(s)).toBe("failed");
  });
});

describe("catch", () => {
  const setup: BattleSetup = {
    seed: "catch", map: flat(9, 9), goal: { kind: "catch", runner: "c" },
    units: [
      unit({ id: "hero", team: "heroes", pos: { x: 4, y: 8 }, abilities: [] }),
      unit({ id: "f1", team: "foes", pos: { x: 0, y: 0 }, ai: "caster" }),
      unit({ id: "c", team: "foes", pos: { x: 4, y: 4 }, hp: 20, mp: 1, abilities: [], runner: true }),
    ],
  };

  it("the courier flees from the first turn, never fights, and its escape fails the goal", () => {
    let s = createBattle(setup);
    expect(s.units.find((u) => u.id === "c")!.escape).toBe("flee");
    const { s: end, cmds } = fight(setup, 60);
    expect(cmds.some((c) => c.t === "cast" && c.unit === "c")).toBe(false);
    expect(end.units.find((u) => u.id === "c")!.life).toBe("escaped");
    expect(goalStatus(end)).toBe("failed");
    // The fight goes on after it leaves.
    s = end;
    expect(s.units.some((u) => u.id === "f1" && u.life === "up") ? s.winner !== "heroes" : true).toBe(true);
  });

  it("downing the courier meets the goal, and is not striking a fleeing foe for the companions", () => {
    const fast = { ...setup, units: setup.units.map((u) => (u.id === "hero" ? { ...u, speed: 200, str: 30, mag: 30, abilities: ["ray"], pos: { x: 4, y: 6 } } : u)) };
    let s = createBattle(fast);
    expect(activeUnit(s).id).toBe("hero");
    const cmds: Command[] = [{ t: "cast", unit: "hero", ability: "ray", target: { x: 4, y: 4 } }];
    s = play(s, cmds);
    const c = s.units.find((u) => u.id === "c")!;
    expect(c.life === "downed" || c.life === "dead").toBe(true);
    expect(goalStatus(s)).toBe("met");
    const deeds = readDeeds(fast, cmds);
    expect(deeds.killFleeing).toBe(0);
    expect(deeds.finishYielding).toBe(0);
  });
});

describe("prizes", () => {
  function runWithGoal(kind: string): { run: RunState; nodeId: number } {
    for (let i = 0; i < 80; i++) {
      let run = newRun(`goal-prize-${i}`);
      // Walk to a layer-1 node with this goal, if the map has one right ahead.
      const node = run.map.nodes.find((n) => n.layer === 1 && goalAt(run, n) === kind && run.map.nodes.some((m) => m.layer === 0 && m.next.includes(n.id) && m.kind === "battle"));
      if (!node) continue;
      const from = run.map.nodes.find((m) => m.layer === 0 && m.next.includes(node.id))!;
      run = enterNode(run, from.id, "en");
      let s = createBattle(run.battle!.setup);
      s = { ...s, winner: "heroes", units: s.units.map((u) => (u.team === "foes" ? { ...u, life: "dead" as const } : u)) };
      run = finishBattle(run, s);
      run = { ...run, offers: [] };
      return { run: enterNode(run, node.id, "en"), nodeId: node.id };
    }
    throw new Error(`no ${kind} node found`);
  }

  it("a caught courier pays its shards; a lost one pays nothing extra", () => {
    const { run } = runWithGoal("catch");
    const s0 = createBattle(run.battle!.setup);
    const runner = s0.goal!.kind === "catch" ? s0.goal!.runner : "";
    const won = (courier: "dead" | "escaped") => finishBattle(run, { ...s0, winner: "heroes", units: s0.units.map((u) => (u.team === "foes" ? { ...u, life: u.id === runner ? courier : "dead" as const } : u)) });
    const caught = won("dead"), lost = won("escaped");
    expect(caught.shards - run.shards).toBe(GOAL.catchShards);
    expect(lost.shards - run.shards).toBe(0);
    expect(caught.coins).toBeGreaterThan(lost.coins);
    expect(lost.rivals.some((r) => r.id === runner)).toBe(false);
    expect(lost.remarks.some((l) => l.en.includes("courier"))).toBe(true);
  });

  it("a survivor kept alive hands over a gift and leans the meters to Mercy", () => {
    const { run } = runWithGoal("protect");
    const s0 = createBattle(run.battle!.setup);
    const won = (ward: "up" | "dead") => finishBattle(run, { ...s0, winner: "heroes", units: s0.units.map((u) => (u.team === "foes" ? { ...u, life: "dead" as const } : u.ward ? { ...u, life: ward } : u)) });
    const kept = won("up"), lost = won("dead");
    expect(kept.offers.filter((o) => o.kind === "reward" && o.gift).length).toBe(lost.offers.filter((o) => o.kind === "reward" && o.gift).length + 1);
    expect((kept.align?.mercy ?? 0)).toBeGreaterThan(lost.align?.mercy ?? 0);
  });
});
