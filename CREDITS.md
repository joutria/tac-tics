# Credits

Tac-tics shares its world with [Evolvlings](https://github.com/joutria/Evolvlings). Its own characters, events and story are original to these projects.

## Third-party art and sound

| What | Where it is used | Author | Licence |
| --- | --- | --- | --- |
| [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) (tilesets, monsters) | Placeholder isometric tiles in `public/art/iso/` (angled from the Evolvlings maps by `tools/iso-tiles.py`) and the creature sheets of the foes in `public/art/creatures/` (from Evolvlings) | Pixel-boy and AAA | CC0 1.0 (no attribution required; credited anyway) |
| [Idylwild's Chromatic Campfires](https://opengameart.org/content/idylwilds-chromatic-campfires) | Flames (burning tiles, crates, trees and the camp fire), fire smoke and steam columns in `public/art/fx/` (`flame`, `smoke`, `steam`) | Idylwild | CC0 1.0 |
| [Animated tree and water](https://opengameart.org/content/animated-tree-and-water) | Rippling water (`public/art/fx/water.png`, recoloured to the Ninja Adventure water and angled to a diamond) | abetusk | CC0 1.0 |
| [Fire Smoke Animations](https://opengameart.org/content/fire-smoke-animations) | Small smoke and steam puffs (`public/art/fx/puff.png`, whitened) | Reactorcore | CC0 1.0 |
| [Ninja Adventure](https://github.com/pixel-boy/NinjaAdventure) (`system/environment/fx/leaf.png`) | Leaves falling from trees (`public/art/fx/leaf.png`) | Pixel-boy and AAA | CC0 1.0 |
| [The Essential Retro Video Game Sound Effects Collection](https://opengameart.org/content/512-sound-effects-8-bit-style) | Interface and battle sound effects in `public/audio/` | Juhani Junkala | CC0 1.0 |
| [50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects) | Footsteps, coins, pages, cloth, doors, chopping and metal in `public/audio/` | Kenney | CC0 1.0 |
| [4 Chiptunes (Adventure)](https://opengameart.org/content/4-chiptunes-adventure) | The music in `public/audio/music/` (map, battle, boss, camp) | Juhani Junkala | CC0 1.0 |
| [496 pixel art icons for medieval/fantasy RPG](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg) | Menu icons for abilities, elements, statuses, coins and a few buttons (`public/art/ui/icons.png`, packed by `tools/icon-pack.py`) | Henrique Lazarini (7Soul1) | CC0 1.0 |
| [Golden UI](https://opengameart.org/content/golden-ui) | Window frames and buttons (`public/art/ui/win.png`, `btn*.png`, cut by `tools/ui-art.py`; the green and red buttons are recoloured) | Buch | CC0 1.0 |
| [Jacquard 12](https://fonts.google.com/specimen/Jacquard+12) (via `@fontsource/jacquard-12`) | The game's name on the title screen | The Soft Type Project (Sarah Cadigan-Fried) | SIL Open Font License 1.1 |
| [32x32 RPG Character Sprites](https://opengameart.org/content/32x32-rpg-character-sprites) | The party's humanoid sprites (hero, Remanso, Guijo, Centella, Moheda) in `public/art/heroes/`, built by `tools/hero-art.py`, which adds small eyes to the blank faces and lays the standing frame down for the downed pose | Eldiran | CC0 1.0 |
| [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (via `@fontsource/pixelify-sans`) | The interface font | Stefie Justprince | SIL Open Font License 1.1 |

The small 16x16 icons in `src/ui/icons.ts` (used on the battle board and wherever no pack icon fits), the crate and barrel sprites (`public/art/iso/obj-crate*.png`, `obj-barrel.png`, drawn by `tools/prop-art.py`), the rocks and trees of each region (`public/art/iso/rock-*.png`, `tree-*.png`, drawn by `tools/scenery-art.py`) and the pixel puddles of oil and sap (`src/render/puddle.ts`) are original to tac-tics.

The `public/art/fx/` sheets are rebuilt from the downloaded packs by `tools/ambience-art.py`, and `public/audio/` by `tools/audio-assets.py` (each script's header lists its files).

When you add art or sound from another pack, add a row here with its licence, and keep any attribution a CC-BY pack asks for.
