/* Combos, Halo's regen, the poison ward, the Floodgate and the quests' alternative good paths (M3 leftovers). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ABILITIES, COMBO_CASTER, COMBOS } from "../src/data/abilities";
import { QUESTS } from "../src/data/companions";
import { parseMap } from "../src/engine/grid";
import { castProblem } from "../src/engine/combat";
import { applyCommand, createBattle, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { endingOf, memberSpec, newMember } from "../src/run/party";
import { setFloodgate } from "../src/run/map";
import { abilityDesc, abilityName } from "../src/i18n/text";
import { ALT_HP_CUT, battleSetup, choose, goalAt, enterNode, finishBattle, FLOOD, floodMap, newRun, questView, type RunState } from "../src/run/run";
import { REGIONS } from "../src/data/region";
import { setRules } from "../src/engine/rules";

// These tests pin exact numbers and several casts a turn, written for the AP turn; the Move + Act rules the
// game plays by are covered in rules.test.ts.
beforeAll(() => setRules({ mode: "ap" }));
afterAll(() => setRules({}));

const flat = (rows = 7, cols = 7) => parseMap("flat", Array.from({ length: rows }, () => Array(cols).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 10, agi: 10, res: {}, abilities: ["ray"], ...o,
});
function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}

describe("combos", () => {
  const battle = (guijoAt = { x: 3, y: 3 }) => createBattle({ seed: "combo", map: flat(), units: [
    unit({ id: "hero", team: "heroes", pos: { x: 3, y: 6 }, speed: 90, abilities: ["ray", "lighthouseWall"] }),
    unit({ id: "guijo", team: "heroes", pos: guijoAt, speed: 20 }),
    unit({ id: "a", team: "foes", pos: { x: 3, y: 2 }, speed: 10 }),
    unit({ id: "b", team: "foes", pos: { x: 4, y: 4 }, speed: 10 }),
    unit({ id: "far", team: "foes", pos: { x: 0, y: 0 }, speed: 10 }),
  ] });

  it("Lighthouse Wall hits the foes around Guijo (diagonals too), shields him and spares him", () => {
    const s = play(battle(), [{ t: "cast", unit: "hero", ability: "lighthouseWall", target: { x: 3, y: 3 } }]);
    const by = (id: string) => s.units.find((u) => u.id === id)!;
    expect(by("a").hp).toBeLessThan(40);
    expect(by("b").hp).toBeLessThan(40); // diagonal: a 3x3, not a cross
    expect(by("far").hp).toBe(40);
    expect(by("a").statuses.some((x) => x.id === "weaken")).toBe(true);
    expect(by("guijo").hp).toBe(40);
    expect(by("guijo").statuses.find((x) => x.id === "shield")?.power).toBe(12);
  });

  it("needs the partner standing within reach, and is aimed at the partner", () => {
    const s = battle();
    const hero = s.units.find((u) => u.id === "hero")!;
    expect(castProblem(s, hero, "lighthouseWall", { x: 3, y: 6 })).toBe("needs the combo partner"); // itself: an ally, but not Guijo
    const far = battle({ x: 0, y: 1 });
    expect(castProblem(far, far.units.find((u) => u.id === "hero")!, "lighthouseWall", { x: 0, y: 1 })).toMatch(/too far|out of range/);
    const down = battle();
    down.units.find((u) => u.id === "guijo")!.life = "downed";
    expect(castProblem(down, down.units.find((u) => u.id === "hero")!, "lighthouseWall", { x: 3, y: 6 })).toBe("the combo partner is not standing");
  });

  it("every combo has a caster, a partner, and a name and text in both languages", () => {
    for (const id of COMBOS) {
      expect(ABILITIES[id]!.combo).toBeTruthy();
      expect(COMBO_CASTER[id]).toBeTruthy();
      for (const lang of ["es", "en"] as const) { expect(abilityName(lang, id)).not.toBe(id); expect(abilityDesc(lang, id)).toBeTruthy(); }
    }
  });

  it("a run gives an unlocked combo to its caster only when the partner fights too", () => {
    const run = newRun("combo-run");
    run.combos = ["lighthouseWall", "myceliumNet"];
    run.party = [newMember("guijo", 0, true)];
    const node = run.map.nodes.find((n) => n.kind === "battle")!;
    const setup = battleSetup(run, node.id, "en");
    expect(setup.units[0]!.abilities).toContain("lighthouseWall");
    expect(setup.units.find((u) => u.id === "guijo")!.abilities).not.toContain("myceliumNet"); // Moheda isn't here
    run.party = [];
    expect(battleSetup(run, node.id, "en").units[0]!.abilities).not.toContain("lighthouseWall");
  });
});

describe("Halo and the poison ward", () => {
  it("Halo leaves Regen as well as a Shield", () => {
    const s = createBattle({ seed: "halo", map: flat(), units: [
      unit({ id: "hero", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, abilities: ["halo"] }),
      unit({ id: "ally", team: "heroes", pos: { x: 3, y: 4 }, hpNow: 20 }),
      unit({ id: "foe", team: "foes", pos: { x: 0, y: 0 } }),
    ] });
    const after = play(s, [{ t: "cast", unit: "hero", ability: "halo", target: { x: 3, y: 4 } }]);
    const ids = after.units.find((u) => u.id === "ally")!.statuses.map((x) => x.id);
    expect(ids).toContain("shield");
    expect(ids).toContain("regen");
  });

  it("the ward takes its points off each poison tick", () => {
    const poisoned = (ward?: number) => {
      const s = createBattle({ seed: "ward", map: flat(), units: [
        unit({ id: "hero", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, poisonWard: ward }),
        unit({ id: "foe", team: "foes", pos: { x: 0, y: 0 }, speed: 10 }),
      ] });
      s.units[0]!.statuses.push({ id: "poison", turns: 3, power: 4 });
      // Hero ends its turn, the foe passes; the poison ticks at the start of the hero's next turn.
      let t = play(s, [{ t: "endTurn", unit: "hero" }]);
      while (t.active !== "hero") t = play(t, [{ t: "endTurn", unit: t.active }]);
      return t.units.find((u) => u.id === "hero")!.hp;
    };
    expect(poisoned()).toBe(36);
    expect(poisoned(1)).toBe(37);
  });
});

describe("the Floodgate", () => {
  const reservoir = () => {
    const run = newRun("gate");
    // Skip to the reservoir as a fresh region.
    return { ...run, region: 1, map: (newRunRegion(run.seed)) } as RunState;
  };
  const newRunRegion = (seed: string) => {
    // finishBattle builds the next region's map; easier: build a run and jump it via the boss.
    let run = newRun(seed);
    const boss = run.map.nodes.find((n) => n.kind === "boss")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(boss.id))!.id };
    run = enterNode(run, boss.id, "en");
    const s = createBattle(run.battle!.setup);
    for (const u of s.units) if (u.team === "foes") u.life = "dead";
    s.winner = "heroes";
    return finishBattle(run, s).map;
  };

  it("the reservoir's map has one, on its layer, and the town's has none", () => {
    expect(newRun("gate").map.nodes.some((n) => n.kind === "floodgate")).toBe(false);
    for (const seed of ["a", "b", "c", "gate"]) {
      const gates = newRunRegion(seed).nodes.filter((n) => n.kind === "floodgate");
      expect(gates).toHaveLength(1);
      expect(gates[0]!.layer - REGIONS[1]!.floodgate!).toBeLessThanOrEqual(1);
    }
  });

  it("entering it asks which way to flood, and the choice marks the roads ahead", () => {
    let run = reservoir();
    const gate = run.map.nodes.find((n) => n.kind === "floodgate")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(gate.id))!.id };
    run = enterNode(run, gate.id, "en");
    const offer = run.offers[0]!;
    expect(offer.kind).toBe("floodgate");
    const after = choose(run, 0);
    expect(after.offers).toHaveLength(0);
    const ways = gate.next.map((id) => after.map.nodes[id]!);
    expect(ways.some((n) => n.flood === "flooded")).toBe(true);
    if (ways.length > 1) expect(ways.some((n) => n.flood === "frozen")).toBe(true);
  });

  it("a flooded fight fields one foe fewer; a frozen one turns its water to ice", () => {
    const run = reservoir();
    // A fight with no goal: a goal's extra foe or courier would change the count (a flooded fight never has one).
    const node = run.map.nodes.find((n) => n.kind === "battle" && n.layer >= 3 && !goalAt(run, n))!;
    const dry = battleSetup(run, node.id, "en");
    node.flood = "flooded";
    const wet = battleSetup(run, node.id, "en");
    expect(wet.units.filter((u) => u.team === "foes").length).toBe(Math.max(1, dry.units.filter((u) => u.team === "foes").length - FLOOD.foesFewer));
    for (const u of wet.units) expect(wet.map.tiles[u.pos.y * wet.map.w + u.pos.x]!.terrain).not.toBe("water");
    node.flood = "frozen";
    const cold = battleSetup(run, node.id, "en");
    expect(cold.map.tiles.some((t) => t.terrain === "water")).toBe(false);
  });

  it("flooding spreads water onto low ground next to it, never onto kept tiles", () => {
    const map = parseMap("pond", ["g0 g0 g0", "g0 w0 g0", "g0 g0 i0"]);
    const out = floodMap(map, "flooded", [{ x: 1, y: 0 }], 7);
    expect(out.tiles[1]!.terrain).toBe("grass");
    expect(out.tiles[8]!.terrain).toBe("water");
    expect(map.tiles[8]!.terrain).toBe("ice"); // the arena itself is untouched
  });

  it("with one way on, the choice is flood or freeze", () => {
    const run = newRun("one");
    const n = run.map.nodes.find((x) => x.next.length === 1 && x.kind !== "boss")!;
    setFloodgate(run.map, n.id, n.next[0]!, "frozen");
    expect(run.map.nodes[n.next[0]!]!.flood).toBe("frozen");
  });
});

describe("alternative good paths", () => {
  const atQuest = (id: string, approval: number, extra: Partial<RunState> = {}) => {
    const run: RunState = { ...newRun(`alt-${id}`), ...extra };
    const m = newMember(id, 0, true);
    m.approval = approval;
    run.party = [m];
    run.offers = [{ kind: "quest", companion: id }];
    return run;
  };

  it("Remanso with no escaped rival left faces his mill: breaking its dam is his good ending", () => {
    const run = atQuest("remanso", 30);
    const v = questView(run, "remanso");
    expect(v.alt).toBe(true);
    expect(v.choices.map((c) => c.lesson)).toEqual(["alt", "hold"]);
    const done = choose(run, 0);
    expect(endingOf(done.party[0]!)).toBe("good");
    expect(questView(atQuest("remanso", 0), "remanso").choices.map((c) => c.lesson)).toEqual(["hold"]);
  });

  it("Centella, when a rival fell while she was at camp, can stay at the village: she leaves, with her good ending", () => {
    const run = atQuest("centella", 30);
    run.party[0]!.seen = true; run.party[0]!.altPath = true;
    expect(questView(run, "centella").choices[0]!.lesson).toBe("alt");
    const done = choose(run, 0);
    expect(done.party[0]!.status).toBe("stayed");
    expect(endingOf(done.party[0]!)).toBe("good");
  });

  it("Moheda, trusted but not yet shown the cost, can test on herself: good ending, less max HP", () => {
    const run = atQuest("moheda", 30);
    expect(questView(run, "moheda").choices.map((c) => c.lesson)).toEqual(["alt", "hold", "double"]);
    const done = choose(run, 0);
    const m = done.party[0]!;
    expect(endingOf(m)).toBe("good");
    expect(memberSpec(m, 1, { x: 0, y: 0 }).hp).toBe(Math.round(48 * (1 - ALT_HP_CUT)));
  });

  it("finishing Moheda's research unlocks Mycelium Net and the poison ward; Guijo's sacrifice unlocks Lighthouse Wall", () => {
    const m = choose(atQuest("moheda", 0), 0); // not ready: [hold, double]
    expect(m.combos).toEqual(["myceliumNet"]);
    expect(m.poisonWard).toBe(1);
    expect(m.remarks).toContainEqual(QUESTS.moheda!.unlocks!.hold!.line);
    const g = atQuest("guijo", 30);
    g.party[0]!.seen = true;
    expect(choose(g, 0).combos).toEqual(["lighthouseWall"]);
  });

  it("Guijo, trusted, holds when an ally bleeds out in a won fight: his alternative good path, not his forbidden deed", () => {
    const setup = { seed: 3, map: flat(), units: [
      unit({ id: "hero", team: "heroes", pos: { x: 0, y: 0 }, speed: 30 }),
      unit({ id: "guijo", team: "heroes", pos: { x: 0, y: 1 }, speed: 25 }),
      unit({ id: "remanso", team: "heroes", pos: { x: 4, y: 4 }, speed: 20, hpNow: 1 }),
      unit({ id: "f", team: "foes", pos: { x: 4, y: 5 }, speed: 90, str: 50, abilities: ["bite"] }),
    ] };
    const log: Command[] = [];
    let t = createBattle(setup);
    for (let i = 0; i < 80 && t.units.find((u) => u.id === "remanso")!.life !== "dead"; i++) {
      const a = t.units.find((u) => u.id === "remanso")!;
      const c: Command = t.active === "f" && a.life === "up" ? { t: "cast", unit: "f", ability: "bite", target: a.pos } : { t: "endTurn", unit: t.active };
      log.push(c);
      const r = applyCommand(t, c); if (!r.ok) throw new Error(r.error); t = r.state;
    }
    expect(t.units.find((u) => u.id === "remanso")!.life).toBe("dead");
    t.units.find((u) => u.id === "f")!.life = "dead";
    t.winner = "heroes";
    const make = (approval: number) => {
      const run = newRun("guijo-alt");
      const g = newMember("guijo", 0, true); g.approval = approval;
      run.party = [g, newMember("remanso", 0, true)];
      run.battle = { version: 2, setup, commands: log, rewindsUsed: 0, node: run.map.nodes.find((n) => n.layer === 0)!.id };
      return finishBattle(run, t).party.find((m) => m.id === "guijo")!;
    };
    const held = make(30);
    expect(held.lesson).toBe("alt");
    expect(held.crossed).toBe(0);
    expect(endingOf(held)).toBe("good");
    const broke = make(5);
    expect(broke.lesson).toBeUndefined();
    expect(broke.crossed).toBe(1);
  });
});
