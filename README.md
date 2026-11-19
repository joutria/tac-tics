# Tac-tics

A turn-based tactics roguelike in the world of [Evolvlings](https://github.com/joutria/Evolvlings): grid fights on isometric maps with heights and obstacles (Dofus, Final Fantasy Tactics Advance), companions with their own voices and stories (Baldur's Gate), and long runs you can save and continue at any time. Spanish and English. Free, made for friends, with co-op runs planned.

Plan: [Tac-tics game plan](https://claude.ai/artifact/YNBSuzhDPRJQH7ibsvAdJw).

## Status: milestone 0 (foundations)

The test screen shows a 10 x 10 meadow with raised ground, water, rocks and trees. You move every unit by hand (enemy AI and abilities come in milestone 1). Each move is saved, so reloading the page continues the battle where it was.

## Run it

```sh
npm install
npm run dev        # play at the address Vite prints
npm test           # engine tests
npm run check      # data checker: texts in both languages, elements, maps, art files
npm run build      # production build in dist/
```

## How the code is laid out

| Path | What it holds |
| --- | --- |
| `src/engine/` | The rules, with no DOM: grid and heights (`grid.ts`), walking (`movement.ts`), line of sight (`sight.ts`), battle state and commands (`state.ts`), seeded random (`rng.ts`), saves (`save.ts`) |
| `src/data/` | Game data: the element wheel from Evolvlings (`elements.ts`), maps (`maps/`), units |
| `src/render/iso.ts` | Isometric drawing and turning clicks into tiles |
| `src/i18n/text.ts` | Every text in Spanish and English |
| `src/main.ts` | The test screen |
| `tools/check.ts` | Data checker |
| `tools/iso-tiles.py` | Angles the Evolvlings top-down tiles into isometric ones (placeholder art) |
| `public/art/` | Tiles and creature sheets |

## Design rules for the engine

- **Every change is a command.** `applyCommand(state, command)` returns a new state and never changes its input.
- **Only seeded random.** The random state lives in the battle state, so the same setup and the same commands always give the same battle.
- **A save is the setup plus the command list.** Loading replays it, so you can quit at any moment and resume exactly. Co-op will send the same commands between the host's room and the friend who joins.
- **The engine knows nothing about the isometric view.** It works on a square grid with a height per tile; only `src/render/` draws diamonds.

## Maps

Maps are text rows in `src/data/maps/`, two characters per tile: terrain (`g` grass, `d` dirt, `w` water, `r` rock, `t` tree) and height `0` to `3`. A unit can climb 1 level per step and drop 2. Rocks and trees block movement and sight; water blocks movement only. Higher ground sees over obstacles.

## Art

The isometric tiles are placeholders: the Evolvlings (Ninja Adventure, CC0) top-down tiles rotated 45 degrees and squashed. To rebuild them: `python3 tools/iso-tiles.py <path to an Evolvlings checkout>` (needs Pillow). See `CREDITS.md`.
