/* A save is the setup plus every command played. Loading replays them, so a save resumes at the exact
   moment it was made (mid-turn included) and stays small. Co-op will send the same commands over the network. */
import { PROP_HP, type Tile, rockSizeAt } from "./grid";
import { applyCommand, BattleSetup, BattleState, Command, createBattle } from "./state";

export const SAVE_VERSION = 2;

export interface BattleSave {
  version: number;
  setup: BattleSetup;
  commands: Command[];
  /** Rewinds spent this battle (the screen allows one). Not part of the rules, so replay ignores it. */
  rewindsUsed?: number;
  /** The party has been placed (or the player skipped placing it): the fight is under way. Screen only. */
  placed?: boolean;
  /** The words before the fight have been said (run/parley.ts). Screen only. */
  talked?: boolean;
}

export function replay(setup: BattleSetup, commands: Command[]): BattleState {
  let state = createBattle(setup);
  commands.forEach((cmd, i) => {
    const r = applyCommand(state, cmd);
    if (!r.ok) throw new Error(`save is broken at command ${i}: ${r.error}`);
    state = r.state;
  });
  return state;
}

export const toJSON = (save: BattleSave) => JSON.stringify(save);

export function fromJSON(text: string): BattleSave {
  const save = JSON.parse(text) as BattleSave;
  if (save.version !== SAVE_VERSION) throw new Error(`unknown save version ${save.version}`);
  // Older saves had rocks as unwalkable ground and separate loose boulders: both are now a pushable rock on dirt.
  // Rocks from before sizes take the size their place gives them.
  const m = save.setup.map;
  (m.tiles as (Tile | { terrain: string; prop?: string })[]).forEach((t, i) => {
    if (t.terrain === "rock") { t.terrain = "dirt"; t.prop = "rock"; (t as Tile).propHp = PROP_HP.rock; }
    if (t.prop === "boulder") t.prop = "rock";
    if (t.prop === "rock" && !(t as Tile).rockSize) (t as Tile).rockSize = rockSizeAt({ x: i % m.w, y: Math.floor(i / m.w) });
  });
  return save;
}
