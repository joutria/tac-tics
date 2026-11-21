import { describe, expect, it } from "vitest";
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle, type BattleState } from "../src/engine/state";
import { appendCapped, logBattle, logChoice, logNode, logRunEnd, logRunStart, simContext, summarize, type PlayEvent } from "../src/run/playlog";
import { choose, enterNode, finishBattle, leaveShop, newRun, nextNodes, type RunState } from "../src/run/run";

/** Plays one battle of the run with the AI on both sides, keeping the commands in the run's battle save. */
function fight(run: RunState): BattleState {
  let s = createBattle(run.battle!.setup);
  while (!s.winner && s.turns < 300) for (const c of planTurn(s)) { const r = applyCommand(s, c); if (!r.ok) throw new Error(r.error); s = r.state; run.battle!.commands.push(c); }
  return s;
}

/** A whole AI run, logged the way the game logs it. */
function loggedRun(seed: string): { run: RunState; log: PlayEvent[] } {
  const ctx = simContext();
  let run = newRun(seed);
  const log: PlayEvent[] = [logRunStart(ctx, run)];
  while (!run.over) {
    while (run.offers.length) {
      if (run.offers[0]!.kind === "shop") { run = leaveShop(run); continue; }
      const e = logChoice(ctx, run, 0); if (e) log.push(e);
      run = choose(run, 0);
    }
    const open = nextNodes(run);
    log.push(logNode(ctx, run, open[0]!.id, open.map((n) => n.id)));
    run = enterNode(run, open[0]!.id, "en");
    if (!run.battle) continue;
    const s = fight(run), fought = run;
    // A stalemate (no winner within the turn limit) ends the run, as in the simulator.
    if (!s.winner) { run = { ...run, over: "lost" }; break; }
    run = finishBattle(run, s);
    log.push(...logBattle(ctx, fought, fought.battle!, s, run));
  }
  log.push(logRunEnd(ctx, run, run.over ?? "lost"));
  return { run, log };
}

describe("play log", () => {
  it("records a run from start to end, the same every time for the same seed", () => {
    const a = loggedRun("log-1"), b = loggedRun("log-1");
    expect(a.log).toEqual(b.log);
    expect(a.log[0]!.ev).toBe("runStart");
    const end = a.log.at(-1)!;
    expect(end.ev === "runEnd" && end.result).toBe(a.run.over);
    // Every battle fought shows up once, and the run's nodes match the node events.
    const battles = a.log.filter((e) => e.ev === "battle");
    expect(battles.length).toBeGreaterThan(0);
    expect(a.log.filter((e) => e.ev === "node").length).toBeGreaterThanOrEqual(a.run.path.length);
    for (const e of battles) if (e.ev === "battle") {
      expect(e.turns).toBeGreaterThan(0);
      expect(e.commands).toBeGreaterThan(0);
      // An ambush can end a lost battle before the party gets a turn, so only wins must show abilities used.
      if (e.result === "won") expect(Object.values(e.abilities).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    }
    // Plain JSON: survives a round trip unchanged.
    expect(JSON.parse(JSON.stringify(a.log))).toEqual(a.log);
  });

  it("summarizes runs, picks and where runs were lost", () => {
    const logs = ["log-1", "log-2", "log-3", "log-4"].map(loggedRun);
    const s = summarize(logs.flatMap((l) => l.log));
    expect(s.runs).toBe(4);
    expect(s.byDifficulty.normal!.won + s.byDifficulty.normal!.lost).toBe(4);
    expect(s.byDifficulty.normal!.won).toBe(logs.filter((l) => l.run.over === "won").length);
    const lost = Object.values(s.lostAt).reduce((a, b) => a + b, 0);
    expect(lost).toBe(logs.filter((l) => l.run.over === "lost").length);
    expect(s.battles).toBe(logs.flatMap((l) => l.log).filter((e) => e.ev === "battle").length);
    for (const [picked, offered] of Object.values(s.rewards)) expect(picked).toBeLessThanOrEqual(offered);
  });

  it("skips what is not a choice, and keeps only the newest events past the cap", () => {
    const run = newRun("x");
    expect(logChoice(simContext(), run, 0)).toBeNull();
    const shop: RunState = { ...run, offers: [{ kind: "shop", stock: [] }] };
    expect(logChoice(simContext(), shop, 0)).toBeNull();
    const ctx = simContext();
    const many = Array.from({ length: 12 }, () => logRunStart(ctx, run));
    const kept = appendCapped(many.slice(0, 8), many.slice(8), 10);
    expect(kept).toHaveLength(10);
    expect(kept.at(-1)).toBe(many.at(-1));
    expect(kept[0]).toBe(many[2]);
  });
});
