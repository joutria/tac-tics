/* M4: the nemesis, the rival who ended a run, carried into the next one until it is settled. */
import { describe, expect, it } from "vitest";
import { createBattle, type BattleState } from "../src/engine/state";
import { carriedNemesis, carriedReturn, closeRun, hasMilestone, keepsakeOf, kitOf, NEMESIS, newLegacy, RETURN } from "../src/run/legacy";
import { newMember } from "../src/run/party";
import { PERKS } from "../src/data/gear";
import { KITS, LORE, MILESTONE_HINT } from "../src/data/camp";
import { ITEMS } from "../src/data/gear";
import { enterNode, finishBattle, heroMaxHp, newRun, type RunState } from "../src/run/run";
import { DEPTH_STAT } from "../src/data/region";
import { rivalTitle } from "../src/run/rivals";

/** Ends the current battle: won (every foe dead, or `kill` only those) or lost (the party dead, foes standing). */
function end(run: RunState, how: "win" | "lose"): BattleState {
  const s = createBattle(run.battle!.setup);
  for (const u of s.units) {
    if (u.team === "foes" && how === "win") u.life = "dead";
    if (u.team === "heroes" && how === "lose") u.life = "dead";
  }
  s.winner = how === "win" ? "heroes" : "foes";
  return s;
}

const firstFight = (run: RunState) => enterNode(run, run.map.nodes.find((n) => n.layer === 0)!.id, "en");

describe("the nemesis", () => {
  it("whoever ends a run becomes its ender, and the legacy keeps it as the next nemesis", () => {
    let run = firstFight(newRun("lost-run"));
    run = finishBattle(run, end(run, "lose"));
    expect(run.over).toBe("lost");
    const ender = run.rivals.find((r) => r.id === run.endedBy)!;
    expect(ender).toBeTruthy();
    expect(run.remarks[0]!.en).toContain("waiting on your next journey");
    const legacy = closeRun(newLegacy(), run);
    expect(legacy.runs).toBe(1);
    expect(legacy.nemesis?.base.name).toBe(ender.base.name);
    expect(closeRun(legacy, run)).toBe(legacy); // counted once, however often the end screen loads
  });

  it("carries over a level weaker, brought back to an early depth, holding its counters", () => {
    let run = firstFight(newRun("deep"));
    run = finishBattle(run, end(run, "lose"));
    const legacy = closeRun(newLegacy(), run);
    legacy.nemesis!.level = 3; legacy.nemesis!.depth = 6;
    const n = carriedNemesis(legacy)!;
    expect(n.id).toBe(NEMESIS.id);
    expect(n.base.id).toBe(NEMESIS.id);
    expect(n.level).toBe(3 - NEMESIS.levelDrop);
    expect(n.base.str).toBe(Math.max(0, legacy.nemesis!.base.str - DEPTH_STAT * (6 - NEMESIS.depth)));
    expect(n.counters).toEqual(legacy.nemesis!.counters);
    expect(n.nemesis).toBe(1);
    expect(rivalTitle(n, "en")).toContain("last journey");
  });

  it("waits on the new run's map from layer 2, and says so", () => {
    let lost = firstFight(newRun("a"));
    lost = finishBattle(lost, end(lost, "lose"));
    const nem = carriedNemesis(closeRun(newLegacy(), lost))!;
    const run = newRun("b", "normal", nem);
    const node = run.map.nodes.find((n) => n.rival === NEMESIS.id)!;
    expect(node.kind).toBe("rival");
    expect(node.layer).toBeGreaterThanOrEqual(NEMESIS.layer);
    expect(run.remarks[0]!.en).toContain("followed you");
  });

  it("settling it pays shards and ends the chase", () => {
    let lost = firstFight(newRun("c"));
    lost = finishBattle(lost, end(lost, "lose"));
    const legacy = closeRun(newLegacy(), lost);
    let run = newRun("d", "normal", carriedNemesis(legacy));
    const node = run.map.nodes.find((n) => n.rival === NEMESIS.id)!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))?.id ?? null };
    run = enterNode(run, node.id, "en");
    expect(run.battle!.setup.units.some((u) => u.id === NEMESIS.id)).toBe(true);
    const shards = run.shards;
    run = finishBattle(run, end(run, "win"));
    expect(run.rivals.find((r) => r.id === NEMESIS.id)!.settled).toBe("finished");
    expect(run.shards).toBeGreaterThanOrEqual(shards + NEMESIS.shards);
    expect(run.remarks.some((l) => l.en.includes("won't follow you again"))).toBe(true);
    run.over = "won";
    const after = closeRun(legacy, run);
    expect(after.nemesis).toBeUndefined();
    expect(after.settled).toHaveLength(1);
    expect(after.wins).toBe(1);
  });

  it("an unsettled nemesis stays for the next run when this one ends some other way", () => {
    let lost = firstFight(newRun("e"));
    lost = finishBattle(lost, end(lost, "lose"));
    const legacy = closeRun(newLegacy(), lost);
    const run = newRun("f", "normal", carriedNemesis(legacy));
    run.over = "won";
    expect(closeRun(legacy, run).nemesis?.nemesis).toBe(1);
  });
});

describe("the camp between runs", () => {
  it("a first lost run opens only the first journal page; winning opens more, and only once as new", () => {
    let run = firstFight(newRun("m1"));
    run = finishBattle(run, end(run, "lose"));
    const one = closeRun(newLegacy(), run);
    expect(one.milestones).toEqual(["firstRun"]);
    expect(one.fresh).toEqual(["firstRun"]);
    expect(LORE.filter((p) => hasMilestone(one, p.needs)).map((p) => p.id)).toEqual(["sap"]);
    const won = { ...newRun("m2"), over: "won" as const };
    const two = closeRun(one, won);
    expect(two.milestones).toEqual(expect.arrayContaining(["firstRun", "region1", "runWon"]));
    expect(two.fresh).toEqual(["region1", "runWon"]);
    expect(closeRun(two, { ...newRun("m3"), over: "won" as const }).fresh).toEqual([]);
  });

  it("a picked kit counts only once it is open, and the run sets out with it", () => {
    const legacy = { ...newLegacy(), kit: "veteran" };
    expect(kitOf(legacy).id).toBe("traveller");
    legacy.milestones = ["runWon"];
    const kit = kitOf(legacy);
    expect(kit.id).toBe("veteran");
    const run = newRun("kit", "normal", undefined, kit);
    expect(run.kit).toBe("veteran");
    expect([...run.hero.bag, ...Object.values(run.hero.gear)]).toContain("featherCharm");
    const scav = newRun("kit2", "normal", undefined, KITS.find((k) => k.id === "scavenger")!);
    expect(scav.shards).toBe(2);
  });

  it("every kit and page names a milestone with a hint, and every kit's items exist", () => {
    for (const k of KITS) { if (k.needs) expect(MILESTONE_HINT[k.needs]).toBeTruthy(); for (const i of k.items ?? []) expect(ITEMS[i]).toBeTruthy(); }
    for (const p of LORE) expect(MILESTONE_HINT[p.needs].en.length).toBeGreaterThan(0);
  });
});

describe("companion endings carry over", () => {
  /** A finished run whose party is these members. */
  const ended = (seed: string, ...party: ReturnType<typeof newMember>[]): RunState => ({ ...newRun(seed), party, over: "won" });
  const good = () => ({ ...newMember("remanso", 30, true), lesson: "sacrifice" as const });
  const bad = (id = "guijo") => ({ ...newMember(id, 0, true), status: "fallen" as const });

  it("a good ending leaves a keepsake perk, never offered at a level-up, that the next run starts with", () => {
    const legacy = closeRun(newLegacy(), ended("g1", good()));
    expect(legacy.bonds?.remanso?.state).toBe("good");
    const keep = keepsakeOf(legacy)!;
    expect(PERKS[keep]!.keepsake).toBe("remanso");
    const run = newRun("g2", "normal", undefined, undefined, { keepsake: keep });
    expect(run.hero.perks).toEqual([keep]);
    expect(heroMaxHp(run)).toBe(heroMaxHp(newRun("g3")) + PERKS[keep]!.mods.hp!);
  });

  it("a bad ending brings them back as a rival on layer 3, and they can't be recruited while it stands", () => {
    const legacy = closeRun(newLegacy(), ended("b1", bad("remanso")));
    expect(legacy.bonds?.remanso?.state).toBe("bad");
    const back = carriedReturn(legacy)!;
    expect(back.id).toBe(RETURN.id);
    expect(back.returned).toBe("remanso");
    expect(rivalTitle(back, "en")).toContain("another journey");
    let run = newRun("b2", "normal", undefined, undefined, { returning: back });
    const node = run.map.nodes.find((n) => n.rival === RETURN.id)!;
    expect(node.layer).toBeGreaterThanOrEqual(RETURN.layer);
    expect(run.remarks.some((l) => l.en.includes("Remanso travelled with you once"))).toBe(true);
    const meet = run.map.nodes.find((n) => n.recruit === "remanso.meet")!;
    run = enterNode({ ...run, at: run.map.nodes.find((n) => n.next.includes(meet.id))?.id ?? null }, meet.id, "en");
    expect(run.offers.some((o) => o.kind === "talk")).toBe(false);
  });

  it("spared, they walk with the hero again and the bond is mended; finished, they never return", () => {
    const legacy = closeRun(newLegacy(), ended("s1", bad("remanso")));
    let run = newRun("s2", "normal", undefined, undefined, { returning: carriedReturn(legacy) });
    const node = run.map.nodes.find((n) => n.rival === RETURN.id)!;
    run = enterNode({ ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))?.id ?? null }, node.id, "en");
    const s = createBattle(run.battle!.setup);
    for (const u of s.units) if (u.team === "foes") u.life = u.id === RETURN.id ? "spared" : "dead";
    s.winner = "heroes";
    const after = finishBattle(run, s);
    expect(after.rivals.find((r) => r.returned)!.settled).toBe("spared");
    expect(after.party.map((m) => m.id)).toContain("remanso");
    expect(closeRun(legacy, { ...after, over: "lost" }).bonds?.remanso?.state).not.toBe("bad");
    const finished = { ...after, over: "won" as const, party: [], rivals: after.rivals.map((r) => (r.returned ? { ...r, settled: "finished" as const } : r)) };
    const closed = closeRun(legacy, finished);
    expect(closed.bonds?.remanso?.state).toBe("finished");
    expect(carriedReturn(closed)).toBeUndefined();
  });

  it("the newest ending wins, and only one companion returns at a time", () => {
    let legacy = closeRun(newLegacy(), ended("n1", bad("guijo"), bad("centella")));
    expect(carriedReturn(legacy)).toBeTruthy();
    legacy = closeRun(legacy, ended("n2", { ...newMember("guijo", 30, true), lesson: "sacrifice" }));
    expect(legacy.bonds?.guijo?.state).toBe("good");
    expect(carriedReturn(legacy)!.returned).toBe("centella");
  });
});
