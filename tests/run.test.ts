import { describe, expect, it } from "vitest";
import { HERO } from "../src/data/region";
import { applyCommand, createBattle, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { parseMap } from "../src/engine/grid";
import { APPROVAL, COMPANIONS } from "../src/data/companions";
import { memberSpec, newMember, react, readDeeds } from "../src/run/party";
import { aheadOf, generateMap, MAP_LAYERS } from "../src/run/map";
import { ITEMS, PERKS, SHOP, xpToNext } from "../src/data/gear";
import { gainXp, heroSpec, newProgress } from "../src/run/hero";
import { battleSetup, buy, choose, enterNode, finishBattle, heroMaxHp, leaveShop, newRun, nextNodes, REST_HEAL, rulesOf, shopHeal, wear, type RunState } from "../src/run/run";

/** Answers every offer with the first option and leaves shops. */
function answer(run: RunState): RunState {
  while (run.offers.length) run = run.offers[0]!.kind === "shop" ? leaveShop(run) : choose(run, 0);
  return run;
}

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
      run = answer(run);
      const pick = nextNodes(run)[0]!;
      run = enterNode(run, pick.id, "en");
      if (run.battle) run = finishBattle(run, end(run, "win"));
    }
    expect(run.over).toBe("won");
    expect(run.path).toHaveLength(MAP_LAYERS);
  });
});

describe("growth and economy", () => {
  it("levels up with fixed growth and offers a perk pair every second level", () => {
    const { progress, perkChoices, levels } = gainXp(newProgress(), xpToNext(1) + xpToNext(2), "s");
    expect(levels).toBe(2);
    expect(progress.level).toBe(3);
    expect(perkChoices).toHaveLength(1);
    expect(perkChoices[0]).toHaveLength(2);
    expect(new Set(perkChoices[0]).size).toBe(2);
    const spec = heroSpec(HERO, { ...progress, perks: [perkChoices[0]![0]!] });
    expect(spec.hp).toBeGreaterThanOrEqual(HERO.hp + 8);
  });

  it("items change the hero and can teach abilities", () => {
    const spec = heroSpec(HERO, { ...newProgress(), gear: { weapon: "emberRod" } });
    expect(spec.abilities).toContain("ember");
    expect(spec.mag).toBe(HERO.mag + ITEMS.emberRod!.mods.mag!);
  });

  it("pays spoils for beaten foes and offers 1 of 3 rewards after a win", () => {
    let run = newRun("e1");
    run = enterNode(run, nextNodes(run)[0]!.id, "en");
    run = finishBattle(run, end(run, "win"));
    expect(run.coins).toBeGreaterThan(0);
    expect(run.spoils!.xp).toBeGreaterThan(0);
    expect(nextNodes(run)).toHaveLength(0); // the reward comes first
    const offer = run.offers.at(-1)!;
    expect(offer.kind).toBe("reward");
    expect(offer.kind === "reward" && offer.options).toHaveLength(3);
    // Deterministic: the same battle gives the same offer.
    const again = finishBattle(enterNode(newRun("e1"), nextNodes(newRun("e1"))[0]!.id, "en"), end(enterNode(newRun("e1"), nextNodes(newRun("e1"))[0]!.id, "en"), "win"));
    expect(again.offers).toEqual(run.offers);
    run = answer(run);
    expect(nextNodes(run).length).toBeGreaterThan(0);
  });

  it("perks are applied when picked", () => {
    let run: RunState = { ...newRun("e2"), offers: [{ kind: "perk", options: ["vigor", "focus"] }] };
    const hp = run.heroHp;
    run = choose(run, 0);
    expect(run.hero.perks).toEqual(["vigor"]);
    expect(heroMaxHp(run)).toBe(HERO.hp + PERKS.vigor!.mods.hp!);
    expect(run.heroHp).toBe(hp + PERKS.vigor!.mods.hp!);
  });

  it("shops sell for coins or shards, heal, and swap gear", () => {
    let run: RunState = { ...newRun("e3"), coins: 100, shards: 0, heroHp: 10, offers: [{ kind: "shop", stock: ["ashStaff", "sunlance"] }] };
    run = buy(run, "ashStaff");
    expect(run.coins).toBe(100 - ITEMS.ashStaff!.price);
    expect(run.hero.gear.weapon).toBe("ashStaff");
    expect(() => buy(run, "sunlance")).toThrow(); // epic: costs shards
    run = buy({ ...run, shards: 5 }, "sunlance");
    expect(run.hero.bag).toEqual(["sunlance"]);
    run = shopHeal(run);
    expect(run.heroHp).toBe(10 + Math.round(heroMaxHp(run) * SHOP.heal));
    run = wear(leaveShop(run), "sunlance");
    expect(run.hero.gear.weapon).toBe("sunlance");
    expect(run.hero.bag).toEqual(["ashStaff"]);
  });
});

describe("companions", () => {
  const flat = parseMap("flat", Array.from({ length: 7 }, () => Array(7).fill("g0").join(" ")));
  const mk = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
    name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
  });

  it("recruits through a conversation, with the forbidden line revealed", () => {
    let run = newRun("c1");
    const node = run.map.nodes.find((n) => n.kind === "recruit")!;
    expect(node.layer).toBe(1);
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))!.id };
    run = enterNode(run, node.id, "en");
    expect(run.offers[0]).toEqual({ kind: "talk", id: "remanso.meet" });
    run = choose(run, 0);
    expect(run.party).toHaveLength(1);
    expect(run.party[0]!.known).toBe(true);
    expect(run.party[0]!.approval).toBe(APPROVAL.start + 10);
    run = choose(run, 0); // close the conversation
    expect(run.offers).toHaveLength(0);
    // The next battle fields Remanso next to the hero.
    run = enterNode(run, nextNodes(run).find((n) => n.kind !== "rest" && n.kind !== "shop")!.id, "en");
    expect(run.battle!.setup.units.some((u) => u.id === "remanso")).toBe(true);
  });

  it("reads deeds from the log: killing a fleeing foe is forbidden, helping up is liked", () => {
    const s = createBattle({ seed: 1, map: flat, units: [
      mk({ id: "h", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, mag: 300 }),
      mk({ id: "f", team: "foes", pos: { x: 3, y: 2 }, speed: 10, marked: true }),
      mk({ id: "g", team: "foes", pos: { x: 6, y: 6 }, speed: 10 }),
    ] });
    const setup = { seed: 1, map: flat, units: s.units.map((u) => ({ ...u })) as UnitSpec[] };
    // f starts nearly dead, so it flees once round 3 comes.
    setup.units.find((u) => u.id === "f")!.hpNow = 1;
    const log: Command[] = [];
    let t = createBattle(setup);
    while (t.units.find((u) => u.id === "f")!.escape !== "flee") { const c = { t: "endTurn" as const, unit: t.active }; log.push(c); const r = applyCommand(t, c); if (!r.ok) throw new Error(r.error); t = r.state; }
    while (t.active !== "h") { const c = { t: "endTurn" as const, unit: t.active }; log.push(c); const r = applyCommand(t, c); if (!r.ok) throw new Error(r.error); t = r.state; }
    log.push({ t: "cast", unit: "h", ability: "ray", target: t.units.find((u) => u.id === "f")!.pos });
    const deeds = readDeeds(setup, log);
    expect(deeds.killFleeing).toBe(1);
    const m = newMember("remanso", 0, false);
    const { member, remarks } = react(m, deeds);
    expect(member.approval).toBe(m.approval + COMPANIONS.remanso!.reacts.killFleeing!);
    expect(member.known).toBe(true); // learned by their first protest
    expect(remarks.length).toBeGreaterThan(0);
  });

  it("escalates: refuses orders under -30, leaves at a rest under -60, turns on you after a forbidden deed at the bottom", () => {
    const none = { helpUp: 0, heal: 0, finishDowned: 0, killFleeing: 0, letEscape: 0 };
    const low = { ...newMember("remanso", 0, true), approval: -40 };
    expect(memberSpec(low, 1, { x: 0, y: 0 }).refuses).toBe("fleeing");
    expect(react(low, none).member.status).toBe("with");
    const lower = react({ ...low, approval: -61 }, none).member;
    expect(lower.status).toBe("leaving");
    const turned = react({ ...low, approval: -50 }, { ...none, killFleeing: 1 }).member;
    expect(turned.status).toBe("turned");
    expect(react({ ...low, approval: 40 }, { ...none, helpUp: 9 }).member.approval).toBe(40 + COMPANIONS.remanso!.likeCapPerBattle);
  });

  it("a companion who will not strike the fleeing loses the turn instead", () => {
    const s = createBattle({ seed: 1, map: flat, units: [
      mk({ id: "r", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, refuses: "fleeing" }),
      mk({ id: "f", team: "foes", pos: { x: 3, y: 2 }, speed: 10 }),
    ] });
    s.units.find((u) => u.id === "f")!.escape = "flee";
    const r = applyCommand(s, { t: "cast", unit: "r", ability: "ray", target: { x: 3, y: 2 } });
    expect(r.ok && r.events[0]).toEqual({ e: "refused", unit: "r", target: { x: 3, y: 2 } });
    expect(r.ok && r.state.turns).toBe(s.turns + 1); // the turn ended
    expect(r.ok && r.state.units.find((u) => u.id === "f")!.hp).toBe(40);
  });
});

describe("difficulty", () => {
  const foes = (d: "easy" | "normal" | "hard") => {
    const run = newRun("diff-seed", d);
    const node = run.map.nodes.find((n) => n.layer === 3 && (n.kind === "battle" || n.kind === "elite"))!;
    return battleSetup(run, node.id, "en").units.filter((u) => u.team === "foes");
  };
  it("hard fields more and tougher foes than normal, easy weaker ones", () => {
    const [e, n, h] = [foes("easy"), foes("normal"), foes("hard")];
    expect(h.length).toBe(Math.min(4, n.length + 1));
    expect(e.length).toBe(n.length);
    expect(h[0]!.hp).toBeGreaterThan(n[0]!.hp);
    expect(e[0]!.hp).toBeLessThan(n[0]!.hp);
  });
  it("defaults to normal and sets rewinds per level", () => {
    expect(newRun("x").difficulty).toBe("normal");
    expect(rulesOf(newRun("x", "hard")).rewinds).toBe(0);
    expect(rulesOf(newRun("x", "easy")).rewinds).toBe(3);
  });
});
