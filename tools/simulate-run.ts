/* Run simulator: plays whole runs of the first region with the AI on both sides, always taking the first open
   node (or a rest when the hero is under half HP). Run with `npm run simulate:run [-- <runs> <easy|normal|hard>]`. */
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle } from "../src/engine/state";
import type { Difficulty } from "../src/data/region";
import { MAP_LAYERS } from "../src/run/map";
import { buy, choose, enterNode, finishBattle, heroMaxHp, leaveShop, newRun, nextNodes, priceOf, shopHeal, type RunState } from "../src/run/run";

const runs = Number(process.argv[2] ?? 100);
const difficulty = (process.argv[3] ?? "normal") as Difficulty;
let won = 0, levels = 0, nodes = 0, rivalsMet = 0, rivalsMade = 0, cleared1 = 0;
const deaths = new Map<number, number>();
const started = Date.now();
for (let i = 1; i <= runs; i++) {
  let run = newRun(`sim-${i}`, difficulty);
  while (!run.over) {
    run = answerOffers(run);
    const open = nextNodes(run);
    const pick = open.find((n) => n.kind === "recruit")
      ?? (run.heroHp < heroMaxHp(run) / 2 ? open.find((n) => n.kind === "rest") ?? open[0]! : open.find((n) => n.kind !== "rest") ?? open[0]!);
    if (pick.kind === "rival") rivalsMet++;
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
    const layer = run.map.nodes[run.battle.node]!.layer + 10 * run.region;
    run = finishBattle(run, s);
    if (run.over === "lost") deaths.set(layer, (deaths.get(layer) ?? 0) + 1);
  }
  if (run.over === "won") won++;
  if (run.region > 0 || run.over === "won") cleared1++;
  levels += run.hero.level;
  nodes += run.path.length + MAP_LAYERS * run.region;
  rivalsMade += run.rivals.length;
}
console.log(`${runs} ${difficulty} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`runs won ${won} (${((100 * won) / runs).toFixed(0)}%), average nodes cleared ${(nodes / runs).toFixed(1)}`);
console.log(`first region cleared ${cleared1} (${((100 * cleared1) / runs).toFixed(0)}%)`);
console.log(`runs lost by layer (region 2 adds 10): ${[...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(" ")}`);
console.log(`average hero level at the end ${(levels / runs).toFixed(1)}`);
console.log(`rivals made ${rivalsMade}, rival nodes entered ${rivalsMet}`);

/** A simple player: takes the item reward (else the first), the first perk, buys what it can afford, heals if hurt. */
function answerOffers(run: RunState): RunState {
  while (run.offers.length) {
    const o = run.offers[0]!;
    if (o.kind === "perk" || o.kind === "talk") run = choose(run, 0);
    else if (o.kind === "reward") {
      const hurt = run.heroHp < heroMaxHp(run) * 0.4;
      const i = hurt ? o.options.findIndex((r) => r.t === "heal") : o.options.findIndex((r) => r.t === "item");
      run = choose(run, Math.max(0, i));
    } else if (o.kind === "shop") {
      if (run.heroHp < heroMaxHp(run) * 0.6) try { run = shopHeal(run); } catch { /* too poor */ }
      for (const id of o.stock) { const p = priceOf(id); if (run[p.currency] >= p.amount) run = buy(run, id); }
      run = leaveShop(run);
    }
  }
  return run;
}
