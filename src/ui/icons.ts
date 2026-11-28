/* Pixel icons drawn for Tac-tics: 16x16, one character per pixel, outlined like the Ninja Adventure sprites, so the
   interface uses the same pixel art as the map instead of emoji (which look different on every phone).
   `icon()` gives an <img> for the DOM, `iconCanvas()` a canvas to draw on the battle map. Everything is built once,
   on first use, scaled up with hard edges. tools/check.ts checks every icon is 16x16 and uses known colours. */

import { PACK as PACK_CELLS, PACK_CELL, type PackIcon } from "./pack";

/** One character per colour; "." is see-through. */
export const PALETTE: Record<string, string> = {
  k: "#1b1626", w: "#f7f3e8", l: "#c9c6d6", s: "#8d8aa0", S: "#555268",
  y: "#ffe06b", Y: "#e0a02a", o: "#ff9a3a", r: "#e8483a", R: "#8e2a22",
  g: "#84dc5c", G: "#3d8a3a", b: "#5aaaf0", B: "#2f5fa8", c: "#aee8ff",
  p: "#c98cff", P: "#6e45a8", n: "#b07a44", N: "#6a4423", t: "#f4c89a",
};

type Rows = string[];
const pad = (rows: Rows): Rows => [...rows, ...Array(16 - rows.length).fill("................")];
const mirror = (rows: Rows): Rows => rows.map((r) => [...r].reverse().join(""));
const flipV = (rows: Rows): Rows => [...rows].reverse();
const recolor = (rows: Rows, map: Record<string, string>): Rows => rows.map((r) => [...r].map((c) => map[c] ?? c).join(""));
/** `top` drawn over `base` (its see-through pixels show the base). */
const overlay = (base: Rows, top: Rows): Rows => base.map((r, y) => [...r].map((c, x) => (top[y]![x] !== "." ? top[y]![x] : c)).join(""));

const MENU = pad([
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  "..kwwwwwwwwwwk..",
  "..kkkkkkkkkkkk..",
  "................",
  "..kkkkkkkkkkkk..",
  "..kwwwwwwwwwwk..",
  "..kkkkkkkkkkkk..",
  "................",
  "..kkkkkkkkkkkk..",
  "..kwwwwwwwwwwk..",
  "..kkkkkkkkkkkk..",
]);
const HEART = pad([
  "................",
  "..kkk.....kkk...",
  ".krrrk...krrrk..",
  "krwwrrk.krrrrrk.",
  "krwrrrrkrrrrrrk.",
  "krrrrrrrrrrrrrk.",
  "krrrrrrrrrrrrRk.",
  ".krrrrrrrrrrRk..",
  "..krrrrrrrrRk...",
  "...krrrrrrRk....",
  "....krrrrRk.....",
  ".....krrRk......",
  "......kRk.......",
  ".......k........",
]);
const STAR = pad([
  "................",
  ".......kk.......",
  "......kyyk......",
  "......kyyk......",
  ".....kyyyyk.....",
  ".kkkkyywyyykkkk.",
  ".kyyyyywyyyyyyk.",
  "..kyyyyyyyyyyk..",
  "...kyyyyyyyyk...",
  "....kyyyyyyk....",
  "....kyyyyyyk....",
  "...kyyyYYyyyk...",
  "...kyyYkkYyyk...",
  "..kyyYk..kYyyk..",
  "..kYYk....kYYk..",
  "..kkk......kkk..",
]);
const BOOT = pad([
  "................",
  "....kkkkkk......",
  "....kttttk......",
  "....knnnnk......",
  "....knnnnk......",
  "....knnnnk......",
  "....knnnnk......",
  "....knnnnnk.....",
  "...knnnnnnnkk...",
  "...knnnnnnnnnkk.",
  "...knnnnnnnnnnk.",
  "...kNNNNNNNNNNk.",
  "...kkkkkkkkkkkk.",
]);
const HOURGLASS = pad([
  "................",
  "...kkkkkkkkkk...",
  "...kNNNNNNNNk...",
  "....kwwwwwwk....",
  "....kyyyyyyk....",
  ".....kyyyyk.....",
  "......kyyk......",
  ".......kk.......",
  "......kwyk......",
  ".....kwwyyk.....",
  "....kwwyyyyk....",
  "....kyyyyyyk....",
  "...kNNNNNNNNk...",
  "...kkkkkkkkkk...",
]);
const RETICLE = pad([
  "................",
  "......kkkk......",
  "....kkrrrrkk....",
  "...krrkkkkrrk...",
  "..krkk....kkrk..",
  "..krk..kk..krk..",
  ".krk..krrk..krk.",
  ".krk.krwwrk.krk.",
  ".krk.krwwrk.krk.",
  ".krk..krrk..krk.",
  "..krk..kk..krk..",
  "..krkk....kkrk..",
  "...krrkkkkrrk...",
  "....kkrrrrkk....",
  "......kkkk......",
]);
const CROSS_AREA = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  ".....kooook.....",
  ".....kooook.....",
  ".kkkkkooookkkkk.",
  ".koooooyyoooook.",
  ".kooooyyyyooook.",
  ".koooooyyoooook.",
  ".kkkkkooookkkkk.",
  ".....kooook.....",
  ".....kooook.....",
  ".....kkkkkk.....",
]);
const EYE = pad([
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "...kkwwwwwwkk...",
  "..kwwwkkkkwwwk..",
  ".kwwwkbbbbkwwwk.",
  "kwwwkbbkkbbkwwwk",
  "kwwwkbbkkbbkwwwk",
  ".kwwwkbbbbkwwwk.",
  "..kwwwkkkkwwwk..",
  "...kkwwwwwwkk...",
  ".....kkkkkk.....",
]);
const SWORD = pad([
  ".............kk.",
  "............kwlk",
  "...........kwlk.",
  "..........kwlk..",
  ".........kwlk...",
  "........kwlk....",
  ".......kwlk.....",
  "..k...kwlk......",
  "..kk.kwlk.......",
  "..kYkwlk........",
  "...kYlk.........",
  "...kNYk.........",
  "..kNkkYk........",
  ".kNk...kk.......",
  "kNk.............",
  "kk..............",
]);
const HEAL = pad([
  "................",
  ".....kkkkkk.....",
  ".....kgwggk.....",
  ".....kgwggk.....",
  ".....kggggk.....",
  ".kkkkkggggkkkkk.",
  ".kgwwggggggggGk.",
  ".kggggggggggggk.",
  ".kggggggggggGGk.",
  ".kkkkkggggkkkkk.",
  ".....kggggk.....",
  ".....kggGGk.....",
  ".....kgGGGk.....",
  ".....kkkkkk.....",
]);
const SHIELD = pad([
  "................",
  "..kkkkkkkkkkkk..",
  "..kwbbbbbbbbBk..",
  "..kwbbbyybbbBk..",
  "..kbbbbyybbbBk..",
  "..kbbyyyyyybBk..",
  "..kbbyyyyyybBk..",
  "..kbbbbyybbbBk..",
  "..kbbbbyybbbBk..",
  "...kbbbyybbBk...",
  "...kbbbbbbBBk...",
  "....kbbbbBBk....",
  ".....kbbBBk.....",
  "......kBBk......",
  ".......kk.......",
]);
const PUSH = pad([
  "................",
  "................",
  "................",
  ".........k......",
  ".........kk.....",
  ".........kok....",
  "..kkkkkkkkook...",
  "k.koooooooooyk..",
  "..kooooooooooyk.",
  "k.koooooooooyk..",
  "..kkkkkkkkoyk...",
  ".........kYk....",
  ".........kk.....",
  ".........k......",
]);
const CHEVRONS = pad([
  "................",
  "................",
  "................",
  ".kkk....kkk.....",
  ".kcck...kcck....",
  "..kcck...kcck...",
  "...kcck...kcck..",
  "....kcck...kcck.",
  "....kcck...kcck.",
  "...kcck...kcck..",
  "..kcck...kcck...",
  ".kcck...kcck....",
  ".kkk....kkk.....",
]);
const SUN = pad([
  "................",
  ".......oo.......",
  "..o....oo....o..",
  "...o..kkkk..o...",
  "....kkyyyykk....",
  "....kyywyyyk....",
  "...kyywyyyyyk...",
  "oo.kyyyyyyyYk.oo",
  "oo.kyyyyyyyYk.oo",
  "...kyyyyyyYYk...",
  "....kyyyyYYk....",
  "....kkYYYYkk....",
  "...o..kkkk..o...",
  "..o....oo....o..",
  ".......oo.......",
]);
const FLAME = pad([
  "................",
  "......k.........",
  ".....krk........",
  ".....krrk...k...",
  "....krrrk..krk..",
  "....krrork.krk..",
  "...krroorkkrrk..",
  "...krrooorrrrk..",
  "..krrooyoorrrk..",
  "..krooyyyoorrk..",
  "..kroyyyyyoork..",
  "..kroyywyyyork..",
  "..krooyyyyoork..",
  "...krooyyoork...",
  "....kkrrrrkk....",
  ".....kkkkkk.....",
]);
const DROP = pad([
  "................",
  ".......k........",
  "......kbk.......",
  "......kbk.......",
  ".....kbbbk......",
  ".....kbbbk......",
  "....kbbbbbk.....",
  "....kbwbbbk.....",
  "...kbwbbbbbk....",
  "...kbwbbbbbk....",
  "...kbbbbbbBk....",
  "...kbbbbbbBk....",
  "....kbbbbBk.....",
  ".....kkkkk......",
]);
const LEAF = pad([
  "................",
  "............kk..",
  "..........kkgk..",
  "........kkgggk..",
  "......kkgggggk..",
  ".....kgggggGgk..",
  "....kggggGgggk..",
  "....kgggGggggk..",
  "...kgggGgggggk..",
  "...kggGggggGk...",
  "...kgGggggGk....",
  "...kGgggGGk.....",
  "..kGkkkkkk......",
  ".kGk............",
  ".kk.............",
]);
const ROCK = pad([
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kkkk......",
  "....kkssslkk....",
  "...kssslllssk...",
  "..ksssslllsssk..",
  "..kssssssssSSk..",
  ".kssSssssssSSSk.",
  ".ksSSsssssSSSSk.",
  ".kSSSSSSSSSSSSk.",
  "..kkkkkkkkkkkk..",
]);
const BOLT = pad([
  "................",
  ".........kkkk...",
  "........kyyyk...",
  ".......kyyyk....",
  "......kyyyk.....",
  ".....kyyyk......",
  "....kyyyykkkk...",
  "...kyyyyyyyyk...",
  "...kkkkyyyyk....",
  "......kyyyk.....",
  ".....kyyyk......",
  "....kyyk........",
  "...kyyk.........",
  "..kyk...........",
  "..kk............",
]);
const FLAKE = pad([
  "................",
  "...c...cc...c...",
  "....c..cc..c....",
  ".....c.cc.c.....",
  "......cwwc......",
  ".c....cwwc....c.",
  "..c..cwwwwc..c..",
  "cccccwwwwwwccccc",
  "cccccwwwwwwccccc",
  "..c..cwwwwc..c..",
  ".c....cwwc....c.",
  "......cwwc......",
  ".....c.cc.c.....",
  "....c..cc..c....",
  "...c...cc...c...",
]);
const MUSHROOM = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "...kkrrrrrrkk...",
  "..krrwwrrrrrrk..",
  ".krrwwrrrwwrrrk.",
  ".krrrrrrrwwrrrk.",
  "krrwwrrrrrrrrrrk",
  "krrwwrrrrrrrrRRk",
  "kRRRRRRRRRRRRRRk",
  ".kkkkttttttkkkk.",
  ".....kttttk.....",
  ".....kttttk.....",
  ".....ktttnk.....",
  "....kttttnnk....",
  "....kkkkkkkk....",
]);
const MOON = pad([
  "................",
  ".....kkkk.......",
  "...kkpppk.......",
  "..kpppPk........",
  "..kppPk.........",
  ".kppPk..........",
  ".kppPk......k...",
  ".kppPk.....kwk..",
  ".kppPk......k...",
  ".kpppPk.........",
  "..kpppPkk....k..",
  "..kppppppkkkkpk.",
  "...kkppppppppk..",
  ".....kkkkkkkk...",
]);
const WIND = pad([
  "................",
  "..........kkk...",
  ".........kccck..",
  "..kkkkkkkkk.kck.",
  ".kcccccccccckck.",
  "..kkkkkkkkkcck..",
  "...........kk...",
  ".kkkkkkkkkkkk...",
  "kcccccccccccck..",
  ".kkkkkkkkkkkcck.",
  "....kk......kck.",
  "...kcck....kcck.",
  "...kck.kkkkcck..",
  "....kccccccck...",
  ".....kkkkkkk....",
]);
const DIAMOND = pad([
  "................",
  "................",
  "................",
  ".......kk.......",
  "......kllk......",
  ".....kllllk.....",
  "....kllwllsk....",
  "...kllwllllsk...",
  "..kllllllllssk..",
  "...klllllllsk...",
  "....klllllsk....",
  ".....kllssk.....",
  "......kssk......",
  ".......kk.......",
]);
const SKULL = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "....kppppppk....",
  "...kppppppppk...",
  "...kpPPppPPpk...",
  "...kpPPppPPpk...",
  "...kpppPPpppk...",
  "....kppppppk....",
  "....kpPpPpPk....",
  ".....kkkkkk.....",
]);
const DOWN = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  ".....krrrrk.....",
  ".....krrrrk.....",
  ".....krrrrk.....",
  ".....krrrrk.....",
  ".kkkkkrrrrkkkkk.",
  "..krrrrrrrrrRk..",
  "...krrrrrrrRk...",
  "....krrrrrRk....",
  ".....krrrRk.....",
  "......krRk......",
  ".......kk.......",
]);
const TWINKLE = pad([
  "................",
  "................",
  "...k........k...",
  "..kyk......kyk..",
  ".kyyyk....kyyyk.",
  "..kyk......kyk..",
  "...k...kk...k...",
  "......kyyk......",
  ".....kyyyyk.....",
  "......kyyk......",
  ".......kk.......",
]);
const FLAG = pad([
  "................",
  "..kk............",
  "..kNkkkkkkkk....",
  "..kNkrrrrrrrk...",
  "..kNkrwrrrrrrk..",
  "..kNkrrrrrrrrk..",
  "..kNkrrrrrrrk...",
  "..kNkkkkkkkk....",
  "..kNk...........",
  "..kNk...........",
  "..kNk...........",
  "..kNk...........",
  "..kNk...........",
  "..kNk...........",
  ".kkkkk..........",
]);
const CLOCK = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "...kkwwwwwwkk...",
  "..kwwwwkwwwwwk..",
  "..kwwwwkwwwwwk..",
  ".kwwwwwkwwwwwwk.",
  ".kwwwwwkwwwwwwk.",
  ".kwwwwwkkkkkwwk.",
  ".kwwwwwwwwwwwwk.",
  ".kwwwwwwwwwwwlk.",
  "..kwwwwwwwwwlk..",
  "..kwwwwwwwwllk..",
  "...kkllllllkk...",
  ".....kkkkkk.....",
]);
const HOOK = pad([
  "................",
  "................",
  "................",
  "....k...........",
  "...kck..........",
  "..kcckkkkkk.....",
  ".kccccccccckk...",
  "..kcckkkkkkcck..",
  "...kck.....kcck.",
  "....k.......kck.",
  "............kck.",
  "...........kcck.",
  "......kkkkkcck..",
  "......kccccck...",
  "......kkkkkk....",
]);
const REWIND = pad([
  "................",
  "................",
  "................",
  "................",
  ".......k......k.",
  "......kk.....kk.",
  ".....kpk....kpk.",
  "....kppk...kppk.",
  "...kpppk..kpppk.",
  "..kppppk.kppppk.",
  "...kpppk..kpppk.",
  "....kppk...kppk.",
  ".....kpk....kpk.",
  "......kk.....kk.",
  ".......k......k.",
]);
const WARN = pad([
  "................",
  ".......kk.......",
  "......kyyk......",
  "......kyyk......",
  ".....kyyyyk.....",
  ".....kykkyk.....",
  "....kyykkyyk....",
  "....kyykkyyk....",
  "...kyyykkyyyk...",
  "...kyyykkyyyk...",
  "..kyyyyyyyyyyk..",
  "..kyyyykkyyyyk..",
  ".kyyyyykkyyyyyk.",
  ".kYYYYYYYYYYYYk.",
  ".kkkkkkkkkkkkkk.",
]);
const GRID = pad([
  "................",
  "................",
  "..kkkkkkkkkkkkk.",
  "..kwggkgggkgggk.",
  "..kgggkgggkgggk.",
  "..kgggkgggkgggk.",
  "..kkkkkkkkkkkkk.",
  "..kgggkGGGkgggk.",
  "..kgggkGGGkgggk.",
  "..kgggkGGGkgggk.",
  "..kkkkkkkkkkkkk.",
  "..kgggkgggkGGGk.",
  "..kgggkgggkGGGk.",
  "..kgggkgggkGGGk.",
  "..kkkkkkkkkkkkk.",
]);
const MAP = pad([
  "................",
  "................",
  ".kkkkkkkkkkkkkk.",
  ".kttttttttttttk.",
  ".ktttttttttrtrk.",
  ".kttttttttttrtk.",
  ".ktttttttNtrtrk.",
  ".kttttttNttttnk.",
  ".ktttttNtttttnk.",
  ".kttttNttttttnk.",
  ".kttNtttttttnnk.",
  ".ktNttttttttnnk.",
  ".kGGttttttttnnk.",
  ".kGGGtttttttnnk.",
  ".kkkkkkkkkkkkkk.",
]);
const PACK = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "....kk....kk....",
  "...kkkkkkkkkk...",
  "..knnnnnnnnnnk..",
  "..knnnnnnnnnNk..",
  "..kkkkkkkkkkkk..",
  "..knnnkYYknnNk..",
  "..knnnkkkknnNk..",
  "..knnnnnnnnnNk..",
  "..knnnnnnnnnNk..",
  "..kNNNNNNNNNNk..",
  "..kkkkkkkkkkkk..",
]);
const CHART = pad([
  "................",
  "................",
  "................",
  "...........kkk..",
  "...........kgk..",
  "...........kgk..",
  ".......kkk.kgk..",
  ".......kyk.kgk..",
  ".......kyk.kgk..",
  "...kkk.kyk.kgk..",
  "...krk.kyk.kgk..",
  "...krk.kyk.kgk..",
  "...krk.kyk.kgk..",
  ".kkkkkkkkkkkkkk.",
]);
const BUBBLE = pad([
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  ".kwwwwwwwwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwkwwkwwwwk.",
  ".kwwwwkkkkwwwwk.",
  ".kwwwwkwwkwwwwk.",
  ".kwwwwkwwkwwwwk.",
  ".kwwwwwwwwwwwlk.",
  "..kkkwwkkkkkkk..",
  "....kwk.........",
  "....kk..........",
]);
const HAND = pad([
  "................",
  ".....kk.kk.kk...",
  ".....ktkktkktk..",
  ".kk..ktkktkktk..",
  ".ktk.ktkktkktk..",
  ".ktk.ktkktkktk..",
  "..ktkkttttttttk.",
  "..ktttttttttttk.",
  "...kttttttttttk.",
  "...kttttttttttk.",
  "....ktttttttttk.",
  "....kttttttttk..",
  ".....ktttttttk..",
  ".....kkkkkkkk...",
]);
const LENS = pad([
  "................",
  "...kkkkkk.......",
  "..kcwcccck......",
  ".kcwcccccck.....",
  ".kccckkccck.....",
  ".kccckkccck.....",
  ".kckkkkkkck.....",
  ".kckkkkkkck.....",
  ".kccckkccck.....",
  ".kccckkccck.....",
  "..kcccccck......",
  "...kkkkkknk.....",
  "..........knk...",
  "...........knk..",
  "............knk.",
  ".............kk.",
]);
const LENS_OUT = recolor(LENS, {}).map((r, y) => (y === 4 || y === 5 || y === 8 || y === 9 ? r.replace("kccckkccck", "kcccccccck") : r));
const CHECK = pad([
  "................",
  "................",
  "................",
  "................",
  "............kk..",
  "...........kgk..",
  "..........kggk..",
  ".kk......kggk...",
  ".kgk....kggk....",
  ".kggk..kggk.....",
  "..kggkkggk......",
  "...kggggk.......",
  "....kggk........",
  ".....kk.........",
]);
const CROSS = pad([
  "................",
  "................",
  "................",
  "..kk......kk....",
  ".krrk....krrk...",
  ".krrrk..krrrk...",
  "..krrrkkrrrk....",
  "...krrrrrrk.....",
  "....krrrrk......",
  "...krrrrrrk.....",
  "..krrrkkrrrk....",
  ".krrrk..krrrk...",
  ".krrk....krrk...",
  "..kk......kk....",
]);
const CAMPFIRE = pad([
  "................",
  "................",
  ".......k........",
  "......kok.......",
  "......kook......",
  ".....kooyok.....",
  ".....koyyok.....",
  "....kooyyook....",
  "....koyywyok....",
  "....koyyyyok....",
  ".kk..kkkkkk..kk.",
  ".knnkk....kknnk.",
  "..knnnkkkknnnk..",
  "...kNNnnnnNNk...",
  "..knnnkkkknnnk..",
  ".kNNk......kNNk.",
]);
const COIN = pad([
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "...kkyyyyyykk...",
  "..kyywwyyyyyYk..",
  "..kywYYYYYYyYk..",
  ".kyywYyyyyYyYYk.",
  ".kyyyYyyyyYyYYk.",
  ".kyyyYyyyyYyYYk.",
  ".kyyyYyyyyYyYYk.",
  "..kyyYYYYYYYYk..",
  "..kyyyyyyyyYYk..",
  "...kkYYYYYYkk...",
  ".....kkkkkk.....",
]);
const FACE = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "...kkttttttkk...",
  "..kttttttttttk..",
  ".kttkkttttkkttk.",
  ".kttkkttttkkttk.",
  ".kttttttttttttk.",
  ".ktkttttttttktk.",
  ".kttkttttttkttk.",
  "..kttkkkkkkttk..",
  "...kkttttttkk...",
  ".....kkkkkk.....",
]);
const CROWN = pad([
  "................",
  "................",
  "................",
  "..k....kk....k..",
  ".kyk..kyyk..kyk.",
  ".kyk..kyyk..kyk.",
  ".kyyk.kyyk.kyyk.",
  ".kyyykkyykkyyyk.",
  ".kyyyyyyyyyyyyk.",
  ".kyyrryyyybbyyk.",
  ".kyyrryyyybbyyk.",
  ".kYYYYYYYYYYYYk.",
  ".kkkkkkkkkkkkkk.",
]);
const SHARD = pad([
  "................",
  "................",
  ".......kk.......",
  "......kggk......",
  ".....kgwggk.....",
  ".....kgwggk.....",
  "....kggwgGGk....",
  "....kggggGGk....",
  "....kggggGGk....",
  "....kggggGGk....",
  ".....kgggGk.....",
  ".....kggGGk.....",
  "......kgGk......",
  ".......kk.......",
]);
const CRATE = pad([
  "................",
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  "..knnnnnnnnnNk..",
  "..knNnnnnnnNNk..",
  "..knnNnnnnNnNk..",
  "..knnnNnnNnnNk..",
  "..knnnnNNnnnNk..",
  "..knnnnNNnnnNk..",
  "..knnnNnnNnnNk..",
  "..knnNnnnnNnNk..",
  "..knNnnnnnnNNk..",
  "..kNNNNNNNNNNk..",
  "..kkkkkkkkkkkk..",
]);
const BARREL = pad([
  "................",
  "................",
  ".....kkkkkk.....",
  "....krrrrrrk....",
  "...kRRRRRRRRk...",
  "...krrrrrrrrk...",
  "...krwrrrrrRk...",
  "...kSSSSSSSSk...",
  "...krwrrrrrRk...",
  "...krwrryrrRk...",
  "...krwrrrrrRk...",
  "...kSSSSSSSSk...",
  "...krrrrrrrRk...",
  "....kRRRRRRk....",
  ".....kkkkkk.....",
]);

const BOOM = pad([
  "................",
  ".......kk.......",
  "..kk..kook..kk..",
  "..kok.koyk.kok..",
  "...kokkyykkok...",
  "....kooyyyook...",
  ".kkkooywwyyookk.",
  "koooyywwwwyyoook",
  ".kkkooywwyyookk.",
  "....kooyyyook...",
  "...kokkyykkok...",
  "..kok.kyok.kok..",
  "..kk..kook..kk..",
  ".......kk.......",
]);
/** The Floodgate: a sluice gate between two stone posts, water spilling under it. */
const SLUICE = pad([
  "................",
  ".kkkk......kkkk.",
  ".klsk......klsk.",
  ".klskkkkkkkklsk.",
  ".klsknnnnnnklsk.",
  ".klskNNNNNNklsk.",
  ".klsknnnnnnklsk.",
  ".klskNNNNNNklsk.",
  ".klskkkkkkkklsk.",
  ".klsk.bccb.klsk.",
  ".klskbbbbbbklsk.",
  "kkkkkbcbbcbkkkkk",
  "kbbbbbbbbbbbbbbk",
  "kbcbbbcbbbcbbbBk",
  ".kBBBBBBBBBBBBk.",
  "..kkkkkkkkkkkk..",
]);

const POINTER = pad([
  "................",
  "................",
  "................",
  "................",
  "..kkkk..........",
  ".kwwwwkkkkkkkk..",
  ".kwwwwwwwwwwwwk.",
  ".kwwwwwkkkkkkk..",
  ".kwwwwwwk.......",
  ".kwwwwwkk.......",
  ".kwwwwwwk.......",
  ".kllwwwk........",
  "..kkkkk.........",
]);
const SPEAKER = pad([
  "................",
  "......kk........",
  ".....kwk....k...",
  "....kwwk.....k..",
  "kkkkwwwk..k..k..",
  "kllkwwwk...k..k.",
  "kllkwwwk...k..k.",
  "kllkwwwk...k..k.",
  "kllkwwwk...k..k.",
  "kkkkwwwk..k..k..",
  "....kwwk.....k..",
  ".....kwk....k...",
  "......kk........",
]);
const MUTED = overlay(SPEAKER.map((r) => r.slice(0, 9) + "......."), pad([
  "................",
  "................",
  "................",
  "................",
  "..........r...r.",
  "...........r.r..",
  "............r...",
  "...........r.r..",
  "..........r...r.",
]));
/** The bottom of the camp fire icon (stones and logs), for the camp fires on the map; the flame is drawn live. */
const LOGS = CAMPFIRE.map((r, y) => (y < 10 ? "................" : r));

export const ICONS = {
  hp: HEART, ap: STAR, mp: BOOT, mana: recolor(DROP, { b: "p", c: "P" }), cooldown: HOURGLASS, range: RETICLE, area: CROSS_AREA, sight: EYE, sword: SWORD, heal: HEAL,
  shield: SHIELD, push: PUSH, quick: CHEVRONS, jump: recolor(flipV(DOWN), { r: "g", R: "G" }), throw: CRATE, crate: CRATE, barrel: BARREL, rock: ROCK,
  // Elements.
  light: SUN, fire: FLAME, water: DROP, plant: LEAF, stone: ROCK, bolt: BOLT, ice: FLAKE, mush: MUSHROOM, neutral: DIAMOND,
  air: WIND, shadow: MOON, star: recolor(STAR, { y: "c", Y: "b" }),
  // Statuses.
  burn: FLAME, poison: SKULL, regen: recolor(HEART, { r: "g", R: "G" }), slow: recolor(HOURGLASS, { y: "c", w: "b" }), stun: TWINKLE,
  weaken: DOWN,
  // Buttons.
  end: FLAG, wait: CLOCK, undo: recolor(HOOK, { c: "w" }), rewind: REWIND, danger: WARN, flat: GRID, rotL: HOOK, rotR: mirror(HOOK),
  map: MAP, gear: PACK, stats: CHART, lang: BUBBLE, hold: HAND, zoomIn: LENS, zoomOut: LENS_OUT, confirm: CHECK, cancel: CROSS,
  sound: SPEAKER, muted: MUTED, menu: MENU, skip: CHEVRONS, spare: recolor(FLAG, { r: "w", w: "l" }), coin: COIN, shard: SHARD,
  // Run map stops.
  battle: overlay(SWORD, mirror(SWORD)), elite: recolor(SKULL, { p: "w", P: "R" }), rest: CAMPFIRE, shop: COIN, recruit: FACE,
  rival: recolor(STAR, { y: "p", Y: "P" }), quest: recolor(DIAMOND, { l: "c", s: "b" }), boss: CROWN, floodgate: SLUICE,
  // Interface bits: the menu pointer, the arrow over whoever's turn it is, camp fire logs.
  boom: BOOM, flameB: mirror(FLAME), pointer: POINTER, turn: recolor(DOWN, { r: "y", R: "Y" }), turnFoe: DOWN, logs: LOGS,
} satisfies Record<string, Rows>;

export type IconId = keyof typeof ICONS;

/** Menu icons from the CC0 "496 pixel art icons for medieval/fantasy RPG" pack (tools/icon-pack.py): richer 32 px
    pictures for the DOM, where there is room for them. The battle board keeps the hand-drawn 16x16 icons above. */
const PACK_FOR: Partial<Record<IconId, PackIcon>> = {
  light: "S_Light02", fire: "S_Fire03", water: "S_Water07", plant: "I_Leaf", stone: "I_Rock01", bolt: "S_Thunder01", ice: "S_Ice02",
  mush: "I_C_Mushroom", neutral: "I_Opal", air: "S_Wind03", shadow: "S_Shadow02", star: "S_Shadow04",
  burn: "S_Fire02", poison: "S_Poison01", regen: "S_Holy02", slow: "S_Wind03", stun: "S_Light01", weaken: "S_Buff12",
  hp: "S_Holy01", heal: "S_Holy03", shield: "E_Metal04", range: "S_Bow09", quick: "S_Thunder06",
  coin: "I_GoldCoin", shard: "I_Jade", map: "I_Map", wait: "I_Clock", battle: "S_Magic08", shop: "I_GoldCoin", quest: "I_Scroll",
};
/** Each ability's own pack icon, so no two moves in a menu look alike. */
const ABILITY_PACK: Partial<Record<string, PackIcon>> = {
  shove: "S_Physic01", jump: "S_Wind07", dip: "S_Fire07", aim: "S_Bow09", douse: "S_Water04", hurl: "S_Earth05", zip: "S_Thunder05",
  puff: "S_Poison09", helpUp: "S_Holy06", ray: "S_Light01", flare: "S_Light02", prism: "I_Diamond", blink: "S_Magic02", mend: "P_Blue01",
  glow: "S_Holy04", ember: "S_Fire03", blaze: "S_Fire02", bite: "I_Fang", stomp: "S_Earth04", snare: "S_Poison06", splash: "S_Water03",
  undertow: "S_Water02", spark: "S_Thunder01", jolt: "S_Thunder04", chill: "S_Ice02", freeze: "S_Ice07", frostbite: "S_Ice03",
  shatter: "S_Ice04", glare: "S_Water06", slam: "S_Earth01", bulwark: "E_Metal04", tremor: "S_Earth07", cinder: "S_Fire04", blast: "S_Fire05", rockfall: "S_Earth02", forgeBreath: "S_Fire06", moltenCore: "E_Metal05", emberMend: "S_Fire01", dash: "S_Thunder06",
  spores: "S_Poison07", wilt: "S_Poison04", sapCap: "I_C_Mushroom", halo: "S_Holy07", dawn: "S_Holy05", sear: "S_Light04",
  dazzle: "S_Thunder03", sidestep: "S_Wind05", graceGlow: "S_Holy08", verdict: "S_Sword06", cleansingFlare: "S_Holy02",
  sapRay: "S_Poison08", sanctuary: "S_Holy09", purge: "S_Holy10", brand: "S_Fire08", sapBloom: "S_Poison05", sapCapRich: "S_Poison01",
  lighthouseWall: "E_Gold01", thunderhead: "S_Thunder07", myceliumNet: "S_Earth06",
  cleave: "S_Sword16", charge: "S_Sword01", kindle: "S_Fire01", warcry: "S_Buff02", rampart: "S_Buff01", rescue: "S_Buff03",
  inferno: "S_Fire06", finisher: "S_Sword17", arrow: "S_Bow01", volley: "S_Bow03", pin: "S_Bow12", gust: "S_Wind01", salve: "P_Green01",
  tailwind: "S_Wind02", smokeScreen: "S_Wind04", markedShot: "S_Bow11", arrowRain: "S_Bow08", lantern: "I_Torch01", oilFlask: "I_Bottle03",
  lastLantern: "I_Torch02", nightCut: "S_Shadow08", shadowStep: "S_Shadow11", charcoal: "S_Shadow13", firstNote: "S_Magic04",
  duet: "S_Magic01", unison: "S_Magic07",
};
/** Each item's pack icon (data/gear.ts ITEMS), for the shop, rewards and gear screens. */
export const ITEM_PACK: Partial<Record<string, PackIcon>> = {
  ashStaff: "W_Staff03", glassKnife: "W_Dagger002", emberRod: "W_Mace007", vineWhip: "W_Staff02", sunlance: "W_Gold_Spear",
  patchedCoat: "A_Clothing02", tileVest: "A_Armour01", tideCloak: "A_Clothing01", sapBark: "A_Armour03",
  bellCharm: "Ac_Medal02", featherCharm: "I_Feather01", hourglass: "I_Clock",
};
/** Each perk's pack icon (data/gear.ts PERKS). */
export const PERK_PACK: Partial<Record<string, PackIcon>> = {
  vigor: "S_Holy01", focus: "S_Magic02", might: "S_Buff08", stride: "A_Shoes02", quick: "S_Wind05", slip: "S_Buff04", ward: "E_Wood02",
  keepRemanso: "Ac_Necklace06", keepGuijo: "I_Rock02", keepCentella: "I_Scroll02", keepMoheda: "I_C_Mushroom",
};
/** Other run screens: rewards that are not items, the three difficulties, gear slots left empty, a job, a talk. */
export const RUN_PACK = {
  coins: "I_GoldCoin", shards: "I_Jade", heal: "P_Red01", easy: "I_Clover", normal: "W_Sword002", hard: "S_Shadow14", tier: "S_Poison05",
  weapon: "W_Sword001", armour: "A_Clothing02", charm: "Ac_Medal02", job: "W_Book05", chest: "I_Chest02", heroes: "A_Armour01",
} as const satisfies Record<string, PackIcon>;
export const pk = (name: PackIcon | undefined, fallback: IconId = "gear"): MenuIcon => (name ? `pk:${name}` : fallback);

/** A menu icon: one of the hand-drawn icons, or a pack icon by name ("pk:S_Fire03"). */
export type MenuIcon = IconId | `pk:${PackIcon}`;

let packSheet: HTMLImageElement | null = null;
/** Loads the pack's sheet; until it has loaded (or if it fails) the menus use the hand-drawn icons. */
export function loadPackIcons(base: string): Promise<void> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => { packSheet = img; urls.clear(); done(); };
    img.onerror = () => done();
    img.src = `${base}art/ui/icons.png`;
  });
}
function packUrl(name: PackIcon): string | null {
  if (!packSheet) return null;
  const key = `pk:${name}`, hit = urls.get(key);
  if (hit) return hit;
  // The pack draws each icon inside a 34 px cell with a 1 px margin: keep the 32 px middle, at 2x.
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!; g.imageSmoothingEnabled = false;
  g.drawImage(packSheet, PACK_CELLS[name] * PACK_CELL + 1, 1, 32, 32, 0, 0, 64, 64);
  const url = c.toDataURL();
  urls.set(key, url);
  return url;
}

/** The icon for each ability: the special moves get their own, the rest show their element. */
const ABILITY_ICON: Partial<Record<string, IconId>> = {
  shove: "push", hurl: "push", undertow: "push", jump: "jump", throw: "throw", helpUp: "heal", spare: "spare", aim: "range",
  blink: "quick", dash: "quick", sidestep: "quick", zip: "quick", bulwark: "shield", halo: "shield", sanctuary: "shield", lighthouseWall: "shield",
  mend: "heal", glow: "heal", graceGlow: "heal", sapCap: "heal", sapCapRich: "heal", dawn: "heal", purge: "heal",
};
export function abilityIcon(id: string, element: string): MenuIcon {
  const pk = ABILITY_PACK[id];
  if (pk && packSheet) return `pk:${pk}`;
  return ABILITY_ICON[id] ?? (element in ICONS ? (element as IconId) : "neutral");
}

const canvases = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

/** The icon as a 16x16 canvas (draw it scaled with image smoothing off). */
export function iconCanvas(id: IconId): HTMLCanvasElement {
  const hit = canvases.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!;
  ICONS[id].forEach((row, y) => [...row].forEach((ch, x) => {
    const col = PALETTE[ch];
    if (!col) return;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }));
  canvases.set(id, c);
  return c;
}

/** A data URL of the icon at 4x (32 px boxes at 2x screens stay sharp; CSS scales it down with pixelated edges).
    Menu icons that have a pack picture use it once the pack has loaded. */
export function iconUrl(id: MenuIcon): string {
  if (id.startsWith("pk:")) return packUrl(id.slice(3) as PackIcon) ?? iconUrl("neutral");
  const pk = PACK_FOR[id as IconId];
  if (pk) { const u = packUrl(pk); if (u) return u; }
  const hit = urls.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!; g.imageSmoothingEnabled = false;
  g.drawImage(iconCanvas(id as IconId), 0, 0, 64, 64);
  const url = c.toDataURL();
  urls.set(id, url);
  return url;
}

/** An <img> tag for an icon, for HTML strings. `cls` adds classes (e.g. "big"). */
export const icon = (id: MenuIcon, cls = "") => `<img class="ico${isPack(id) ? " pk" : ""}${cls ? ` ${cls}` : ""}" src="${iconUrl(id)}" alt="" draggable="false">`;
const isPack = (id: MenuIcon) => !!packSheet && (id.startsWith("pk:") || !!PACK_FOR[id as IconId]);

/** Emoji the texts and the map still use, and the pixel icon that stands in for each. */
export const EMOJI_ICON: Record<string, IconId> = {
  "💥": "boom", "💢": "boom", "🔥": "fire", "⚡": "bolt", "❄️": "ice", "❄": "ice", "💧": "water", "☠": "poison", "✚": "heal", "⛨": "shield", "🛡": "shield",
  "🤚": "hold", "🏳": "spare", "★": "rival", "⏳": "cooldown", "⚠": "danger", "◆": "shard", "🪙": "coin", "☀️": "light", "☀": "light",
  "🌿": "plant", "🪨": "stone", "🍄": "mush", "💫": "stun", "🐌": "slow", "⚔": "battle", "♛": "boss", "🗺": "map", "🎒": "gear",
  "📊": "stats", "☺": "recruit", "❖": "quest", "🛢": "barrel",
};
const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\uFE0F?`, "g");

/** Splits a text into plain parts and icons, in order. */
export function splitIcons(text: string): (string | { icon: IconId })[] {
  const out: (string | { icon: IconId })[] = [];
  let last = 0;
  // matchAll starts where the shared regex last stopped (a test() moves it), so rewind it first.
  EMOJI_RE.lastIndex = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ icon: EMOJI_ICON[m[1]!]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Swaps the emoji in every text under `root` for pixel icons (skips text that has none). */
export function iconize(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  // A text node added on its own is the root: the walker only visits what is under it.
  for (let n: Node | null = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode(); n; n = walker.nextNode()) {
    EMOJI_RE.lastIndex = 0;
    if (EMOJI_RE.test(n.nodeValue ?? "")) hits.push(n as Text);
  }
  for (const n of hits) {
    const parts = splitIcons(n.nodeValue ?? "");
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      if (typeof p === "string") { frag.append(p); continue; }
      const img = document.createElement("img");
      img.className = isPack(p.icon) ? "ico pk" : "ico"; img.src = iconUrl(p.icon); img.alt = ""; img.draggable = false;
      frag.append(img);
    }
    n.replaceWith(frag);
  }
}
