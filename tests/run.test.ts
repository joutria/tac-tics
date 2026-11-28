import { describe, expect, it } from "vitest";
import { HERO, REGIONS } from "../src/data/region";
import { applyCommand, createBattle, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { parseMap } from "../src/engine/grid";
import { APPROVAL, COMPANIONS, LESSON_APPROVAL, QUESTS, TALKS } from "../src/data/companions";
import { ABILITIES } from "../src/data/abilities";
import { EXECUTIONER_FACTOR, GUARD_FACTOR, JOB_LAYER, JOBS } from "../src/data/jobs";
import { damageFactor } from "../src/engine/combat";
import { endingOf, memberSpec, newMember, react, readDeeds } from "../src/run/party";
import { aheadOf, generateMap, MAP_LAYERS, QUEST_GAP } from "../src/run/map";
import { ITEMS, PERKS, SHOP, xpToNext } from "../src/data/gear";
import { gainXp, heroSpec, newProgress } from "../src/run/hero";
import { ALTAR, questChoices, battleSetup, buy, RUN_VERSION, upgradeRun, choose, enterNode, finishBattle, heroMaxHp, leaveShop, newRun, nextNodes, REST_HEAL, rulesOf, shopHeal, wear, type RunState } from "../src/run/run";

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
  it("has links that never cross and a fork now and then", () => {
    let forks = 0;
    for (let k = 0; k < 60; k++) {
      const m = generateMap(`cross${k}`);
      const links = m.nodes.flatMap((n) => n.next.map((id) => ({ layer: n.layer, a: n.col, b: m.nodes[id]!.col })));
      for (const p of links) for (const q of links) {
        if (p.layer !== q.layer) continue;
        // Two links between the same layers cross when their ends swap sides.
        expect((p.a - q.a) * (p.b - q.b) >= 0).toBe(true);
      }
      forks += m.nodes.filter((n) => n.next.length > 1 && n.layer < MAP_LAYERS - 2).length;
    }
    expect(forks).toBeGreaterThan(60);
  });
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

  it("a won battle where a companion fell does not end the run, whatever order the units end in", () => {
    let run = newRun("c1");
    const node = run.map.nodes.find((n) => n.kind === "recruit")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))!.id };
    run = choose(choose(enterNode(run, node.id, "en"), 0), 0);
    run = enterNode(run, nextNodes(run).find((n) => n.kind !== "rest" && n.kind !== "shop")!.id, "en");
    const s = end(run, "win");
    s.units.find((u) => u.id === "remanso")!.life = "dead";
    // The battle can reorder its units, so the fallen companion may come before the hero.
    s.units.sort((a, b) => (a.id === "remanso" ? -1 : b.id === "remanso" ? 1 : 0));
    const after = finishBattle(run, s);
    expect(after.over).toBeNull();
    expect(after.party[0]!.status).toBe("fallen");
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
    const node = run.map.nodes.find((n) => n.layer >= 3 && (n.kind === "battle" || n.kind === "elite"))!;
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

describe("regions", () => {
  it("moves on to the next region after a boss, with a fresh map and stronger, renamed foes", () => {
    expect(REGIONS.length).toBe(3);
    let run = newRun("regions");
    while (!run.over && run.region === 0) {
      run = answer(run);
      run = enterNode(run, nextNodes(run)[0]!.id, "en");
      if (run.battle) run = finishBattle(run, end(run, "win"));
    }
    expect(run.over).toBeNull();
    expect(run.region).toBe(1);
    expect(run.at).toBeNull();
    expect(run.path).toEqual([]);
    run = answer(run);
    const setup = battleSetup(run, nextNodes(run)[0]!.id, "en");
    const natives = (REGIONS[1]!.natives ?? []).map((sp) => sp.name);
    for (const foe of setup.units.filter((u) => u.team === "foes" && !u.rival)) {
      if (natives.includes(foe.name)) continue;
      expect(foe.name.startsWith("Frost ")).toBe(true);
      expect(foe.element).toBe("ice");
      expect(foe.abilities).toContain("frostbite");
    }
    while (!run.over && run.region === 1) {
      run = answer(run);
      run = enterNode(run, nextNodes(run)[0]!.id, "en");
      if (run.battle) {
        if (run.map.nodes[run.battle.node]!.kind === "boss") expect(run.battle.setup.units.some((u) => u.name === "Broken Mira")).toBe(true);
        run = finishBattle(run, end(run, "win"));
      }
    }
    // The third region: the Sap Mines, with Ember foes and Blackened Forja in her own lair at the end.
    expect(run.over).toBeNull();
    expect(run.region).toBe(2);
    run = answer(run);
    const mine = battleSetup(run, nextNodes(run)[0]!.id, "en");
    const mineNatives = (REGIONS[2]!.natives ?? []).map((sp) => sp.name);
    for (const foe of mine.units.filter((u) => u.team === "foes" && !u.rival)) {
      if (mineNatives.includes(foe.name)) continue;
      expect(foe.name.startsWith("Ember ")).toBe(true);
      expect(foe.element).toBe("fire");
    }
    while (!run.over) {
      run = answer(run);
      run = enterNode(run, nextNodes(run)[0]!.id, "en");
      if (run.battle) {
        if (run.map.nodes[run.battle.node]!.kind === "boss") {
          expect(run.battle.setup.units.some((u) => u.name === "Blackened Forja")).toBe(true);
          expect(run.battle.setup.map.id).toBe("heart");
        }
        run = finishBattle(run, end(run, "win"));
      }
    }
    expect(run.over).toBe("won");
  });
  it("upgrades a save from before regions", () => {
    const { region: _r, ...old } = { ...newRun("old"), version: 4 };
    const up = upgradeRun(old as RunState);
    expect(up.version).toBe(RUN_VERSION);
    expect(up.region).toBe(0);
  });
});

describe("recruits", () => {
  const flat = parseMap("flat8", Array.from({ length: 8 }, () => Array(8).fill("g0").join(" ")));
  const mk = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
    name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
  });

  it("each region places its own recruits on their layers", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      for (const region of REGIONS) {
        const map = generateMap(seed, region.recruits);
        for (const r of region.recruits) {
          const n = map.nodes.filter((x) => x.recruit === r.talk);
          expect(n).toHaveLength(1);
          expect(n[0]!.layer).toBe(r.layer);
        }
      }
    }
  });

  it("every companion has a meet talk, real abilities and a look", () => {
    for (const r of REGIONS) for (const s of r.recruits) {
      const talk = TALKS[s.talk]!;
      const c = COMPANIONS[talk.companion]!;
      for (const a of c.spec.abilities) expect(ABILITIES[a], a).toBeTruthy();
      expect(talk.choices.some((x) => x.joins)).toBe(true);
    }
  });

  it("reads an ally bleeding out, and a clean quick win", () => {
    const setup = { seed: 3, map: flat, units: [
      mk({ id: "hero", team: "heroes", pos: { x: 0, y: 0 }, speed: 30 }),
      mk({ id: "a", team: "heroes", pos: { x: 4, y: 4 }, speed: 20, hpNow: 1 }),
      mk({ id: "f", team: "foes", pos: { x: 4, y: 5 }, speed: 90, str: 50, abilities: ["bite"] }),
    ] };
    const log: Command[] = [];
    let t = createBattle(setup);
    for (let i = 0; i < 60 && t.units.find((u) => u.id === "a")!.life !== "dead"; i++) {
      const a = t.units.find((u) => u.id === "a")!;
      const c: Command = t.active === "f" && a.life === "up" ? { t: "cast", unit: "f", ability: "bite", target: a.pos } : { t: "endTurn", unit: t.active };
      log.push(c);
      const r = applyCommand(t, c); if (!r.ok) throw new Error(r.error); t = r.state;
    }
    expect(t.units.find((u) => u.id === "a")!.life).toBe("dead");
    const deeds = readDeeds(setup, log);
    expect(deeds.allyBledOut).toBe(1);
    expect(deeds.noneDowned).toBe(0);
    const g = react(newMember("guijo", 0, false), deeds).member;
    expect(g.crossed).toBe(1);
    expect(g.approval).toBe(APPROVAL.start + COMPANIONS.guijo!.reacts.allyBledOut!);

    const quick = { seed: 3, map: flat, units: [
      mk({ id: "hero", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, mag: 300 }),
      mk({ id: "f", team: "foes", pos: { x: 3, y: 2 }, speed: 10 }),
    ] };
    const win = readDeeds(quick, [{ t: "cast", unit: "hero", ability: "ray", target: { x: 3, y: 2 } }]);
    expect(win.noneDowned).toBe(1);
    expect(win.quickWin).toBe(1);
  });

  it("Centella's grudge against sparing rivals sours her mood but never past the clash floor", () => {
    const c = newMember("centella", 0, true);
    const once = react(c, { rivalEscaped: 5 }).member;
    expect(once.approval).toBe(APPROVAL.clashFloor);
    expect(once.status).toBe("with");
    expect(react({ ...c, approval: -25 }, { rivalEscaped: 3, letEscape: 3 }).member.approval).toBe(-25);
    expect(APPROVAL.clashFloor).toBeGreaterThan(APPROVAL.refuses);
  });

  it("fields at most three companions; the others wait at camp", () => {
    let run = newRun("bench");
    run.party = ["remanso", "guijo", "centella", "moheda"].map((id) => newMember(id, 0, false));
    run = enterNode(run, nextNodes(run)[0]!.id, "en");
    const allies = run.battle!.setup.units.filter((u) => u.team === "heroes" && u.id !== "hero");
    expect(allies.map((u) => u.id)).toEqual(["remanso", "guijo", "centella"]);
  });

  it("Moheda's Sap Cap grows with shards", () => {
    const m = newMember("moheda", 0, false);
    expect(memberSpec(m, 1, { x: 0, y: 0 }, 0).abilities).toContain("sapCap");
    expect(memberSpec(m, 1, { x: 0, y: 0 }, 3).abilities).toContain("sapCapRich");
  });

  it("a rest's cleansing fire burns shards to heal everyone, and Moheda never forgives it", () => {
    let run = newRun("altar");
    const rest = run.map.nodes.find((n) => n.kind === "rest")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(rest.id))!.id, shards: 3, heroHp: 5 };
    run.party = [{ ...newMember("moheda", 0, false), hp: 1 }];
    run = enterNode(run, rest.id, "en");
    expect(run.offers[0]).toEqual({ kind: "altar" });
    const kept = choose(run, 1);
    expect(kept.shards).toBe(3);
    run = choose(run, 0);
    expect(run.shards).toBe(3 - ALTAR.shards);
    expect(run.heroHp).toBe(heroMaxHp(run));
    expect(run.party[0]!.crossed).toBe(1);
    expect(run.party[0]!.approval).toBe(APPROVAL.start + COMPANIONS.moheda!.reacts.destroyShards!);
    expect(run.remarks.length).toBeGreaterThan(0);
  });
});

describe("personal quests and endings", () => {
  const joined = (id: string, talk: string, seed = "quest") => {
    let run = newRun(seed);
    const node = run.map.nodes.find((n) => n.recruit === talk)!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))!.id };
    run = enterNode(run, node.id, "en");
    run = choose(choose(run, 0), 0);
    while (run.offers.length) run = choose(run, 0); // the job offer, when joining on its layer
    return { run, member: run.party.find((m) => m.id === id)! };
  };

  it("joining places the companion's quest at least two layers ahead", () => {
    const { run } = joined("remanso", "remanso.meet");
    const q = run.map.nodes.find((n) => n.quest === "remanso")!;
    expect(q.kind).toBe("quest");
    expect(q.layer).toBeGreaterThanOrEqual(1 + QUEST_GAP);
  });

  it("offers the sacrifice only once they are ready, and endings follow the lesson", () => {
    // A seed where a fight still lies ahead of where Guijo joins, so his quest has somewhere to wait.
    let { run } = joined("guijo", "guijo.meet", "quest3");
    const quest = run.map.nodes.find((n) => n.quest === "guijo")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(quest.id))!.id };
    const at = enterNode(run, quest.id, "en");
    expect(at.offers[0]).toEqual({ kind: "quest", companion: "guijo" });
    expect(questChoices(at, "guijo")).toEqual(["hold", "double"]);
    expect(endingOf(at.party[0]!)).toBe("regular");

    const ready = structuredClone(at);
    ready.party[0]!.seen = true; ready.party[0]!.approval = LESSON_APPROVAL;
    expect(questChoices(ready, "guijo")[0]).toBe("sacrifice");
    const good = choose(ready, 0);
    expect(good.party[0]!.lesson).toBe("sacrifice");
    expect(endingOf(good.party[0]!)).toBe("good");
    expect(choose(good, 0).offers.some((o) => o.kind === "quest")).toBe(false);

    const stays = choose(at, 1); // not ready: [hold, double]; he stays behind in the tunnel
    expect(stays.party[0]!.status).toBe("left");
    expect(endingOf(stays.party[0]!)).toBe("bad");
  });

  it("Centella killing her rival after seeing the damage is her bad ending", () => {
    const m = { ...newMember("centella", 0, true), lesson: "hold" as const };
    expect(endingOf(m)).toBe("regular");
    expect(endingOf({ ...m, seen: true })).toBe("bad");
    expect(endingOf({ ...m, lesson: undefined, status: "fallen" })).toBe("bad");
  });

  it("past the town, a rest shows Centella the burned marsh", () => {
    let run = newRun("marsh");
    run.region = 1;
    run.party = [newMember("centella", 0, true)];
    const rest = run.map.nodes.find((n) => n.kind === "rest")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(rest.id))!.id };
    run = enterNode(run, rest.id, "en");
    expect(run.party[0]!.seen).toBe(true);
    expect(run.remarks).toContainEqual(QUESTS.centella!.seen);
  });

  it("every recruit has a quest with all three endings in both languages", () => {
    for (const r of REGIONS) for (const s of r.recruits) {
      const q = QUESTS[TALKS[s.talk]!.companion]!;
      for (const e of ["good", "regular", "bad"] as const) { expect(q.endings[e].es).toBeTruthy(); expect(q.endings[e].en).toBeTruthy(); }
    }
  });
});

describe("hero jobs", () => {
  const atLayer = (layer: number, leanings?: { beacon: number; blaze: number }) => {
    let run = newRun("jobs");
    const node = run.map.nodes.find((n) => n.layer === layer && ["rest", "shop", "recruit"].includes(n.kind))!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))!.id, leanings };
    return enterNode(run, node.id, "en");
  };

  it("offers the job the run leans towards halfway through the first region, both on a tie", () => {
    expect(atLayer(1).offers.some((o) => o.kind === "job")).toBe(false);
    expect(atLayer(JOB_LAYER).offers.find((o) => o.kind === "job")).toEqual({ kind: "job", options: ["beacon", "blaze"] });
    expect(atLayer(JOB_LAYER, { beacon: 1, blaze: 3 }).offers.find((o) => o.kind === "job")).toEqual({ kind: "job", options: ["blaze"] });
  });

  it("taking a job teaches its abilities and passive, and companions react", () => {
    let run = atLayer(JOB_LAYER, { beacon: 4, blaze: 0 });
    run.party = [newMember("remanso", 0, true)];
    while (run.offers[0]!.kind !== "job") run = run.offers[0]!.kind === "shop" ? leaveShop(run) : choose(run, 0);
    run = choose(run, 0);
    expect(run.hero.job).toBe("beacon");
    const spec = heroSpec(HERO, run.hero);
    expect(spec.abilities).toEqual(expect.arrayContaining(JOBS.beacon.abilities));
    expect(spec.passive).toBe("guard");
    expect(run.party[0]!.approval).toBe(APPROVAL.start + COMPANIONS.remanso!.reacts.jobBeacon!);
    // Only once a run.
    const later = enterNode(run, nextNodes(run)[0]!.id, "en");
    expect(later.offers.some((o) => o.kind === "job")).toBe(false);
  });

  it("Guard cuts damage to allies beside the hero; Executioner hits the wounded harder; Dawn cleanses", () => {
    const flat = parseMap("flat9", Array.from({ length: 9 }, () => Array(9).fill("g0").join(" ")));
    const mk = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
      name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 20, agi: 10, res: {}, abilities: ["ray", "dawn"], ...o,
    });
    const units = (passive?: "guard" | "executioner") => [
      mk({ id: "hero", team: "heroes", pos: { x: 4, y: 4 }, passive }), mk({ id: "a", team: "heroes", pos: { x: 4, y: 5 } }),
      mk({ id: "f", team: "foes", pos: { x: 4, y: 8 } }),
    ];
    const s0 = createBattle({ seed: 1, map: flat, units: units() }), s1 = createBattle({ seed: 1, map: flat, units: units("guard") });
    const ray = ABILITIES.ray!;
    const at = (s: BattleState, id: string) => s.units.find((u) => u.id === id)!;
    expect(damageFactor(s1, at(s1, "f"), at(s1, "a"), ray)).toBeCloseTo(damageFactor(s0, at(s0, "f"), at(s0, "a"), ray) * GUARD_FACTOR);
    const s2 = createBattle({ seed: 1, map: flat, units: units("executioner") });
    const f = at(s2, "f"); const full = damageFactor(s2, at(s2, "hero"), f, ray); f.hp = 10;
    expect(damageFactor(s2, at(s2, "hero"), f, ray)).toBeCloseTo(full * EXECUTIONER_FACTOR);
    const s3 = createBattle({ seed: 1, map: flat, units: units() });
    at(s3, "a").statuses = [{ id: "poison", turns: 2, power: 3 }, { id: "shield", turns: 2, power: 5 }];
    const hero = at(s3, "hero");
    s3.active = hero.id;
    const r = applyCommand(s3, { t: "cast", unit: s3.active, ability: "dawn", target: { x: 4, y: 5 } });
    if (!r.ok) throw new Error(r.error);
    expect(at(r.state, "a").statuses.map((x) => x.id)).toEqual(["shield"]);
  });
});
