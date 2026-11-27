/* Units for the M1 test fight. Foes' looks are Evolvlings creature sheets (Ninja Adventure, CC0); the party's are
   humanoid characters by Svetlana Kushnariova (see HERO_LOOKS); humanoid foes are in FOLK_LOOKS. */
import type { UnitSpec } from "../engine/state";

/** The party's looks, drawn as humanoid characters (with face portraits) in public/art/heroes/ (built by tools/hero-art.py); every other
    look is a creature sheet in public/art/creatures/. */
export const HERO_LOOKS = new Set(["lumo", "remolin", "guijo", "centella", "moheda"]);

/** Humanoid foes (JS Actors fighters, ratfolk, Pipoya goblins and survivors, the ogre and troll brutes) in public/art/folk/, built by tools/folk-art.py. */
export const FOLK_LOOKS = new Set(["brasa", "pena", "malva", "marea", "ratero", "trasgo", "trasgo-chaman", "ogro", "trol", "aldeano", "anciana"]);
/** Looks that also have a drawn face portrait, <look>-face.png next to their sheet. */
const FACED = new Set([...HERO_LOOKS, "brasa", "pena", "malva", "marea"]);

const lookDir = (look: string) => (HERO_LOOKS.has(look) ? "heroes" : FOLK_LOOKS.has(look) ? "folk" : "creatures");
/** Where a look's sprite sheet lives, relative to the site's public folder. */
export const lookArt = (look: string) => `art/${lookDir(look)}/${look}.png`;
/** Where a look's face portrait lives, if it has one. */
export const lookFace = (look: string) => (FACED.has(look) ? `art/${lookDir(look)}/${look}-face.png` : null);

export const TEST_UNITS: UnitSpec[] = [
  { id: "hero", name: "Hero", team: "heroes", element: "light", look: "lumo", pos: { x: 2, y: 6 },
    hp: 75, ap: 6, mp: 3, speed: 50, jump: 1, str: 0, mag: 26, agi: 10, res: { light: 20 },
    abilities: ["ray", "flare", "prism", "blink", "glow"], quick: "aim" },
  { id: "foe1", name: "Chisporro", team: "foes", element: "fire", look: "chisporro", pos: { x: 7, y: 1 },
    hp: 30, ap: 6, mp: 3, speed: 42, jump: 1, str: 0, mag: 10, agi: 8, res: { fire: 25 },
    abilities: ["ember", "blaze"], ai: "caster", marked: true },
  { id: "foe2", name: "Cañín", team: "foes", element: "plant", look: "canin", pos: { x: 8, y: 6 },
    hp: 38, ap: 6, mp: 3, speed: 36, jump: 1, str: 10, mag: 0, agi: 12, res: { plant: 25 },
    abilities: ["bite", "snare"], ai: "bruiser", marked: true },
  { id: "foe3", name: "Ajolín", team: "foes", element: "water", look: "ajolin", pos: { x: 6, y: 8 },
    hp: 32, ap: 6, mp: 4, speed: 46, jump: 1, str: 5, mag: 0, agi: 14, res: { water: 25 },
    abilities: ["splash", "undertow"], ai: "skirmisher", marked: true },
];
