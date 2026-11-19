/* Run simulator: plays whole runs of the first region with the AI on both sides, always taking the first open
   node (or a rest when the hero is under half HP). Run with `npm run simulate:run [-- <runs> <easy|normal|hard>]`.
   Add `--log <file>` to write the runs as a play log (src/run/playlog.ts), the same format players export, so
   `npm run analyze -- <file>` can compare AI runs with real ones. */
import { writeFileSync } from "node:fs";
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle } from "../src/engine/state";
import type { Difficulty } from "../src/data/region";
import { logBattle, logBuy, logChoice, logNode, logRunEnd, logRunStart, logShopHeal, logShopLeave, simContext, type PlayEvent } from "../src/run/playlog";
import { buy, choose, enterNode, finishBattle, heroMaxHp, leaveShop, newRun, nextNodes, priceOf, shopHeal, type RunState } from "../src/run/run";

const args = process.argv.slice(2);
const logAt = args.indexOf("--log");
const logFile = logAt >= 0 ? args.splice(logAt, 2)[1] : undefined;
const runs = Number(args[0] ?? 100);
const difficulty = (args[1] ?? "normal") as Difficulty;
const ctx = simContext();
const log: PlayEvent[] = [];
const keep = (...e: (PlayEvent | null)[]) => { if (logFile) for (const x of e) if (x) log.push(x); };
let won = 0, levels = 0, nodes = 0, rivalsMet = 0, rivalsMade = 0;
const deaths = new Map<number, number>();
const started = Date.now();
for (let i = 1; i <= runs; i++) {
  let run = newRun(`sim-${i}`, difficulty);
  keep(logRunStart(ctx, run));
  while (!run.over) {
    run = answerOffers(run);
    const open = nextNodes(run);
    const pick = open.find((n) => n.kind === "recruit")
      ?? (run.heroHp < heroMaxHp(run) / 2 ? open.find((n) => n.kind === "rest") ?? open[0]! : open.find((n) => n.kind !== "rest") ?? open[0]!);
    if (pick.kind === "rival") rivalsMet++;
    keep(logNode(ctx, run, pick.id, open.map((n) => n.id)));
    run = enterNode(run, pick.id, "en");
    if (!run.battle) continue;
    let s = createBattle(run.battle.setup);
    while (!s.winner && s.turns < 300) {
      for (const c of planTurn(s)) {
        const r = applyCommand(s, c);
        if (!r.ok) throw new Error(`run ${i}: illegal AI command ${JSON.stringify(c)}: ${r.error}`);
        s = r.state; run.battle.commands.push(c);
      }
    }
    if (!s.winner) { run.over = "lost"; break; }
    const layer = run.map.nodes[run.battle.node]!.layer;
    const fought = run;
    run = finishBattle(run, s);
    if (logFile) keep(...logBattle(ctx, fought, fought.battle!, s, run));
    if (run.over === "lost") deaths.set(layer, (deaths.get(layer) ?? 0) + 1);
  }
  keep(logRunEnd(ctx, run, run.over === "won" ? "won" : "lost"));
  if (run.over === "won") won++;
  levels += run.hero.level;
  nodes += run.path.length;
  rivalsMade += run.rivals.length;
}
console.log(`${runs} ${difficulty} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`runs won ${won} (${((100 * won) / runs).toFixed(0)}%), average nodes cleared ${(nodes / runs).toFixed(1)}`);
console.log(`runs lost by layer: ${[...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(" ")}`);
console.log(`average hero level at the end ${(levels / runs).toFixed(1)}`);
console.log(`rivals made ${rivalsMade}, rival nodes entered ${rivalsMet}`);
if (logFile) { writeFileSync(logFile, JSON.stringify({ game: "tac-tics", log: 1, events: log })); console.log(`play log: ${log.length} events -> ${logFile}`); }

/** A simple player: takes the item reward (else the first), the first perk, buys what it can afford, heals if hurt. */
function answerOffers(run: RunState): RunState {
  while (run.offers.length) {
    const o = run.offers[0]!;
    if (o.kind === "perk" || o.kind === "talk") { keep(logChoice(ctx, run, 0)); run = choose(run, 0); }
    else if (o.kind === "reward") {
      const hurt = run.heroHp < heroMaxHp(run) * 0.4;
      const i = hurt ? o.options.findIndex((r) => r.t === "heal") : o.options.findIndex((r) => r.t === "item");
      keep(logChoice(ctx, run, Math.max(0, i)));
      run = choose(run, Math.max(0, i));
    } else if (o.kind === "shop") {
      if (run.heroHp < heroMaxHp(run) * 0.6) try { const b = run; run = shopHeal(run); keep(logShopHeal(ctx, b)); } catch { /* too poor */ }
      for (const id of o.stock) { const p = priceOf(id); if (run[p.currency] >= p.amount) { keep(logBuy(ctx, run, id)); run = buy(run, id); } }
      keep(logShopLeave(ctx, run));
      run = leaveShop(run);
    }
  }
  return run;
}
