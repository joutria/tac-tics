/* M4: Sap tiers, harder steps on top of Hard, opened one at a time by winning. */
import { describe, expect, it } from "vitest";
import { DIFFICULTY, rulesFor, SAP_TIERS } from "../src/data/region";
import { closeRun, newLegacy } from "../src/run/legacy";
import { newRun, rulesOf } from "../src/run/run";

describe("Sap tiers", () => {
  it("each tier keeps the twists below it and adds its own, only on Hard", () => {
    expect(rulesFor("hard", 0)).toEqual(DIFFICULTY.hard);
    expect(rulesFor("normal", 3)).toEqual(DIFFICULTY.normal);
    const t2 = rulesFor("hard", 2);
    expect(t2.healBonus).toBeCloseTo(DIFFICULTY.hard.healBonus + SAP_TIERS[0]!.add.healBonus!);
    expect(t2.foeStat).toBe(DIFFICULTY.hard.foeStat + SAP_TIERS[1]!.add.foeStat!);
    expect(t2.coins).toBe(DIFFICULTY.hard.coins);
    expect(rulesFor("hard", SAP_TIERS.length).rivalLevel).toBe(1);
  });

  it("a run takes its tier only on Hard, capped at the last one", () => {
    expect(newRun("a", "hard", undefined, undefined, { tier: 2 }).tier).toBe(2);
    expect(newRun("b", "normal", undefined, undefined, { tier: 2 }).tier).toBeUndefined();
    const top = newRun("c", "hard", undefined, undefined, { tier: 99 });
    expect(top.tier).toBe(SAP_TIERS.length);
    expect(rulesOf(top)).toEqual(rulesFor("hard", SAP_TIERS.length));
  });

  it("winning Hard at the highest open tier opens the next; lower tiers, losses and Normal open nothing", () => {
    const won = (seed: string, d: "normal" | "hard", tier?: number) => ({ ...newRun(seed, d, undefined, undefined, { tier }), over: "won" as const });
    let l = closeRun(newLegacy(), won("n", "normal"));
    expect(l.tiers).toBeUndefined();
    l = closeRun(l, { ...newRun("lost", "hard"), over: "lost" });
    expect(l.tiers).toBeUndefined();
    l = closeRun(l, won("h0", "hard"));
    expect(l.tiers).toBe(1);
    l = closeRun(l, won("h1", "hard", 1));
    expect(l.tiers).toBe(2);
    l = closeRun(l, won("h1b", "hard", 1));
    expect(l.tiers).toBe(2);
    for (let i = 2; i <= SAP_TIERS.length + 1; i++) l = closeRun(l, won(`h${i}`, "hard", i));
    expect(l.tiers).toBe(SAP_TIERS.length);
  });
});
