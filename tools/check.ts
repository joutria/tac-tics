/* Data checker, in the spirit of Evolvlings' tools/check.js. Run with `npm run check`.
   It fails (exit 1) when game data is inconsistent, so mistakes show up before anyone plays. */
import { existsSync } from "node:fs";
import { ELEMENTS, ELEMENT_IDS, BEATS } from "../src/data/elements";
import { MEADOW } from "../src/data/maps/meadow";
import { TEST_UNITS } from "../src/data/units";
import { TERRAIN, tileAt } from "../src/engine/grid";
import { TEXT } from "../src/i18n/text";
import { ABILITIES } from "../src/data/abilities";
import { EPITHETS, TAUNTS, TITLES } from "../src/data/rivals";

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// Texts: both languages have the same keys and no empty strings.
const es = Object.keys(TEXT.es), en = Object.keys(TEXT.en);
for (const k of es) if (!en.includes(k)) fail(`text "${k}" is missing in English`);
for (const k of en) if (!es.includes(k)) fail(`text "${k}" is missing in Spanish`);
for (const [lang, table] of Object.entries(TEXT)) for (const [k, v] of Object.entries(table)) if (!v) fail(`text "${k}" is empty in ${lang}`);

// Rival lines: filled in both languages, and placeholders match.
for (const [where, line] of [...EPITHETS.map((l, i) => [`epithet ${i}`, l] as const), ...Object.entries(TITLES), ...Object.entries(TAUNTS)]) {
  if (!line.es || !line.en) fail(`rival ${where}: empty in a language`);
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  if (vars(line.es) !== vars(line.en)) fail(`rival ${where}: placeholders differ between languages`);
}

// Abilities: every one has a name and description in both languages, sane numbers, and every unit's exist.
for (const [id, ab] of Object.entries(ABILITIES)) {
  if (ab.id !== id) fail(`ability ${id} has id ${ab.id}`);
  for (const k of [`ab.${id}`, `ab.${id}.d`]) if (!(k in TEXT.es)) fail(`ability ${id} has no text "${k}"`);
  if (ab.range[0] > ab.range[1]) fail(`ability ${id}: range min above max`);
  if (ab.damage && ab.damage.min > ab.damage.max) fail(`ability ${id}: damage min above max`);
  if (ab.ap <= 0 || ab.perTurn <= 0) fail(`ability ${id}: AP and uses per turn must be positive`);
}
for (const u of TEST_UNITS) for (const a of u.abilities) if (!ABILITIES[a]) fail(`unit ${u.id} has unknown ability ${a}`);

// Elements: opposites point both ways; every circle element beats exactly one other.
for (const e of ELEMENT_IDS) {
  const opp = ELEMENTS[e].opp;
  if (opp && ELEMENTS[opp].opp !== e) fail(`element ${e}: opposite ${opp} does not point back`);
  if (ELEMENTS[e].circle && !BEATS[e]) fail(`element ${e} beats nothing`);
}

// Maps and units.
for (const m of [MEADOW]) {
  if (m.tiles.length !== m.w * m.h) fail(`map ${m.id}: tile count does not match its size`);
  const ids = new Set<string>();
  for (const u of TEST_UNITS) {
    if (ids.has(u.id)) fail(`unit id ${u.id} is used twice`);
    ids.add(u.id);
    const tile = tileAt(m, u.pos);
    if (!tile || !TERRAIN[tile.terrain].walkable) fail(`unit ${u.id} starts on a tile it cannot stand on in ${m.id}`);
    if (!ELEMENTS[u.element]) fail(`unit ${u.id} has unknown element ${u.element}`);
    if (!existsSync(`public/art/creatures/${u.look}.png`)) fail(`unit ${u.id}: missing art public/art/creatures/${u.look}.png`);
  }
}

// Isometric tiles the renderer needs.
for (const t of Object.keys(TERRAIN)) if (!existsSync(`public/art/iso/top-${t}.png`)) fail(`missing tile art public/art/iso/top-${t}.png`);

if (problems.length) {
  console.error(`check: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("check: all good");
