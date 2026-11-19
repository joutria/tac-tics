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

## Run it

```sh
npm install
npm run dev        # play at the address Vite prints
npm test           # engine tests
npm run check      # data checker: texts in both languages, abilities, elements, maps, art files
npm run simulate   # AI against AI over 200 fights, for balance
npm run build      # production build in dist/
```

## How the code is laid out

| Path | What it holds |
| --- | --- |
| `src/engine/` | The rules, with no DOM: grid and heights (`grid.ts`), walking and Lock (`movement.ts`), line of sight (`sight.ts`), battle state, timeline and commands (`state.ts`), damage and abilities (`combat.ts`), enemy AI (`ai.ts`), seeded random (`rng.ts`), saves (`save.ts`) |
| `src/data/` | Game data: the element wheel from Evolvlings (`elements.ts`), abilities, maps (`maps/`), units |
| `src/render/iso.ts` | Isometric drawing and turning clicks into tiles |
| `src/i18n/text.ts` | Every text in Spanish and English |
| `src/main.ts` | The test screen |
| `tools/check.ts` | Data checker |
| `tools/simulate.ts` | AI-against-AI balance simulator |
| `tools/iso-tiles.py` | Angles the Evolvlings top-down tiles into isometric ones (placeholder art) |
| `public/art/` | Tiles and creature sheets |

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
