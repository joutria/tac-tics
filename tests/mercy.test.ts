/* Sparing and mercy: the white flag, Spare, Hold back, the choice after a win, and what sparing pays. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planTurn } from "../src/engine/ai";
import { castProblem, unitAbilities } from "../src/engine/combat";
import { cowering, yielding } from "../src/engine/escape";
import { parseMap } from "../src/engine/grid";
import { activeUnit, applyCommand, createBattle, unitById, unsettled, type BattleSetup, type BattleState, type Command, type UnitSpec } from "../src/engine/state";
import { COMPANIONS } from "../src/data/companions";
import { MERCY } from "../src/data/mercy";
import { ALIGN } from "../src/data/alignment";
import { ITEMS } from "../src/data/gear";
import { newMember, react, readDeeds } from "../src/run/party";
import { activeRivals, afterBattle } from "../src/run/rivals";
import { battleSetup, choose, enterNode, finishBattle, helpAt, newRun, nextNodes, priceIn, priceOf, type RunState } from "../src/run/run";
import { setRules } from "../src/engine/rules";

// These tests pin exact numbers and several casts a turn, written for the AP turn; the Move + Act rules the
// game plays by are covered in rules.test.ts.
beforeAll(() => setRules({ mode: "ap" }));
afterAll(() => setRules({}));

const flat = (rows = 7, cols = 7) => parseMap("flat", Array.from({ length: rows }, () => Array(cols).fill("g0").join(" ")));
const unit = (o: Partial<UnitSpec> & Pick<UnitSpec, "id" | "team" | "pos">): UnitSpec => ({
  name: o.id, element: "neutral", look: "lumo", hp: 40, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 0, agi: 10, res: {}, abilities: ["ray"], ...o,
});
function play(s: BattleState, cmds: Command[]): BattleState {
  for (const c of cmds) { const r = applyCommand(s, c); if (!r.ok) throw new Error(`${c.t}: ${r.error}`); s = r.state; }
  return s;
}
/** The hero (fast, acts first) against foes `f` (and `g`). */
const field = (foes: Partial<UnitSpec>[] = [{}], hero: Partial<UnitSpec> = {}): BattleSetup => ({
  seed: 7, map: flat(),
  units: [
    unit({ id: "h", team: "heroes", pos: { x: 3, y: 5 }, speed: 90, mag: 40, ...hero }),
    ...foes.map((f, i) => unit({ id: i ? "g" : "f", team: "foes", pos: { x: 3 - i * 2, y: 3 }, ...f })),
  ],
});

describe("yielding", () => {
  it("shows the white flag under 25% HP or while fleeing, never on bosses or the party", () => {
    const s = createBattle(field([{}, { heavy: true }]));
    const f = unitById(s, "f"), g = unitById(s, "g"), h = unitById(s, "h");
    expect(yielding(f)).toBe(false);
    f.hp = 9; g.hp = 1; h.hp = 1;
    expect(yielding(f)).toBe(true);
    expect(yielding(g)).toBe(false);
    expect(yielding(h)).toBe(false);
    f.hp = 30; f.escape = "flee";
    expect(yielding(f)).toBe(true);
    expect(cowering(f)).toBe(false); // running, not giving up
  });

  it("a yielding foe that is not Savia-marked stops fighting; the last one standing hands the party the win", () => {
    let s = createBattle(field([{}, {}]));
    unitById(s, "f").hp = 5;
    // The other foe still fights: no winner yet.
    s = play(s, [{ t: "endTurn", unit: "h" }]);
    expect(s.winner).toBeNull();
    if (activeUnit(s).id === "f") expect(planTurn(s)).toEqual([{ t: "endTurn", unit: "f" }]);
    const g = unitById(s, "g");
    g.hp = 3;
    // Any command re-checks the winner: both foes now cower.
    const r = applyCommand(s, { t: "endTurn", unit: activeUnit(s).id });
    expect(r.ok && r.state.winner).toBe("heroes");
    if (r.ok) expect(unsettled(r.state).map((u) => u.id).sort()).toEqual(["f", "g"]);
  });

  it("a Savia-marked foe under the flag keeps the battle going (it may still run and become a rival)", () => {
    let s = createBattle(field([{ marked: true }]));
    unitById(s, "f").hp = 5;
    s = play(s, [{ t: "endTurn", unit: "h" }]);
    expect(yielding(unitById(s, "f"))).toBe(true);
    expect(s.winner).toBeNull();
  });
});

describe("Spare", () => {
  it("costs 1 AP, reaches 1 to 2 tiles, needs a yielding foe, and is the party's alone", () => {
    const s = createBattle(field([{ marked: true }]));
    const h = unitById(s, "h"), f = unitById(s, "f");
    expect(unitAbilities(h)).toContain("spare");
    expect(unitAbilities(f)).not.toContain("spare");
    expect(castProblem(s, h, "spare", f.pos)).toBe("needs a yielding foe");
    f.hp = 5;
    expect(castProblem(s, h, "spare", f.pos)).toBeNull(); // 2 tiles away
    h.pos = { x: 3, y: 6 };
    expect(castProblem(s, h, "spare", f.pos)).toBe("out of range");
  });

  it("makes the foe kneel and leave: spared, out of the fight, and the battle ends once nobody is left", () => {
    const s = createBattle(field([{ marked: true }]));
    unitById(s, "f").hp = 5;
    const r = applyCommand(s, { t: "cast", unit: "h", ability: "spare", target: { x: 3, y: 3 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(unitById(r.state, "f").life).toBe("spared");
    expect(r.events.some((e) => e.e === "spared" && e.unit === "f")).toBe(true);
    expect(unitById(r.state, "h").ap).toBe(5);
    expect(r.state.winner).toBe("heroes");
    expect(unsettled(r.state)).toHaveLength(0);
  });

  it("a spared foe never becomes a rival, and a rival spared is settled for good", () => {
    const setup = field([{ marked: true, hpNow: 5 }]);
    const s = createBattle(setup);
    const cmds: Command[] = [{ t: "cast", unit: "h", ability: "spare", target: { x: 3, y: 3 } }];
    const end = play(s, cmds);
    expect(afterBattle([], setup, cmds, end)).toEqual([]);
    // An escaped foe still becomes one; sparing it the next time settles it.
    const ran = structuredClone(createBattle(setup)); unitById(ran, "f").life = "escaped"; ran.winner = "heroes";
    const rivals = afterBattle([], setup, [], ran);
    expect(rivals).toHaveLength(1);
    const after = afterBattle(rivals, setup, cmds, end);
    expect(after[0]!.settled).toBe("spared");
    expect(activeRivals(after)).toHaveLength(0);
  });
});

describe("Hold back", () => {
  it("stops a hit that would down the foe at 1 HP, leaving it yielding", () => {
    const s = createBattle(field());
    unitById(s, "f").hp = 3;
    const plain = applyCommand(s, { t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 3 } });
    expect(plain.ok && unitById(plain.state, "f").life).toBe("downed");
    const held = applyCommand(s, { t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 3 }, hold: true });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const f = unitById(held.state, "f");
    expect(f.life).toBe("up");
    expect(f.hp).toBe(1);
    expect(yielding(f)).toBe(true);
    const ev = held.events.find((e) => e.e === "cast");
    expect(ev && ev.e === "cast" && ev.hits[0]!.held && ev.hits[0]!.damage).toBe(2);
    expect(held.state.units.every((u) => u.held === undefined)).toBe(true);
  });

  it("never finishes a downed foe", () => {
    const s = createBattle(field([{}, {}]));
    const f = unitById(s, "f"); f.life = "downed"; f.hp = 0; f.downedTurns = 2;
    const r = applyCommand(s, { t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 3 }, hold: true });
    expect(r.ok && unitById(r.state, "f").life).toBe("downed");
  });
});

describe("after a win", () => {
  /** Won with f downed and g yielding (cowering). */
  const opening: Command[] = [{ t: "cast", unit: "h", ability: "ray", target: { x: 3, y: 3 } }];
  const won = () => {
    // f starts at 25% (not yet yielding) and the ray downs it; g starts under the flag.
    const setup = field([{ hpNow: 10 }, { hpNow: 2 }], { mag: 100 });
    const s = play(createBattle(setup), opening);
    return { setup, s };
  };

  it("each downed or yielding foe is spared or finished; nothing else can be done", () => {
    const { s } = won();
    expect(s.winner).toBe("heroes");
    expect(applyCommand(s, { t: "endTurn", unit: activeUnit(s).id }).ok).toBe(false);
    expect(applyCommand(s, { t: "settle", unit: "h", choice: "finish" }).ok).toBe(false);
    const a = play(s, [{ t: "settle", unit: "f", choice: "finish" }, { t: "settle", unit: "g", choice: "spare" }]);
    expect(unitById(a, "f").life).toBe("dead");
    expect(unitById(a, "g").life).toBe("spared");
    expect(unsettled(a)).toHaveLength(0);
    expect(applyCommand(a, { t: "settle", unit: "g", choice: "finish" }).ok).toBe(false);
  });

  it("can't be settled before the battle is won", () => {
    const s = createBattle(field());
    unitById(s, "f").hp = 2;
    expect(applyCommand(createBattle(field([{}, {}])), { t: "settle", unit: "f", choice: "spare" }).ok).toBe(false);
  });

  it("companions see it: Remanso likes sparing and dislikes finishing a yielding foe", () => {
    const { setup, s } = won();
    const cmds = opening;
    const spare = readDeeds(setup, [...cmds, { t: "settle", unit: "f", choice: "spare" }, { t: "settle", unit: "g", choice: "spare" }]);
    expect(spare.spare).toBe(2);
    const finish = readDeeds(setup, [...cmds, { t: "settle", unit: "f", choice: "finish" }, { t: "settle", unit: "g", choice: "finish" }]);
    expect(finish.finishDowned).toBe(1);
    expect(finish.finishYielding).toBe(1);
    const m = newMember("remanso", 0, false);
    expect(react(m, spare).member.approval).toBeGreaterThan(m.approval);
    expect(react(m, finish).member.approval).toBe(m.approval + COMPANIONS.remanso!.reacts.finishDowned! + COMPANIONS.remanso!.reacts.finishYielding!);
    expect(s.winner).toBe("heroes");
  });
});

/** Enters the first battle of a run and wins it with every foe spared. */
function winSparing(run: RunState): RunState {
  const node = nextNodes(run).find((n) => n.kind === "battle")!;
  run = enterNode(run, node.id, "en");
  // Foes that start beaten (1 HP, not Savia-marked): they all cower, and the first command hands the party the win.
  for (const u of run.battle!.setup.units) if (u.team === "foes") { u.hpNow = 1; delete u.marked; }
  let s = createBattle(run.battle!.setup);
  const first: Command = { t: "endTurn", unit: activeUnit(s).id };
  s = applyCommand(s, first).ok ? (applyCommand(s, first) as { state: BattleState }).state : s;
  run.battle!.commands.push(first);
  for (const u of unsettled(s)) {
    const c: Command = { t: "settle", unit: u.id, choice: "spare" };
    const r = applyCommand(s, c);
    if (!r.ok) throw new Error(r.error);
    s = r.state; run.battle!.commands.push(c);
  }
  return finishBattle(run, s);
}

describe("what mercy pays", () => {
  it("now: each spared foe hands over a gift before the usual reward, and counts towards Mercy", () => {
    const before = newRun("mercy-1");
    const run = winSparing(before);
    const n = run.spared!.length;
    expect(n).toBeGreaterThan(0);
    expect(run.align!.mercy).toBe(Math.min(ALIGN.perFight, n * MERCY.perSpare));
    const gifts = run.offers.filter((o) => o.kind === "reward" && o.gift);
    expect(gifts).toHaveLength(n);
    expect(run.offers.at(-1)!.kind === "reward" && !(run.offers.at(-1) as { gift?: string }).gift).toBe(true);
    expect(run.rivals).toHaveLength(0);
    const shards = run.shards;
    const i = run.offers.findIndex((o) => o.kind === "reward");
    const pick = (run.offers[i] as { options: { t: string }[] }).options.findIndex((o) => o.t === "shards");
    expect(choose(run, pick).shards).toBe(shards + MERCY.giftShards);
  });

  it("later: a spared foe comes back once to help, fighting beside the party, warning of an ambush, or selling cheap", () => {
    // Find a run where a spared foe helps at the next fight.
    for (let i = 0; i < 60; i++) {
      let run = winSparing(newRun(`mercy-help-${i}`));
      while (run.offers.length) run = choose(run, 0);
      const node = nextNodes(run).find((n) => helpAt(run, n));
      if (!node) continue;
      const help = helpAt(run, node)!;
      const entered = enterNode(run, node.id, "en");
      expect(entered.help).toEqual(help);
      expect(entered.spared!.find((f) => f.id === help.foe)!.helped).toBe(true);
      if (help.kind === "join") {
        const ally = entered.battle!.setup.units.find((u) => u.id === `ally-${help.foe}`)!;
        expect(ally.team).toBe("heroes");
        expect(ally.marked).toBeUndefined();
        createBattle(entered.battle!.setup); // a legal battle: unique ids, standable tiles
      }
      if (help.kind === "warn") expect(entered.battle!.setup.ambush).toBeUndefined();
      if (help.kind === "discount") {
        const shop = entered.offers[0]!;
        expect(shop.kind === "shop" && shop.discount).toBeTruthy();
        const id = Object.keys(ITEMS)[0]!;
        expect(priceIn(entered, id).amount).toBe(Math.max(1, Math.round(priceOf(id).amount * (1 - MERCY.discount))));
      }
      // Each spared foe helps once.
      expect(helpAt({ ...entered, spared: entered.spared!.filter((f) => f.helped) }, node)).toBeUndefined();
      // Deterministic: the same run and node give the same setup.
      expect(battleSetup(entered, node.id, "en")).toEqual(battleSetup(entered, node.id, "en"));
      return;
    }
    throw new Error("no spared foe came back in 60 runs");
  });
});
