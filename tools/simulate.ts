/* Balance simulator: plays the test fight many times with the AI on both sides and reports the results.
   Run with `npm run simulate [-- <fights>]`. It uses the real engine, so it is exactly the game's rules. */
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { planTurn } from "../src/engine/ai";
import { applyCommand, createBattle, roundOf, type BattleSetup, type BattleState, type Command } from "../src/engine/state";
import { PaceStats, rulesFromArgs } from "./battle-stats";
import { activeRivals, afterBattle, rivalSpec } from "../src/run/rivals";

const argv = process.argv.slice(2);
const rulesLine = rulesFromArgs(argv);
if (rulesLine) console.log(rulesLine);
const fights = Number(argv[0] ?? 200);
let heroWins = 0, rounds = 0, turns = 0, stuck = 0, heroHpLeft = 0, escapes = 0, fleeStates = 0;
const started = Date.now();
const pace = new PaceStats();
for (let seed = 1; seed <= fights; seed++) {
  let s: BattleState = createBattle({ seed, map: MEADOW, units: TEST_UNITS });
  pace.start();
  while (!s.winner && s.turns < 300) {
    const before = s, cmds = planTurn(s);
    for (const c of cmds) {
      const r = applyCommand(s, c);
      if (!r.ok) throw new Error(`seed ${seed}: illegal AI command ${JSON.stringify(c)}: ${r.error}`);
      s = r.state;
    }
    pace.turn(before, cmds, s);
  }
  pace.end(s);
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
console.log(pace.report());
if (heroWins) console.log(`hero HP left when winning: ${(heroHpLeft / heroWins).toFixed(1)}`);

// Rivals: every fight where a foe got away is followed by a rematch with that rival (levelled, with its counter).
let rematches = 0, rematchWins = 0;
for (let seed = 1; seed <= fights; seed++) {
  const setup1 = { seed, map: MEADOW, units: TEST_UNITS };
  const first = fight(setup1);
  const rivals = activeRivals(afterBattle([], setup1, first.cmds, first.s));
  if (!rivals.length) continue;
  const units = TEST_UNITS.map((u) => { const r = rivals.find((x) => x.id === u.id); return r ? rivalSpec(r, "en", u.pos) : u; });
  const second = fight({ seed: seed + 100000, map: MEADOW, units });
  rematches++;
  if (second.s.winner === "heroes") rematchWins++;
}
if (rematches) console.log(`rematches against rivals: ${rematches}, hero wins ${rematchWins} (${((100 * rematchWins) / rematches).toFixed(0)}%)`);

function fight(setup: BattleSetup) {
  let s = createBattle(setup);
  const cmds: Command[] = [];
  while (!s.winner && s.turns < 300) {
    for (const c of planTurn(s)) {
      const r = applyCommand(s, c);
      if (!r.ok) throw new Error(`illegal AI command ${JSON.stringify(c)}: ${r.error}`);
      s = r.state; cmds.push(c);
    }
  }
  return { s, cmds };
}
