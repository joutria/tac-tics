import { afterEach, describe, expect, it } from "vitest";
import { ABILITIES } from "../src/data/abilities";
import { abilityAvailable, damagePreview } from "../src/engine/combat";
import { parseMap } from "../src/engine/grid";
import { actionCost, manaCost, RULES, setRules } from "../src/engine/rules";
import { activeUnit, applyCommand, createBattle, type UnitSpec } from "../src/engine/state";

const flat = parseMap("flat", Array.from({ length: 6 }, () => Array(6).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 80, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray", "flare", "mend"], ...o,
});
const duel = () => createBattle({ seed: 1, map: flat, units: [unit({ id: "a", team: "heroes", pos: { x: 0, y: 0 }, speed: 60 }), unit({ id: "b", team: "foes", pos: { x: 0, y: 3 } })] });

afterEach(() => setRules({}));

describe("turn rules", () => {
  it("the game plays Move + Act by default", () => {
    expect(RULES.mode).toBe("act");
    expect(activeUnit(duel()).maxAp).toBe(1);
  });

  it("AP rules are still there, unchanged, for comparison", () => {
    setRules({ mode: "ap" });
    const s = duel();
    expect(activeUnit(s).maxAp).toBe(6);
    expect(activeUnit(s).maxMana).toBe(0);
    expect(manaCost(ABILITIES.flare!)).toBe(0);
    expect(actionCost(ABILITIES.flare!)).toBe(4);
  });

  it("act: one Act a turn, the basic attack is free of mana, spells cost it", () => {
    setRules({ mode: "act" });
    let s = duel();
    const a = activeUnit(s);
    expect(a.id).toBe("a");
    expect(a.maxAp).toBe(1);
    expect(a.mana).toBe(Math.min(RULES.mana.max, Math.round(RULES.mana.max * RULES.mana.start) + RULES.mana.regen));
    expect(manaCost(ABILITIES.ray!)).toBe(0);
    expect(manaCost(ABILITIES.flare!)).toBe(12);
    const r = applyCommand(s, { t: "cast", unit: "a", ability: "ray", target: { x: 0, y: 3 } });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    // The Act is spent, but the Move is still there (move after acting, FFTA style).
    expect(abilityAvailable(activeUnit(s), "ray")).toBe("not enough AP");
    expect(applyCommand(s, { t: "move", unit: "a", to: { x: 1, y: 0 } }).ok).toBe(true);
  });

  it("act: a spell needs the mana, and mana comes back each turn", () => {
    setRules({ mode: "act", mana: { max: 20, start: 0, regen: 5 } });
    let s = duel();
    expect(activeUnit(s).mana).toBe(5);
    expect(abilityAvailable(activeUnit(s), "flare")).toBe("not enough mana");
    expect(abilityAvailable(activeUnit(s), "ray")).toBeNull();
    const r = applyCommand(s, { t: "endTurn", unit: "a" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(activeUnit(s).id).toBe("b");
    expect(activeUnit(s).mana).toBe(5);
  });

  it("scale party and foe damage separately", () => {
    setRules({ mode: "ap" });
    const s0 = duel();
    const base = damagePreview(s0, s0.units[0]!, s0.units[1]!, ABILITIES.ray!).max;
    setRules({ mode: "act", damage: 2, foeDamage: 1.5 });
    const s = duel();
    const hero = s.units.find((u) => u.id === "a")!, foe = s.units.find((u) => u.id === "b")!;
    expect(damagePreview(s, hero, foe, ABILITIES.ray!).max).toBe(Math.floor(9 * 2));
    expect(damagePreview(s, foe, hero, ABILITIES.ray!).max).toBe(Math.floor(9 * 1.5));
    expect(base).toBe(9);
  });

  it("pips: light cards take one pip, heavy ones both", () => {
    setRules({ mode: "pips" });
    expect(actionCost(ABILITIES.ray!)).toBe(1);
    expect(actionCost(ABILITIES.flare!)).toBe(2);
    expect(activeUnit(duel()).maxAp).toBe(2);
  });
});

describe("mana per character", () => {
  it("a unit's own pool and extra regen (the Broken Hourglass) are used", () => {
    const s = createBattle({ seed: 1, map: flat, units: [unit({ id: "a", team: "heroes", pos: { x: 0, y: 0 }, speed: 60, mana: 26, regen: 2 }), unit({ id: "b", team: "foes", pos: { x: 0, y: 3 } })] });
    const a = activeUnit(s);
    expect(a.maxMana).toBe(26);
    expect(a.mana).toBe(13 + RULES.mana.regen + 2);
  });
});
