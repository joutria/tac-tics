/* Alignment meters: the nine alignments, what moves them, lock-in, the hero's ending and the twin cards they open. */
import { describe, expect, it } from "vitest";
import { parseMap } from "../src/engine/grid";
import { activeUnit, applyCommand, createBattle, unitById, unsettled, type BattleSetup, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { ALIGN, GRID, SHIFT, type Align } from "../src/data/alignment";
import { TWINS } from "../src/data/twins";
import { alignmentOf, battleShift, heroEnding, lockWarning, shiftAlign, twinBar } from "../src/run/alignment";
import { noDeeds } from "../src/run/party";
import { ALTAR, choose, enterNode, finishBattle, heroOf, newRun, nextNodes, relapses, upgradeRun, wearTwin, type RunState } from "../src/run/run";

const at = (mercy: number, purity: number): Align => ({ mercy, purity });
const levelled = (run: RunState, level: number): RunState => ({ ...run, hero: { ...run.hero, level } });

describe("the nine alignments", () => {
  it("come from three bands per meter, 20 or more on a side", () => {
    expect(alignmentOf(at(20, 20))).toBe("lantern");
    expect(alignmentOf(at(19, 19))).toBe("wanderer");
    expect(alignmentOf(at(-19, -20))).toBe("bargainer");
    expect(alignmentOf(at(-20, 0))).toBe("hunter");
    expect(alignmentOf(at(-60, -60))).toBe("crown");
    expect(alignmentOf(at(40, -25))).toBe("graft");
    expect(new Set(Object.values(GRID).flatMap((r) => Object.values(r))).size).toBe(9);
  });

  it("corners get a full ending, edges a variant of the corner they lean to, the middle the regular one", () => {
    expect(heroEnding(at(30, 30)).kind).toBe("corner");
    expect(heroEnding(at(0, 0)).kind).toBe("regular");
    const shepherdPure = heroEnding(at(30, 5)), shepherdSap = heroEnding(at(30, -5));
    expect(shepherdPure).toMatchObject({ alignment: "shepherd", kind: "edge", corner: "lantern" });
    expect(shepherdSap).toMatchObject({ alignment: "shepherd", kind: "edge", corner: "graft" });
    expect(heroEnding(at(-3, -40))).toMatchObject({ alignment: "bargainer", corner: "crown" });
    expect(shepherdPure.text.en).not.toBe(shepherdSap.text.en);
  });
});

describe("what moves the meters", () => {
  const setup: BattleSetup = { seed: 1, map: parseMap("flat", ["g0 g0", "g0 g0"]), units: [] };
  const hero = { id: "hero", team: "heroes", pos: { x: 0, y: 0 } } as UnitSpec;
  const end = (units: Partial<BattleState["units"][number]>[] = []) => ({ units } as unknown as BattleState);

  it("sparing, finishing and helping up move Mercy, capped per fight", () => {
    const d = { ...noDeeds(), spare: 1, helpUp: 1 };
    expect(battleShift({ ...setup, units: [hero] }, [], end(), d).mercy).toBe(SHIFT.spare + SHIFT.helpUp);
    expect(battleShift({ ...setup, units: [hero] }, [], end(), { ...noDeeds(), finishYielding: 1 }).mercy).toBe(SHIFT.finish);
    expect(battleShift({ ...setup, units: [hero] }, [], end(), { ...noDeeds(), spare: 5 }).mercy).toBe(ALIGN.perFight);
    expect(battleShift({ ...setup, units: [hero] }, [], end(), { ...noDeeds(), killFleeing: 9 }).mercy).toBe(-ALIGN.perFight);
  });

  it("settling a rival counts on top of the cap", () => {
    const spared = end([{ team: "foes", rival: true, life: "spared" } as never]);
    expect(battleShift({ ...setup, units: [hero] }, [], spared, { ...noDeeds(), spare: 5 }).mercy).toBe(ALIGN.perFight + SHIFT.rivalSpared);
    const finished = end([{ team: "foes", rival: true, life: "dead" } as never]);
    expect(battleShift({ ...setup, units: [hero] }, [], finished, noDeeds()).mercy).toBe(SHIFT.rivalFinished);
  });

  it("a tagged twin the hero used moves its side by 1, once per card", () => {
    const cast = (ability: string): Command => ({ t: "cast", unit: "hero", ability, target: { x: 1, y: 0 } });
    const s = battleShift({ ...setup, units: [hero] }, [cast("sapRay"), cast("sapRay"), cast("verdict"), cast("ray")], end(), noDeeds());
    expect(s).toEqual({ mercy: -SHIFT.tagged, purity: -SHIFT.tagged });
  });

  it("burning shards at a rest's fire is Purity; a won fight records the shift in the spoils", () => {
    let run = newRun("align-altar");
    run = { ...run, shards: ALTAR.shards, offers: [{ kind: "altar" }] };
    expect(choose(run, 0).align).toEqual({ mercy: 0, purity: SHIFT.burnShards });
    expect(choose(run, 1).align).toBeUndefined();
  });

  it("a battle won by sparing everyone moves Mercy and says so in the spoils", () => {
    let run = newRun("align-win");
    const node = nextNodes(run).find((n) => n.kind === "battle")!;
    run = enterNode(run, node.id, "en");
    for (const u of run.battle!.setup.units) if (u.team === "foes") { u.hpNow = 1; delete u.marked; }
    let s = createBattle(run.battle!.setup);
    const first: Command = { t: "endTurn", unit: activeUnit(s).id };
    s = (applyCommand(s, first) as { state: BattleState }).state; run.battle!.commands.push(first);
    for (const u of unsettled(s)) {
      const c: Command = { t: "settle", unit: u.id, choice: "spare" };
      s = (applyCommand(s, c) as { state: BattleState }).state; run.battle!.commands.push(c);
    }
    const won = finishBattle(run, s);
    expect(won.align!.mercy).toBeGreaterThan(0);
    expect(won.spoils!.align).toEqual({ mercy: won.align!.mercy, purity: 0 });
  });
});

describe("marks and lock-in", () => {
  it("crossing 20 and 50 is said once; reaching 50 locks that side in", () => {
    const run = newRun("align-lock");
    expect(shiftAlign(run, { mercy: 19 })).toEqual([]);
    expect(shiftAlign(run, { mercy: 1 })).toHaveLength(1);
    expect(lockWarning({ align: { mercy: 45, purity: 0 } })).toEqual({ meter: "mercy", side: "mercy" });
    const said = shiftAlign(run, { mercy: 30 });
    expect(said).toHaveLength(2); // the signature mark, then the lock
    expect(run.alignLock).toEqual({ mercy: "mercy" });
    // Locked: dropping back and swinging to the other side never reopens Severity's signature twins.
    shiftAlign(run, { mercy: -200 });
    expect(run.align!.mercy).toBe(-ALIGN.max);
    expect(run.alignLock).toEqual({ mercy: "mercy" });
    const brand = TWINS.find((t) => t.twin === "brand")!;
    expect(twinBar(levelled(run, 12), brand, ["sear"])).toEqual({ k: "locked", side: "mercy" });
    expect(lockWarning(run)).toBeNull();
  });
});

describe("twin cards", () => {
  const sapRay = TWINS.find((t) => t.twin === "sapRay")!;
  const sidestep = TWINS.find((t) => t.twin === "sidestep")!;

  it("open by level, then by their side of a meter", () => {
    const run = newRun("twins");
    expect(twinBar(run, sidestep, ["blink"])).toEqual({ k: "level", n: sidestep.level });
    expect(twinBar(levelled(run, sidestep.level), sidestep, ["blink"])).toBeNull();
    expect(twinBar(levelled(run, 12), sapRay, ["ray"])).toEqual({ k: "needs", side: "sap", n: ALIGN.mark });
    expect(twinBar({ ...levelled(run, 12), align: at(0, -ALIGN.mark) }, sapRay, ["ray"])).toBeNull();
    expect(twinBar(levelled(run, 12), TWINS.find((t) => t.twin === "sanctuary")!, ["ray"])).toEqual({ k: "job" });
  });

  it("swap in for battle only while open, and can't be picked while closed", () => {
    let run = levelled(newRun("twins-wear"), 12);
    expect(() => wearTwin(run, "ray", true)).toThrow();
    run = { ...run, align: at(0, -30) };
    run = wearTwin(run, "ray", true);
    expect(heroOf(run).abilities).toContain("sapRay");
    expect(heroOf(run).abilities).not.toContain("ray");
    // The meter swings back: the twin stays picked but the original fights until it is open again.
    expect(heroOf({ ...run, align: at(0, 0) }).abilities).toContain("ray");
    expect(heroOf(wearTwin(run, "ray", false)).abilities).toContain("ray");
  });

  it("Sap-fed cards cost the caster HP, never the last one", () => {
    const map = parseMap("flat", Array.from({ length: 5 }, () => "g0 g0 g0 g0 g0"));
    const u = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
      name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["sapRay"], ...o,
    });
    const setup: BattleSetup = { seed: 3, map, units: [u({ id: "h", team: "heroes", pos: { x: 2, y: 4 }, speed: 90 }), u({ id: "f", team: "foes", pos: { x: 2, y: 1 }, hp: 200 })] };
    let s = createBattle(setup);
    const r = applyCommand(s, { t: "cast", unit: "h", ability: "sapRay", target: { x: 2, y: 1 } });
    expect(r.ok).toBe(true);
    s = (r as { state: BattleState }).state;
    expect(unitById(s, "h").hp).toBe(40 - 3);
    unitById(s, "h").hp = 2;
    s = (applyCommand(s, { t: "cast", unit: "h", ability: "sapRay", target: { x: 2, y: 1 } }) as { state: BattleState }).state;
    expect(unitById(s, "h").hp).toBe(1);
  });
});

describe("the Sap pulls spared foes back", () => {
  it("only when the hero is Sap-touched", () => {
    const run = newRun("relapse");
    expect(relapses(run)).toBe(false);
    expect(relapses({ ...run, align: at(50, -19) })).toBe(false);
    expect(relapses({ ...run, align: at(50, -20) })).toBe(true);
  });
});

describe("old saves", () => {
  it("turn the Mercy points sparing counted into the Mercy meter", () => {
    const run = upgradeRun({ ...newRun("old"), mercy: 15 });
    expect(run.align).toEqual({ mercy: 15, purity: 0 });
    expect(run.mercy).toBeUndefined();
  });
});
