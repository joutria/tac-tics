/* Run simulator: plays whole runs of the first region with the AI on both sides, always taking the first open
   node (or a rest when the hero is under half HP). Run with `npm run simulate:run [-- <runs>]`. */
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle } from "../src/engine/state";
import { enterNode, finishBattle, newRun, nextNodes } from "../src/run/run";
import { HERO } from "../src/data/region";

const runs = Number(process.argv[2] ?? 100);
let won = 0, nodes = 0, rivalsMet = 0, rivalsMade = 0;
const deaths = new Map<number, number>();
const started = Date.now();
for (let i = 1; i <= runs; i++) {
  let run = newRun(`sim-${i}`);
  while (!run.over) {
    const open = nextNodes(run);
    const pick = run.heroHp < HERO.hp / 2 ? open.find((n) => n.kind === "rest") ?? open[0]! : open.find((n) => n.kind !== "rest") ?? open[0]!;
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
    const layer = run.map.nodes[run.battle.node]!.layer;
    run = finishBattle(run, s);
    if (run.over === "lost") deaths.set(layer, (deaths.get(layer) ?? 0) + 1);
  }
  if (run.over === "won") won++;
  nodes += run.path.length;
  rivalsMade += run.rivals.length;
}
console.log(`${runs} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`runs won ${won} (${((100 * won) / runs).toFixed(0)}%), average nodes cleared ${(nodes / runs).toFixed(1)}`);
console.log(`runs lost by layer: ${[...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`).join(" ")}`);
console.log(`rivals made ${rivalsMade}, rival nodes entered ${rivalsMet}`);
