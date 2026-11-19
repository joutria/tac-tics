/* Balance simulator: plays the test fight many times with the AI on both sides and reports the results.
   Run with `npm run simulate [-- <fights>]`. It uses the real engine, so it is exactly the game's rules. */
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle, roundOf, type BattleState } from "../src/engine/state";

const fights = Number(process.argv[2] ?? 200);
let heroWins = 0, rounds = 0, turns = 0, stuck = 0, heroHpLeft = 0, escapes = 0, fleeStates = 0;
const started = Date.now();
for (let seed = 1; seed <= fights; seed++) {
  let s: BattleState = createBattle({ seed, map: MEADOW, units: TEST_UNITS });
  while (!s.winner && s.turns < 300) {
    for (const c of planTurn(s)) {
      const r = applyCommand(s, c);
      if (!r.ok) throw new Error(`seed ${seed}: illegal AI command ${JSON.stringify(c)}: ${r.error}`);
      s = r.state;
    }
  }
  escapes += s.units.filter((u) => u.life === "escaped").length;
  fleeStates += s.units.filter((u) => u.escape !== "none").length;
  if (!s.winner) { stuck++; continue; }
  if (s.winner === "heroes") { heroWins++; heroHpLeft += s.units.find((u) => u.id === "hero")!.hp; }
  rounds += roundOf(s); turns += s.turns;
}
const done = fights - stuck;
console.log(`${fights} fights in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`hero wins ${heroWins} (${((100 * heroWins) / fights).toFixed(0)}%), unfinished ${stuck}`);
console.log(`average length ${(rounds / done).toFixed(1)} rounds, ${(turns / done).toFixed(1)} turns`);
console.log(`foes that started to retreat or flee: ${fleeStates}, escaped: ${escapes}`);
if (heroWins) console.log(`hero HP left when winning: ${(heroHpLeft / heroWins).toFixed(1)}`);
