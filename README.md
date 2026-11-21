# Tac-tics

A turn-based tactics roguelike in the world of [Evolvlings](https://github.com/joutria/Evolvlings): grid fights on isometric maps with heights and obstacles (Dofus, Final Fantasy Tactics Advance), companions with their own voices and stories (Baldur's Gate), and long runs you can save and continue at any time. Spanish and English. Free, made for friends, with co-op runs planned.

Plan: [Tac-tics game plan](https://claude.ai/artifact/YNBSuzhDPRJQH7ibsvAdJw).

## Status: milestone 1 (one good fight)

Play it at https://joutria.github.io/tac-tics/. You control the Light hero against three foes on a meadow with hills, a pond, rocks and trees. The enemy AI plays the foes. Each move is saved, so reloading the page continues the battle where it was.

### Combat rules

- **Turn timeline.** Faster units act sooner and more often. A turn where you only move (no AP spent) comes back sooner. **Wait** passes your turn, before you move or act, to act right after the next character.
- **AP and MP.** Abilities cost Action Points; walking costs Movement Points. **Lock:** leaving a tile next to foes costs 1 extra MP for each of them whose Agility is at least yours.
- **Damage** is a roll inside the ability's range (steady 7 to 9, or a 0 to 20 gamble), then x (1 + Strength or Magic / 100), +10% per level of height above the target (at most +30%), +25% from behind or +10% from the side, the element wheel (x1.5 strong, x0.75 weak, x1.25 opposite), a 5% critical (x1.5), and the target's resistance. Attacks always hit. Area attacks hit allies too.
- **Reach and height.** Ranged abilities gain 1 range per level above the target and lose 1 per level below (never under 1). Rocks, trees and units block line of sight; high ground sees over them.
- **Cooldowns and limits** per ability; the map shows the range in red and valid targets in bright red, and hovering a target previews the damage.
- **Downed, not dead.** At 0 HP a unit is downed for 2 of its turns; an ally can **Help up** (25% HP). Hitting a downed unit kills it. A side with nobody standing loses.
- **Enemy AI** scores every tile and ability with one turn of lookahead: it counts the damage you could deal next turn (ignoring your abilities on cooldown), hides out of your line of sight, takes high ground, focuses wounded or downed units, and adapts if you keep fighting from range or up close.
- **View:** rotate in 90 degree steps, zoom, drag to pan, and undo moves until you use an ability.

### Sparing and mercy

- **Yielding.** A foe under 25% of its HP, or one that is fleeing, shows a white flag (over its head and in the turn
  bar). Bosses never yield. A foe that is not Savia-marked stops fighting under the flag; once only such foes are left,
  the party has won. A marked foe under the flag keeps fighting and runs for the edge when it can.
- **Spare** (1 AP, 1 to 2 tiles, the party only): the yielding foe kneels and leaves. A spared foe never becomes a
  rival; only foes that get away on their own do (they show a running figure while they head for the edge).
- **Hold back** (the 🤚 button, H, or the left trigger): while it is on, a hit that would down a foe stops at 1 HP
  instead, falls and slams included, and nobody downed is finished off. The forecast says so.
- **After a win**, every foe still on the map, downed or yielding, gets a Spare or Finish choice.
- **What it pays.** Each spared foe hands over a gift at once (coins, a Savia shard or a heal), and joins the run's
  spared list. At later stops one of them may come back, once each: it fights beside the party for one battle, warns
  of an ambush (which is then called off), or minds a shop stall at 25% off. The more you spare, the likelier.
  Numbers in `MERCY` (`src/data/mercy.ts`). Remanso likes sparing and dislikes finishing a yielding foe.
- **The Sap pulls back.** While the hero is Sap-touched (Purity/Sap at -20 or lower), spared foes stop coming back
  to help (`relapses()` in `src/run/run.ts`).
- `npm run simulate:run -- 100 normal --mercy` plays runs that spare every foe they can, to compare with the default.

### Alignment, twin cards and endings

- **Two meters**, each from -100 to +100, shown under the header and on the hero sheet (🎒 Gear), with ticks at 20 and 50:
  **Mercy / Severity** and **Purity / Sap**. Each has three bands (20 or more on a side, or the middle), which gives
  nine alignments: Lantern, Shepherd, Graft / Warden, Wanderer, Bargainer / Purifier, Hunter, Crown.
- **What moves them** (`SHIFT` in `src/data/alignment.ts`): spare a foe Mercy +5, finish a yielding, fleeing or downed
  foe -3, help an ally up +2 (at most 8 per meter per fight); spare a rival +10, finish one -10; burn shards at a rest's
  fire Purity +5, buy Sap-forged (epic) gear with shards Sap +5; each tagged twin card used moves its side by 1, once
  per card per fight. The spoils line after a fight says what moved, and crossing 20 or 50 is said once.
- **Lock-in.** When a meter reaches 50 on one side, it locks: the other side's signature twins close for the rest of
  the run. The hero sheet warns from 40. Switch to locking when a region's boss falls instead with
  `ALIGN.lockAt = "regionEnd"`.
- **Twin cards** (`src/data/twins.ts`). From level 6, each of the hero's cards has a twin with the same AP cost; swap
  them for free on the hero sheet between stops. Tagged twins also need 20 on their side, and the job cards' signature
  twins need 50. A worn twin whose side drops below the mark fights as the original until it is open again. Sap twins
  hit harder but cost the hero HP.
- **Hero ending.** After the last boss, the epilogue opens with the hero's ending: a full one for each corner (Lantern,
  Graft, Purifier, Crown), a variant of the nearest corner plus a line of its own for each edge, and the regular ending
  for the Wanderer. Companion endings follow as before.

### Between battles: travel scenes and the route map

- **Travel scenes.** Between two stops the party walks a strip of terrain made for the region they are in, drawn in
  the same isometric pixel art as the battles. They set out from where they were (the arena they just fought on, a
  camp fire, a shop stall, a clearing, or the region's gate) and stop at a fork with one signpost per path they can take.
  Picking a fight keeps them walking until they reach the arena, where the foes are waiting. A walk can be skipped
  with a tap, Space, Enter or A.
- **Terrain.** Strips are stitched from a pool of small handmade pieces per region (`PIECES` in `src/run/travel.ts`),
  mirrored and flipped, with the region's scenery on the sides. They come from the run seed, so a reload shows the same walk.
- **Ambushes.** About 3 in 10 plain fights and elites (from the second layer on) are ambushes: the foes hide until the
  party arrives, start 2 or 3 tiles from it on its flanks and behind it, and all act before anyone in the party.
  Rivals and bosses never ambush. `AMBUSH_CHANCE` in `src/run/run.ts`.
- **Route map.** M, the 🗺 button, or Select/Back on a controller opens the region's run map as a small isometric
  world, also during battles (view only). Stops that can be picked glow; drag to see the rest on a phone.

### Controls

| | Keyboard | Controller (standard layout) |
| --- | --- | --- |
| Route map | M | Select / Back |
| Move between signs, nodes, panel buttons | Arrow keys | D-pad or left stick |
| Pick, confirm | Enter or Space | A |
| Back, cancel | Escape | B |
| Battle: move the tile cursor | Arrow keys (along the screen's diagonals) | D-pad |
| Battle: act on the cursor tile (first press previews, second acts) | Enter | A |
| Battle: choose an ability | 1 to 9, or Tab to cycle | X to cycle |
| Battle: end turn | T | Start |
| Battle: rotate the view | Q / E | LB / RB |
| Battle: danger zone | | Y |
| Battle: Hold back on or off | H | LT |
| After a win: Spare / Finish | Arrow keys, Enter | D-pad, A |
| Hero sheet: swap a card and its twin | Arrow keys, Enter | D-pad, A |
| Pick a sign at the fork | 1 to 3 | |

## Run it

```sh
npm install
npm run dev        # play at the address Vite prints
npm test           # engine tests
npm run check      # data checker: texts in both languages, abilities, elements, maps, art files
npm run simulate   # AI against AI over 200 fights, for balance
npm run simulate:run -- 100 normal --log sim.json   # whole AI runs, optionally written as a play log
npm run analyze -- playlog.json sim.json            # sum up play logs (exported from Stats, or from the simulator)
npm run build      # production build in dist/
```

## How the code is laid out

| Path | What it holds |
| --- | --- |
| `src/engine/` | The rules, with no DOM: grid and heights (`grid.ts`), walking and Lock (`movement.ts`), line of sight (`sight.ts`), battle state, timeline and commands (`state.ts`), damage and abilities (`combat.ts`), enemy AI (`ai.ts`), seeded random (`rng.ts`), saves (`save.ts`) |
| `src/data/` | Game data: the element wheel from Evolvlings (`elements.ts`), abilities, maps (`maps/`), units |
| `src/render/iso.ts` | Isometric drawing and turning clicks into tiles |
| `src/run/travel.ts` | Travel scenes: the walk pieces per region, building the strip, the party's paths |
| `src/ui/worldmap.ts` | The route map as an isometric map of tiles |
| `src/i18n/text.ts` | Every text in Spanish and English |
| `src/main.ts` | The test screen |
| `src/run/playlog.ts`, `src/ui/stats.ts` | Play log: run, battle and choice events kept on the device, the Stats panel, export |
| `tools/check.ts` | Data checker |
| `tools/analyze-log.ts` | Sums up exported play logs and simulator logs |
| `tools/simulate.ts` | AI-against-AI balance simulator |
| `tools/iso-tiles.py` | Angles the Evolvlings top-down tiles into isometric ones (placeholder art) |
| `public/art/` | Tiles and creature sheets |

## Play log

The game keeps a log of what the player does in a run (difficulty, nodes picked and what else was open, every
battle's rounds, turns, abilities used, damage, rewinds, who downed the hero, mercy deeds, reward/perk/shop picks,
companion approval, how the run ended). It stays in the browser's storage, capped at 5000 events, and is never sent
anywhere. On the map, 📊 Stats shows a summary and can export the log as a JSON file, switch logging off, or clear it.
Exported files from several players can be pooled with `npm run analyze`, and the run simulator writes the same
format so AI runs and real runs can be compared side by side.

## Design rules for the engine

- **Every change is a command.** `applyCommand(state, command)` returns a new state and never changes its input.
- **Only seeded random.** The random state lives in the battle state, so the same setup and the same commands always give the same battle.
- **A save is the setup plus the command list.** Loading replays it, so you can quit at any moment and resume exactly. Co-op will send the same commands between the host's room and the friend who joins.
- **The AI uses no randomness** and only reads the battle state, so it replays exactly too.
- **The engine knows nothing about the isometric view.** It works on a square grid with a height per tile; only `src/render/` draws diamonds.

## Maps

Maps are text rows in `src/data/maps/`, two characters per tile: terrain (`g` grass, `d` dirt, `w` water, `r` rock, `t` tree) and height `0` to `3`. A unit can climb 1 level per step and drop 2. Rocks and trees block movement and sight; water blocks movement only. Higher ground sees over obstacles.

## Art

The isometric tiles are placeholders: the Evolvlings (Ninja Adventure, CC0) top-down tiles rotated 45 degrees and squashed. To rebuild them: `python3 tools/iso-tiles.py <path to an Evolvlings checkout>` (needs Pillow). See `CREDITS.md`.
