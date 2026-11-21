/* Run simulator: plays whole runs of the first region with the AI on both sides, always taking the first open
   node (or a rest when the hero is under half HP). Run with `npm run simulate:run [-- <runs> <easy|normal|hard>]`.
   Add `--log <file>` to write the runs as a play log (src/run/playlog.ts), the same format players export, so
   `npm run analyze -- <file>` can compare AI runs with real ones. Add `--mercy` for a party that spares every
   yielding foe it can (in the fight and after the win) instead of finishing them, to compare the two.
   Add `--party <temper>` to have the party play boldly (see ai.ts TEMPERS). */
import { PaceStats } from "./battle-stats";
import { writeFileSync } from "node:fs";
import { planTurn } from "../src/engine/ai";
import { activeUnit, applyCommand, createBattle, unsettled, type Temper } from "../src/engine/state";
import type { Difficulty } from "../src/data/region";
import { MAP_LAYERS } from "../src/run/map";
import { endingOf } from "../src/run/party";
import { alignmentOf, alignOf } from "../src/run/alignment";
import { logBattle, logBuy, logChoice, logNode, logRunEnd, logRunStart, logShopHeal, logShopLeave, simContext, type PlayEvent } from "../src/run/playlog";
import { buy, choose, enterNode, finishBattle, heroMaxHp, leaveShop, newRun, nextNodes, priceIn, shopHeal, type RunState } from "../src/run/run";

const args = process.argv.slice(2);
const logAt = args.indexOf("--log");
const logFile = logAt >= 0 ? args.splice(logAt, 2)[1] : undefined;
const mercyAt = args.indexOf("--mercy");
const mercy = mercyAt >= 0 && !!args.splice(mercyAt, 1).length;
// `--party bold|flanker|steady|wary`: the party plays with that temper instead of the careful default, to check
// that walking up and fighting pays off rather than only camping.
const partyAt = args.indexOf("--party");
const partyTemper = partyAt >= 0 ? (args.splice(partyAt, 2)[1] as Temper) : undefined;
const runs = Number(args[0] ?? 100);
const difficulty = (args[1] ?? "normal") as Difficulty;
const ctx = simContext();
const log: PlayEvent[] = [];
const keep = (...e: (PlayEvent | null)[]) => { if (logFile) for (const x of e) if (x) log.push(x); };
let won = 0, levels = 0, nodes = 0, rivalsMet = 0, rivalsMade = 0, cleared1 = 0, sparedAll = 0, helped = 0;
const deaths = new Map<number, number>();
const endings = new Map<string, number>();
const alignments = new Map<string, number>();
const started = Date.now();
const pace = new PaceStats();
for (let i = 1; i <= runs; i++) {
  let run = newRun(`sim-${i}`, difficulty);
  keep(logRunStart(ctx, run));
  while (!run.over) {
    run = answerOffers(run);
    const open = nextNodes(run);
    const pick = open.find((n) => n.kind === "recruit" || n.kind === "quest")
      ?? (run.heroHp < heroMaxHp(run) / 2 ? open.find((n) => n.kind === "rest") ?? open[0]! : open.find((n) => n.kind !== "rest") ?? open[0]!);
    if (pick.kind === "rival") rivalsMet++;
    keep(logNode(ctx, run, pick.id, open.map((n) => n.id)));
    run = enterNode(run, pick.id, "en");
    if (!run.battle) continue;
    const setup = partyTemper ? { ...run.battle.setup, units: run.battle.setup.units.map((u) => (u.team === "heroes" ? { ...u, temper: partyTemper } : u)) } : run.battle.setup;
    let s = createBattle(setup);
    pace.start();
    while (!s.winner && s.turns < 300) {
      const before = s, cmds = planTurn(s, { mercy: mercy && activeUnit(s).team === "heroes" });
      for (const c of cmds) {
        const r = applyCommand(s, c);
        if (!r.ok) throw new Error(`run ${i}: illegal AI command ${JSON.stringify(c)}: ${r.error}`);
        s = r.state; run.battle.commands.push(c);
      }
      pace.turn(before, cmds, s);
    }
    pace.end(s);
    if (!s.winner) { run.over = "lost"; break; }
    for (const u of mercy ? unsettled(s) : []) {
      const c = { t: "settle" as const, unit: u.id, choice: "spare" as const };
      const r = applyCommand(s, c);
      if (r.ok) { s = r.state; run.battle.commands.push(c); }
    }
    const layer = run.map.nodes[run.battle.node]!.layer + 10 * run.region;
    const fought = run;
    run = finishBattle(run, s);
    if (logFile) keep(...logBattle(ctx, fought, fought.battle!, s, run));
    if (run.over === "lost") deaths.set(layer, (deaths.get(layer) ?? 0) + 1);
  }
  keep(logRunEnd(ctx, run, run.over === "won" ? "won" : "lost"));
  if (run.over === "won") won++;
  if (run.region > 0 || run.over === "won") cleared1++;
  levels += run.hero.level;
  nodes += run.path.length + MAP_LAYERS * run.region;
  rivalsMade += run.rivals.length;
  sparedAll += run.spared?.length ?? 0;
  helped += run.spared?.filter((f) => f.helped).length ?? 0;
  { const k = alignmentOf(alignOf(run)); alignments.set(k, (alignments.get(k) ?? 0) + 1); }
  for (const m of run.party) { const k = `${m.id} ${endingOf(m)}`; endings.set(k, (endings.get(k) ?? 0) + 1); }
}
console.log(`${runs} ${difficulty}${mercy ? " mercy" : ""} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`runs won ${won} (${((100 * won) / runs).toFixed(0)}%), average nodes cleared ${(nodes / runs).toFixed(1)}`);
console.log(`first region cleared ${cleared1} (${((100 * cleared1) / runs).toFixed(0)}%)`);
console.log(`runs lost by layer (region 2 adds 10): ${[...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(" ")}`);
console.log(`average hero level at the end ${(levels / runs).toFixed(1)}`);
console.log(`rivals made ${rivalsMade}, rival nodes entered ${rivalsMet}`);
console.log(`foes spared ${sparedAll}, came back to help ${helped}`);
console.log(pace.report());
console.log(`hero alignment at the end: ${[...alignments.entries()].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`endings: ${[...endings.entries()].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
if (logFile) { writeFileSync(logFile, JSON.stringify({ game: "tac-tics", log: 1, events: log })); console.log(`play log: ${log.length} events -> ${logFile}`); }

/** A simple player: takes the item reward (else the first), the first perk, burns shards at the fire only when badly hurt, buys what it can afford, heals if hurt. */
function answerOffers(run: RunState): RunState {
  while (run.offers.length) {
    const o = run.offers[0]!;
    if (o.kind === "perk" || o.kind === "talk" || o.kind === "quest" || o.kind === "job") { keep(logChoice(ctx, run, 0)); run = choose(run, 0); }
    else if (o.kind === "altar") { const i = run.heroHp < heroMaxHp(run) * 0.5 ? 0 : 1; keep(logChoice(ctx, run, i)); run = choose(run, i); }
    else if (o.kind === "reward") {
      const hurt = run.heroHp < heroMaxHp(run) * 0.4;
      const i = hurt ? o.options.findIndex((r) => r.t === "heal") : o.options.findIndex((r) => r.t === "item");
      keep(logChoice(ctx, run, Math.max(0, i)));
      run = choose(run, Math.max(0, i));
    } else if (o.kind === "shop") {
      if (run.heroHp < heroMaxHp(run) * 0.6) try { const b = run; run = shopHeal(run); keep(logShopHeal(ctx, b)); } catch { /* too poor */ }
      for (const id of o.stock) { const p = priceIn(run, id); if (run[p.currency] >= p.amount) { keep(logBuy(ctx, run, id)); run = buy(run, id); } }
      keep(logShopLeave(ctx, run));
      run = leaveShop(run);
    }
  }
  return run;
}
