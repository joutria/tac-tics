/* The Sap Mines' companions: Eco, who forbids striking your own, and Ceniza, who forbids paying with Sap. */
import { describe, expect, it } from "vitest";
import { COMPANIONS, QUESTS, TALKS } from "../src/data/companions";
import { ABILITIES } from "../src/data/abilities";
import { REGIONS } from "../src/data/region";
import { parseMap } from "../src/engine/grid";
import { applyCommand, createBattle, type UnitSpec } from "../src/engine/state";
import { newMember, react, readDeeds } from "../src/run/party";
import { newRun, questView, regionMap, type RunState } from "../src/run/run";
import { existsSync } from "node:fs";
import { lookArt } from "../src/data/units";

const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 20, agi: 10, res: {}, abilities: ["blaze"], ...o,
});

describe("the mines' companions", () => {
  it("each has real cards, art, a meeting talk and a quest, and waits on the mines' map", () => {
    const mines = REGIONS.find((r) => r.id === "mines")!;
    for (const id of ["eco", "ceniza"]) {
      const c = COMPANIONS[id]!;
      for (const a of [...c.spec.abilities, c.spec.quick!]) expect(ABILITIES[a], a).toBeTruthy();
      expect(existsSync(`public/${lookArt(c.spec.look)}`)).toBe(true);
      expect(TALKS[`${id}.meet`]!.companion).toBe(id);
      expect(QUESTS[id]!.companion).toBe(id);
      expect(mines.recruits.some((r) => r.talk === `${id}.meet`)).toBe(true);
    }
    const map = regionMap("eco", 2);
    expect(map.nodes.some((n) => n.recruit === "eco.meet" && n.layer === 1)).toBe(true);
  });

  it("striking a party member is read as friendly fire, and Eco never forgets it", () => {
    const setup = { seed: "ff", map: parseMap("flat", Array.from({ length: 6 }, () => "g0 g0 g0 g0 g0 g0")), units: [
      unit({ id: "hero", team: "heroes", pos: { x: 3, y: 5 }, speed: 90 }),
      unit({ id: "eco", team: "heroes", pos: { x: 3, y: 2 }, speed: 10 }),
      unit({ id: "foe", team: "foes", pos: { x: 3, y: 1 }, speed: 5 }),
    ] };
    const cmds = [{ t: "cast" as const, unit: "hero", ability: "blaze", target: { x: 3, y: 2 } }];
    // Blaze on Eco's tile: a cross that hits the foe above him and Eco himself.
    expect(applyCommand(createBattle(setup), cmds[0]!).ok).toBe(true);
    const deeds = readDeeds(setup, cmds);
    expect(deeds.friendlyFire).toBe(1);
    const before = newMember("eco", 10, true);
    const { member } = react(before, { friendlyFire: 1 });
    expect(member.approval).toBe(before.approval - 15);
    expect(member.crossed).toBe(1);
  });

  it("Ceniza sees what her fire feeds in the mines, then her quest offers letting it go out", () => {
    let run: RunState = { ...newRun("ceniza"), region: 2, map: regionMap("ceniza", 2) };
    run.party = [newMember("ceniza", 30, true)];
    const quest = questView(run, "ceniza");
    expect(quest.ready).toBe(false); // not seen yet
    run.party[0]!.seen = true;
    expect(questView(run, "ceniza").choices.map((c) => c.lesson)).toEqual(["sacrifice", "hold", "double"]);
  });
});
