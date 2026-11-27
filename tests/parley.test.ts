import { describe, expect, it } from "vitest";
import { parley, voiceOf } from "../src/run/parley";
import { battleSetup, isAmbush, newRun } from "../src/run/run";
import { approachScene, MARCH_STEPS } from "../src/run/travel";
import { standable, tileAt } from "../src/engine/grid";
import type { BattleSetup, UnitSpec } from "../src/engine/state";
import { rivalSpec, type Rival } from "../src/run/rivals";

const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "look">): UnitSpec => ({
  name: o.id, element: "neutral", pos: { x: 0, y: 0 }, hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 6, mag: 6, agi: 10, res: {}, abilities: ["ray"], ...o,
});
const setupOf = (units: UnitSpec[], extra: Partial<BattleSetup> = {}): BattleSetup =>
  ({ seed: "s", map: { id: "m", w: 1, h: 1, tiles: [] } as never, units, ...extra });
const hero = unit({ id: "hero", name: "Hero", team: "heroes", look: "lumo" });

describe("words before a fight", () => {
  it("beasts stay silent", () => {
    expect(parley(setupOf([hero, unit({ id: "f", team: "foes", look: "chisporro" })]), { lang: "es" })).toEqual([]);
  });

  it("people talk first and the hero answers last", () => {
    const lines = parley(setupOf([hero, unit({ id: "f", name: "Brasa", team: "foes", look: "brasa" }), unit({ id: "g", team: "foes", look: "canin" })]), { lang: "es" });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toMatchObject({ unit: "f", side: "foes", name: "Brasa" });
    expect(lines.find((l) => l.unit === "hero")).toBeTruthy();
    expect(lines.every((l) => l.text && !l.text.includes("{"))).toBe(true);
  });

  it("is the same every time for the same battle", () => {
    const s = setupOf([hero, unit({ id: "f", team: "foes", look: "trasgo" }), unit({ id: "g", team: "foes", look: "trasgo-chaman" })]);
    expect(parley(s, { lang: "en" })).toEqual(parley(s, { lang: "en" }));
  });

  it("the brute leads over the others, and a survivor cries out on a protect goal", () => {
    const ward = unit({ id: "w", name: "Aldeano herido", team: "heroes", look: "aldeano", ward: true });
    const lines = parley(setupOf([hero, ward, unit({ id: "a", team: "foes", look: "brasa" }), unit({ id: "b", team: "foes", look: "ogro", size: 2 })], { goal: { kind: "protect", ward: "w" } }), { lang: "es" });
    expect(lines[0]!.unit).toBe("b");
    expect(lines.some((l) => l.unit === "w")).toBe(true);
    const reply = lines.find((l) => l.unit === "hero")!;
    expect(reply.text).not.toMatch(/\{/);
  });

  it("a rival speaks its taunt without its name inside the words", () => {
    const base = unit({ id: "r1", name: "Cañín", team: "foes", look: "canin", marked: true });
    const r: Rival = { id: "r1", base, epithet: 0, cause: { kind: "escaped", hero: "Hero" }, level: 2, meetings: 1, memory: [], counters: [] };
    const lines = parley(setupOf([hero, rivalSpec(r, "es")]), { lang: "es", rivals: [r] });
    expect(lines[0]!.unit).toBe("r1");
    expect(lines[0]!.text.startsWith("«")).toBe(false);
    expect(lines[0]!.text).not.toContain(":");
  });

  it("a courier on a catch goal speaks even among beasts", () => {
    const courier = unit({ id: "c", team: "foes", look: "ratero", runner: true });
    expect(voiceOf(courier)).toBe("courier");
    const lines = parley(setupOf([hero, courier, unit({ id: "f", team: "foes", look: "canin" })], { goal: { kind: "catch", runner: "c" } }), { lang: "en" });
    expect(lines.map((l) => l.unit)).toEqual(expect.arrayContaining(["c", "hero"]));
  });
});

describe("foes march onto the field", () => {
  it("each foe of a plain fight walks a few open tiles to its spot; an ambush has no march", () => {
    let checked = 0, misses = 0;
    for (let i = 0; i < 12; i++) {
      const run = newRun(`march-${i}`);
      for (const node of run.map.nodes.filter((n) => n.kind === "battle" || n.kind === "elite")) {
      const b = battleSetup(run, node.id, "es");
      const heroes = b.units.filter((u) => u.team === "heroes" && !u.ward), foes = b.units.filter((u) => u.team === "foes" || u.ward);
      const scene = approachScene(`m${i}`, "town", node.col, { t: "fight", arena: b.map, party: heroes.map((u) => u.pos), foes: foes.map((u) => u.pos), ambush: !!b.ambush }, heroes.length);
      if (b.ambush || isAmbush(run, node)) { expect(scene.foePaths).toBeUndefined(); continue; }
      expect(scene.foePaths).toHaveLength(foes.length);
      scene.foePaths!.forEach((path, k) => {
        expect(path.at(-1)).toEqual(foes[k]!.pos);
        expect(path.length).toBeLessThanOrEqual(MARCH_STEPS + 4);
        for (const p of path.slice(0, -1)) expect(standable(tileAt(scene.map, p))).toBe(true);
      });
      if (scene.foePaths!.some((p) => p.length > 1)) checked++; else misses++;
      }
    }
    expect(checked).toBeGreaterThan(misses * 4);
  });
});
