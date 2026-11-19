/* M1 battle screen: the hero against three foes on the meadow. You play the hero; the enemy AI plays the foes.
   Each command is saved as it happens, so reloading the page resumes the battle exactly where it was. */
import { ABILITIES } from "./data/abilities";
import { elementMultiplier, ELEMENTS } from "./data/elements";
import { COMPANIONS } from "./data/companions";
import { MEADOW } from "./data/maps/meadow";
import { HERO } from "./data/region";
import { TEST_UNITS } from "./data/units";
import { planTurn } from "./engine/ai";
import { abilityAvailable, areaTiles, castProblem, CRIT_MULT, MAX_REVIVES, damagePreview, directionBonus, maxRange, previewEffects, unitAbilities, type MovePreview } from "./engine/combat";
import { manhattan, Pos, sightBlock, TERRAIN, tileAt } from "./engine/grid";
import { reachable } from "./engine/movement";
import { dangerZone } from "./engine/threat";
import { isBorder, turnMp, wavering } from "./engine/escape";
import { STATUS } from "./engine/status";
import { rivalTaunt, rivalTitle } from "./run/rivals";
import { buy, choose, enterNode, finishBattle, leaveShop, newRun, regionOf, rulesOf, RUN_VERSION, shopHeal, upgradeRun, wear, type RunState } from "./run/run";
import { DIFFICULTY, REGIONS, type Difficulty } from "./data/region";
import { renderRunMap } from "./ui/runmap";
import { BattleSave, replay } from "./engine/save";
import {
  activeUnit, applyCommand, BattleEvent, BattleState, createBattle, Command, moveRules, roundOf, unitAt, unitById, upcomingTurns,
} from "./engine/state";
import { abilityDesc, abilityName, Lang, t, type TextKey } from "./i18n/text";
import { drawBattle, Floater, Images, isFlat, loadImages, mapPixelSize, Mark, Motion, motionMs, pickAt, portrait, setFlat, tileCenter, TW, View } from "./render/iso";

/** The run save: the run, with the battle being fought inside it. */
const RUN_KEY = "tac-tics.run.v1";
const LANG_KEY = "tac-tics.lang";
const VIEW_KEY = "tac-tics.view";
const FOE_STEP_MS = 380;
const WALK_STEP_MS = 190, PUSH_STEP_MS = 90, BLINK_MS = 320;
const MIN_TILE_PX = 58; // a tile narrower than this is hard to hit with a finger

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d")!;

let lang: Lang = (safeGet(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : "en");
let save: BattleSave;
let state: BattleState;
let images: Images;
let view: View = { ox: 0, oy: 0, scale: 1, rot: 0 };
let zoom = 0, panX = 0, panY = 0; // zoom 0 = pick a comfortable size on the first layout
let hover: Pos | null = null;
let selected: string | null = null;
/** On touch the first tap only chooses a tile; a second tap on it, or the Confirm button, carries the action out. */
let pending: Pos | null = null;
let busy = false;
let turnStart = 0;
/** Command counts at which the hero's turns began, for Rewind. */
let heroStarts: number[] = [];
/** Danger zone: one foe's (tapped) or every foe's (toggle). */
let inspect: string | null = null;
let dangerAll = false;
let focus: { id: string; until: number } | null = null;
let rewindArmed = 0;
const floaters: Floater[] = [];
const motions = new Map<string, Motion>();
let animUntil = 0; // input waits until units have finished moving
const animating = () => performance.now() < animUntil;

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: play without saving */ } }

const heroTurn = () => !state.winner && activeUnit(state).team === "heroes";

/** Replays a save one command at a time to rebuild the turn bookkeeping (where the current turn began, where each
    of the hero's turns began), so Undo and Rewind still work after a reload. */
function rebuild(commands: Command[]) {
  let s = replay(save.setup, []);
  turnStart = 0; heroStarts = s.winner || activeUnit(s).team !== "heroes" ? [] : [0];
  commands.forEach((cmd, i) => {
    const before = s.active;
    const r = applyCommand(s, cmd);
    if (!r.ok) throw new Error(`save is broken at command ${i}: ${r.error}`);
    s = r.state;
    if (s.active !== before) { turnStart = i + 1; if (!s.winner && activeUnit(s).team === "heroes") heroStarts.push(i + 1); }
  });
  state = s;
}

function resetView() { selected = null; pending = null; inspect = null; motions.clear(); animUntil = 0; tooltip(null); }

/* ---------- the run: map screen, entering nodes, closing battles ---------- */

let journey: RunState;
let gearOpen = false;
/** Map screen or battle screen. */
let onMap = true;

/** While true, the map shows the Easy / Normal / Hard choice instead of the run. */
let choosingDifficulty = false;

/** A new run starts with the difficulty choice; the run itself is made once the player picks. */
function startRun() {
  journey = newRun(`${Date.now()}`);
  choosingDifficulty = true;
  showMap();
}

function pickDifficulty(d: Difficulty) {
  journey = newRun(`${Date.now()}`, d);
  choosingDifficulty = false;
  showMap();
}

function renderDifficulty(panel: HTMLElement) {
  panel.style.display = "flex";
  const title = document.createElement("h2"); title.textContent = t(lang, "pickDifficulty");
  const list = document.createElement("div"); list.className = "cards";
  for (const d of Object.keys(DIFFICULTY) as Difficulty[]) {
    const b = document.createElement("button"); b.className = "card";
    const name = document.createElement("b"); name.textContent = t(lang, `diff.${d}`);
    const desc = document.createElement("span"); desc.textContent = t(lang, `diff.${d}.desc`);
    b.append(name, desc); b.onclick = () => pickDifficulty(d);
    list.append(b);
  }
  panel.replaceChildren(title, list);
}

function showMap() {
  onMap = true; busy = false;
  journey.battle = undefined;
  if (!choosingDifficulty) persist();
  resetView();
  $("runmap").style.display = "flex";
  $("overlay").style.display = "none";
  const update = (next: RunState) => { journey = next; showMap(); };
  const safely = (f: () => RunState) => { try { update(f()); } catch (e) { toast(t(lang, "tooPoor")); console.warn(e); } };
  renderRunMap($("runmap"), journey, lang, {
    pick: pickNode,
    choose: (i) => update(choose(journey, i)),
    buy: (id) => safely(() => buy(journey, id)),
    heal: () => safely(() => shopHeal(journey)),
    leave: () => update(leaveShop(journey)),
    wear: (id) => { journey = wear(journey, id); showMap(); },
    newRun: () => startRun(),
  }, gearOpen, () => { gearOpen = false; showMap(); });
  if (choosingDifficulty) renderDifficulty($("runPanel"));
  $<HTMLButtonElement>("newRun").textContent = t(lang, "newRun");
  $("gearBtn").textContent = `🎒 ${t(lang, "gear")}`;
  $("mapLang").textContent = lang === "es" ? "English" : "Español";
  document.documentElement.lang = lang;
}

let newRunArmed = 0;
/** Starting over throws the current run away: the button has to be pressed twice. */
function confirmNewRun(): boolean {
  if (performance.now() < newRunArmed) return true;
  newRunArmed = performance.now() + 3000;
  toast(t(lang, "newRunAgain"));
  return false;
}

function pickNode(id: number) {
  if (choosingDifficulty) return;
  const kind = journey.map.nodes[id]!.kind;
  const before = journey.heroHp;
  journey = enterNode(journey, id, lang);
  if (!journey.battle) { if (kind === "rest") toast(t(lang, "rested", { n: journey.heroHp - before })); showMap(); return; }
  startBattle(kind === "rival" || kind === "boss");
}

/** Shows the battle in `journey.battle` (new or loaded). */
function startBattle(announce: boolean) {
  onMap = false;
  $("runmap").style.display = "none";
  save = journey.battle!;
  rebuild(save.commands);
  resetView();
  persist(); refresh(); followHero();
  const rivals = journey.rivals.filter((r) => !r.settled && save.setup.units.some((u) => u.id === r.id));
  if (announce && rivals.length && !save.commands.length) toast(rivals.map((r) => rivalTaunt(r, lang)).join("\n"), 4500);
  maybeFoeTurn();
}

/** The overlay's button after a battle: back to the map, or a new run when this one is over. */
function afterBattleButton() {
  if (journey.over) { startRun(); return; }
  if (!journey.battle || !state.winner) return;
  const region = journey.region;
  journey = finishBattle(journey, state);
  if (journey.region !== region) { toast(t(lang, "newRegion", { name: regionOf(journey).name[lang] }), 3200); showMap(); return; }
  const sp = journey.spoils;
  if (sp && !journey.offers.length) toast(t(lang, "spoils", { c: sp.coins, x: sp.xp }) + (sp.shards ? t(lang, "spoilsShards", { s: sp.shards }) : "") + (sp.levels ? t(lang, "levelUp", { n: journey.hero.level }) : ""), 2600);
  showMap();
}

function loadOrNew() {
  const text = safeGet(RUN_KEY);
  if (text) {
    try {
      const saved = upgradeRun(JSON.parse(text) as RunState);
      if (saved.version !== RUN_VERSION) throw new Error(`unknown run version ${saved.version}`);
      journey = saved;
      if (journey.battle) { startBattle(false); toast(t(lang, "resume")); } else showMap();
      return;
    } catch (e) { console.warn("run save ignored:", e); }
  }
  startRun();
}

function persist() {
  if (!onMap && journey.battle) journey.battle = { ...save, node: journey.battle.node };
  safeSet(RUN_KEY, JSON.stringify(journey));
}

function run(cmd: Command): boolean {
  const before = state.active;
  const was = new Map(state.units.map((u) => [u.id, { ...u.pos }]));
  const r = applyCommand(state, cmd);
  if (!r.ok) { toast(r.error); return false; }
  state = r.state;
  animate(r.events, was);
  save.commands.push(cmd);
  if (state.active !== before) {
    turnStart = save.commands.length;
    if (!state.winner && activeUnit(state).team === "heroes") heroStarts.push(turnStart);
  }
  persist();
  showEvents(r.events, was);
  return true;
}

/** Turns the rules' events into trips for the renderer. The state already holds where everyone ends up. */
function animate(events: BattleEvent[], was: Map<string, Pos>) {
  const now = performance.now();
  const add = (unit: string, mo: Motion) => { motions.set(unit, mo); animUntil = Math.max(animUntil, now + motionMs(mo)); };
  for (const ev of events) {
    const from = was.get(ev.unit);
    if (!from) continue;
    if (ev.e === "moved" && ev.path.length) add(ev.unit, { points: [from, ...ev.path], born: now, stepMs: WALK_STEP_MS, kind: "walk" });
    if (ev.e !== "cast") continue;
    const caster = unitById(state, ev.unit);
    if (ABILITIES[ev.ability]?.teleport && (caster.pos.x !== from.x || caster.pos.y !== from.y)) {
      add(ev.unit, { points: [from, { ...caster.pos }], born: now, stepMs: BLINK_MS, kind: "blink" });
    }
    for (const h of ev.hits) {
      const start = was.get(h.unit);
      if (!h.pushedTo || !start) continue;
      const tiles = Math.max(1, manhattan(start, h.pushedTo));
      add(h.unit, { points: [start, h.pushedTo], born: now + 120, stepMs: PUSH_STEP_MS * tiles, kind: "slide" });
      animUntil = Math.max(animUntil, now + 120 + PUSH_STEP_MS * tiles);
    }
  }
}

function showEvents(events: BattleEvent[], was: Map<string, Pos>) {
  const now = performance.now();
  for (const ev of events) {
    if (ev.e === "escapeState" && ev.state !== "none") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: t(lang, ev.state === "flee" ? "fleeing" : "retreating"), color: "#ffc85a", born: now + 400 });
      continue;
    }
    if (ev.e === "refused") {
      const u = unitById(state, ev.unit);
      toast(t(lang, "refused", { name: u.name }), 2600);
      continue;
    }
    if (ev.e === "escaped") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: t(lang, "escapedTag"), color: "#ffc85a", born: now });
      toast(t(lang, "escapedToast", { name: u.name }));
      continue;
    }
    if (ev.e === "tick") {
      const u = unitById(state, ev.unit);
      const info = STATUS[ev.status];
      if (ev.damage) floaters.push({ pos: { ...u.pos }, text: `${info.icon} -${ev.damage}`, color: info.colour, born: now });
      if (ev.heal) floaters.push({ pos: { ...u.pos }, text: `${info.icon} +${ev.heal}`, color: info.colour, born: now });
      if (ev.downed || ev.died) floaters.push({ pos: { ...u.pos }, text: t(lang, ev.died ? "dead" : "downed"), color: "#ffffff", born: now + 300 });
      continue;
    }
    if (ev.e === "caughtFire") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: `🔥 ${t(lang, "st.burn")}`, color: STATUS.burn.colour, born: now });
      continue;
    }
    if (ev.e === "stunned") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: `${STATUS.stun.icon} ${t(lang, "st.stun")}`, color: STATUS.stun.colour, born: now });
      toast(t(lang, "stunnedToast", { name: u.name }));
      continue;
    }
    if (ev.e !== "cast") continue;
    for (const f of ev.fx) {
      const word = { ignite: "🔥", douse: "💨", freeze: "❄", melt: "💧", explode: `💥 ${t(lang, "boom")}`, break: `✕ ${t(lang, "broken")}`, slide: "", chain: "⚡" }[f.fx];
      if (word) floaters.push({ pos: { ...f.at }, text: word, color: f.fx === "explode" ? "#ffb347" : "#e8f4ff", born: now + (f.fx === "explode" ? 0 : 100) });
    }
    for (const h of ev.hits) {
      const u = unitById(state, h.unit);
      // A pushed unit gets its numbers where it lands, once it has slid there.
      const start = was.get(h.unit);
      const wait = h.pushedTo && start ? 120 + PUSH_STEP_MS * Math.max(1, manhattan(start, h.pushedTo)) : 0;
      const add = (text: string, color: string, delay = 0) => floaters.push({ pos: { ...u.pos }, text, color, born: now + wait + delay });
      const tag = h.source === "blast" ? "💥 " : h.source === "chain" ? "⚡ " : "";
      if (h.damage) add(`${tag}-${h.damage}${h.crit ? "!" : ""}`, h.crit ? "#ffd86b" : "#ff8a7a", h.source ? 200 : 0);
      if (h.heal) add(`+${h.heal}`, "#7ed957");
      if (h.revived) add(t(lang, "revived"), "#7ed957");
      if (h.maxHpLost) add(t(lang, "maxHpDown", { n: h.maxHpLost }), "#c9a0ff", 350);
      if (h.rooted) add(t(lang, "rooted"), "#b9e08a", 250);
      if (h.shielded) add(`${STATUS.shield.icon} ${h.shielded}`, STATUS.shield.colour, 150);
      for (const id of h.statuses ?? []) add(`${STATUS[id].icon} ${t(lang, `st.${id}` as TextKey)}`, STATUS[id].colour, 450);
      for (const id of h.cleansed ?? []) add(`${STATUS[id].icon} ✕`, "#8fd0ff", 450);
      if (h.downed) add(t(lang, "downed"), "#ffffff", 300);
      if (h.died) add(t(lang, "dead"), "#ffffff", 300);
    }
  }
  while (floaters.length > 40) floaters.shift();
}

async function maybeFoeTurn() {
  if (busy || onMap) return;
  busy = true; pending = null; tooltip(null); refresh();
  while (!state.winner && activeUnit(state).team === "foes") {
    for (const c of planTurn(state)) {
      await new Promise((ok) => setTimeout(ok, Math.max(FOE_STEP_MS, animUntil - performance.now() + 150)));
      if (run(c)) { refresh(); continue; }
      // Safety net: a foe whose plan is refused ends its turn, so the game can never hang on it.
      console.warn("AI command refused, ending its turn:", c);
      if (!run({ t: "endTurn", unit: activeUnit(state).id })) { busy = false; refresh(); return; }
      refresh();
      break;
    }
  }
  await new Promise((ok) => setTimeout(ok, Math.max(0, animUntil - performance.now())));
  busy = false; selected = null; pending = null; refresh(); followHero();
}

function canUndo() {
  if (!heroTurn() || busy || save.commands.length <= turnStart) return false;
  return save.commands.slice(turnStart).every((c) => c.t === "move");
}

function undo() {
  if (!canUndo()) return;
  save.commands.pop();
  motions.clear(); animUntil = 0;
  rebuild(save.commands);
  persist(); refresh();
}

/* ---------- rewind: back to the start of the hero's previous turn, once per battle ---------- */

function rewindTarget(): number | null {
  if (!heroTurn() || busy || (save.rewindsUsed ?? 0) >= rulesOf(journey).rewinds) return null;
  return heroStarts.length >= 2 ? heroStarts[heroStarts.length - 2]! : null;
}

function rewind() {
  const to = rewindTarget();
  if (to === null) return;
  if (performance.now() > rewindArmed) { rewindArmed = performance.now() + 3000; refresh(); setTimeout(refresh, 3100); return; }
  rewindArmed = 0;
  save.commands = save.commands.slice(0, to);
  save.rewindsUsed = (save.rewindsUsed ?? 0) + 1;
  rebuild(save.commands);
  resetView();
  persist(); refresh(); followHero();
  toast(t(lang, "rewound"));
}

/* ---------- danger zone ---------- */

let dangerCache: { key: string; tiles: Set<string> } | null = null;
function dangerTiles(): Set<string> | undefined {
  if (!inspect && !dangerAll) return undefined;
  const key = `${save.commands.length}|${JSON.stringify(save.commands[save.commands.length - 1] ?? null)}|${inspect}|${dangerAll}`;
  if (dangerCache?.key === key) return dangerCache.tiles;
  const tiles = new Set<string>();
  for (const f of state.units) {
    if (f.team !== "foes" || f.life !== "up" || (!dangerAll && f.id !== inspect)) continue;
    for (const k of dangerZone(state, f).keys()) tiles.add(k);
  }
  dangerCache = { key, tiles };
  return tiles;
}

/** Engine refusals in the player's language. */
function explain(why: string): string {
  const map: [string, TextKey][] = [
    ["outside the map", "err.outside"], ["out of range", "err.range"], ["no line of sight", "noSight"],
    ["needs an enemy", "err.foe"], ["needs a standing ally", "err.ally"], ["needs a downed ally", "err.downedAlly"],
    ["needs an empty tile", "err.empty"], ["not enough AP", "err.ap"], ["on cooldown", "err.cooldown"], ["already used", "err.used"],
  ];
  const hit = map.find(([k]) => why.startsWith(k));
  return hit ? t(lang, hit[1]) : why;
}

/* ---------- what the map highlights ---------- */

function marks(): Map<string, Mark> {
  const out = new Map<string, Mark>();
  if (!heroTurn() || busy) return out;
  const u = activeUnit(state);
  if (!selected) {
    for (const k of reachable(state.map, u.pos, moveRules(state, u)).keys()) out.set(k, "move");
    if (pending) out.set(`${pending.x},${pending.y}`, "chosen");
    return out;
  }
  const ab = ABILITIES[selected]!;
  for (let y = 0; y < state.map.h; y++) for (let x = 0; x < state.map.w; x++) {
    const p = { x, y }, d = manhattan(u.pos, p);
    if (d < ab.range[0] || d > maxRange(state, ab, u.pos, p)) continue;
    const why = castProblem(state, u, selected, p);
    out.set(`${x},${y}`, !why ? "target" : why === "no line of sight" || sightBlock(tileAt(state.map, p)!) > 0 ? "blocked" : "range");
  }
  const focus = pending ?? hover;
  if (focus && out.get(`${focus.x},${focus.y}`) === "target") for (const p of areaTiles(ab, focus)) out.set(`${p.x},${p.y}`, "area");
  if (pending) out.set(`${pending.x},${pending.y}`, "chosen");
  return out;
}

/* ---------- HUD ---------- */

function refresh() {
  if (onMap) return;
  const u = activeUnit(state);
  $("turn").textContent = `${t(lang, "round", { n: roundOf(state) })} · ${t(lang, "turnOf", { name: u.name })}`;
  $("stats").textContent = `${t(lang, "hp")} ${u.hp}/${u.maxHp} · ${t(lang, "ap")} ${u.ap}/${u.maxAp} · ${t(lang, "mp")} ${u.mp}/${u.maxMp}`;
  const queue = $("queue");
  queue.replaceChildren(document.createTextNode(`${t(lang, "upNext")}:`));
  upcomingTurns(state, 8).forEach((id, i) => {
    const v = unitById(state, id);
    const chip = document.createElement("button");
    chip.className = `chip ${v.team}${i === 0 ? " now" : ""}`;
    const face = portrait(images, v.look);
    chip.innerHTML = `${face ? `<img src="${face}" alt="">` : ""}<span>${v.life === "downed" ? `${v.name} ✚` : v.name}</span>`;
    chip.onclick = () => {
      // Find the unit: pan to it and make it pulse; for a foe, also show its reach.
      focus = { id: v.id, until: performance.now() + 1800 };
      if (v.team === "foes") inspect = v.id;
      centreOn(v.pos);
    };
    queue.append(chip);
  });
  const mine = heroTurn() && !busy;
  const bar = $("abilities");
  bar.replaceChildren();
  for (const id of unitAbilities(u)) {
    if (u.team !== "heroes") break;
    const ab = ABILITIES[id]!;
    const b = document.createElement("button");
    b.className = `ab${selected === id ? " on" : ""}`;
    const why = abilityAvailable(u, id);
    b.disabled = !mine || !!why;
    const cd = u.cooldowns[id];
    const dmg = ab.damage ? `${ab.damage.min}–${ab.damage.max}` : ab.heal ? `+${ab.heal.min}–${ab.heal.max}` : "";
    b.innerHTML = `<span>${abilityName(lang, id)}</span><small>${ab.ap} ${t(lang, "ap")} · ${ab.range[0]}–${ab.range[1]}${dmg ? " · " + dmg : ""}${cd ? " · ⏳" + t(lang, "cooldown", { n: cd }) : ""}</small>`;
    b.title = abilityDesc(lang, id);
    b.onclick = () => { selected = selected === id ? null : id; pending = null; inspect = null; tooltip(null); refresh(); };
    bar.append(b);
  }
  $<HTMLButtonElement>("end").disabled = !mine;
  $<HTMLButtonElement>("wait").disabled = !mine || u.spentAp || u.moved || u.waited;
  $<HTMLButtonElement>("undo").disabled = !canUndo();
  const rw = $<HTMLButtonElement>("rewind");
  const left = rulesOf(journey).rewinds - (save.rewindsUsed ?? 0);
  rw.disabled = rewindTarget() === null;
  rw.textContent = performance.now() < rewindArmed ? `⟲ ${t(lang, "rewindAgain")}` : `⟲ ${t(lang, "rewind")} (${left})`;
  rw.title = t(lang, "rewindHint");
  rw.classList.toggle("armed", performance.now() < rewindArmed);
  const dz = $("danger"); dz.textContent = `◈ ${t(lang, "danger")}`; dz.title = t(lang, "dangerHint"); dz.classList.toggle("on", dangerAll);
  const fl = $("flat"); fl.textContent = `▦ ${t(lang, "flat")}`; fl.title = t(lang, "flatHint"); fl.classList.toggle("on", isFlat());
  $("end").textContent = t(lang, "endTurn");
  $("wait").textContent = t(lang, "wait");
  $("wait").title = t(lang, "waitHint");
  $("undo").textContent = t(lang, "undo");
  $("rotate").textContent = `⟳ ${t(lang, "rotate")}`;
  $("lang").textContent = lang === "es" ? "English" : "Español";
  const confirm = $<HTMLButtonElement>("confirm");
  confirm.style.display = mine && pending ? "" : "none";
  confirm.textContent = selected ? `✔ ${abilityName(lang, selected)}` : `✔ ${t(lang, "moveHere")}`;
  $("cancel").style.display = mine && (pending || selected) ? "" : "none";
  $("cancel").textContent = t(lang, "cancel");
  $("act").style.bottom = `${$("bottom").getBoundingClientRect().height + 10}px`;
  $("hint").textContent = !mine ? t(lang, "hintFoe") : pending ? t(lang, "hintConfirm") : selected ? t(lang, "hintTarget") : `${t(lang, "hintMove")} ${t(lang, "foeTip")}`;
  const lost = state.winner === "foes" || state.units.some((x) => x.id === HERO.id && x.life !== "up");
  const boss = journey.battle && journey.map.nodes[journey.battle.node]!.kind === "boss";
  $("again").textContent = t(lang, lost ? "newRun" : boss ? "regionCleared" : "toMap");
  const over = $("overlay");
  over.style.display = state.winner && !onMap ? "flex" : "none";
  $("result").textContent = state.winner === "heroes" && !lost ? t(lang, "victory") : t(lang, "defeat");
  const escaped = state.units.filter((x) => x.team === "foes" && x.life === "escaped").length;
  $("resultNote").textContent = [escaped ? t(lang, "escapedNote", { n: escaped }) : "", lost ? t(lang, "runLost") : ""].filter(Boolean).join(" ");
  document.documentElement.lang = lang;
  layout();
}

/** Shows what is on a tile, with the damage the selected ability would deal there. Near the pointer for a mouse;
    above the tile for a finger, so the finger does not cover it. */
function tooltip(at: Pos | null, ev?: { clientX: number; clientY: number }) {
  const tip = $("tip");
  const u = heroTurn() ? activeUnit(state) : null;
  const target = at && unitAt(state, at);
  const ground = at ? tileInfo(at) : [];
  if (!at || (!target && !ground.length)) { tip.style.display = "none"; return; }
  if (!target) { showTip(tip, ground.join("<br>"), at, ev); return; }
  const hover = at;
  const lines = [`<b>${target.name}</b> · ${t(lang, "hp")} ${target.hp}/${target.maxHp}`];
  const rival = target.rival ? journey.rivals.find((r) => r.id === target.id && !r.settled) : undefined;
  if (rival) {
    lines.push(`<span class="rival">★ ${t(lang, "rival", { n: rival.level })} · ${rivalTitle(rival, lang)}</span>`);
    lines.push(rival.counters.map((c) => t(lang, `counter.${c.kind}` as TextKey, { element: c.element ? ELEMENTS[c.element][lang] : "" })).join(" · "));
  }
  const left = MAX_REVIVES - target.revives;
  lines.push(left > 0 ? t(lang, "revivesLeft", { n: left }) : `<span class="down">${t(lang, "lastFall")}</span>`);
  if (target.escape === "retreat") lines.push(`<b class="esc">${t(lang, "retreating")}</b> · ${t(lang, "retreatInfo")}`);
  else if (target.escape === "flee") lines.push(`<b class="esc">${t(lang, "fleeing")}</b> · ${t(lang, "fleeInfo")}`);
  if (target.escape !== "none" && target.life === "up" && isBorder(state, target.pos)) lines.push(`<b class="down">${t(lang, "leavesNext")}</b>`);
  // Companion lines the player has heard about: striking a fleeing foe crosses one.
  if (target.team === "foes" && target.escape === "flee") {
    for (const m of journey.party) {
      const c = COMPANIONS[m.id]!;
      if (m.known && (m.status === "with" || m.status === "leaving") && c.forbidden.includes("killFleeing")) lines.push(`<b class="down">⚠ ${c.forbiddenWarning[lang]}</b>`);
    }
  }
  for (const st of target.statuses) lines.push(`<span style="color:${STATUS[st.id].colour}">${STATUS[st.id].icon} ${t(lang, `st.${st.id}` as TextKey)}</span> · ${t(lang, `st.${st.id}.d` as TextKey, { n: st.power })} · ${t(lang, "turnsLeft", { n: st.turns })}`);
  if (wavering(target, roundOf(state))) lines.push(`<span class="esc">${t(lang, "waveringTag")}</span> · ${t(lang, "waverInfo")}`);
  if (u && selected && !castProblem(state, u, selected, hover)) {
    const ab = ABILITIES[selected]!;
    if (ab.damage && target.team !== u.team) {
      const base = damagePreview(state, u, target, ab), bump = previewMoves()?.moves.find((x) => x.unit === target.id)?.bump ?? 0;
      const r = { min: base.min + bump, max: base.max + bump };
      const m = elementMultiplier(ab.element, target.element);
      const dir = directionBonus(target, u.pos);
      lines.push(`${abilityName(lang, selected)}: <b>${r.min}–${r.max}</b>${m > 1 ? ` · ${t(lang, "strong")}` : m < 1 ? ` · ${t(lang, "weak")}` : ""}`);
      // Forecast: what is left of the target, and whether this can put it down.
      const lo = Math.max(0, target.hp - r.max), hi = Math.max(0, target.hp - r.min);
      lines.push(t(lang, "hpAfter", { a: lo === hi ? `${lo}` : `${lo}–${hi}` }));
      if (r.min >= target.hp) lines.push(`<b class="down">✖ ${t(lang, "downsIt")}</b>`);
      else if (r.max >= target.hp) lines.push(`<b class="down">✖ ${t(lang, "canDown")}</b>`);
      else if (Math.floor(r.max * CRIT_MULT) >= target.hp) lines.push(`<span class="down">${t(lang, "critDown")}</span>`);
      if (dir > 1.2) lines.push(t(lang, "back")); else if (dir > 1) lines.push(t(lang, "side"));
      const mv = previewMoves()?.moves.find((m) => m.unit === target.id);
      if (mv && (mv.to.x !== mv.from.x || mv.to.y !== mv.from.y || mv.bump)) lines.push(t(lang, mv.bump ? "pushBump" : "pushTo", { n: mv.bump }));
      lines.push(t(lang, "crit"));
    } else if (ab.heal) lines.push(`${abilityName(lang, selected)}: <b>+${ab.heal.min}–${ab.heal.max}</b>`);
  } else if (!selected && target.team === "foes") {
    // Foe info: its abilities, which are ready, and which could reach the hero next turn.
    const hero = state.units.find((h) => h.team === "heroes" && (h.life === "up" || h.life === "downed"));
    const zone = hero ? dangerZone(state, target).get(`${hero.pos.x},${hero.pos.y}`) ?? [] : [];
    lines.push(`${t(lang, "ap")} ${target.maxAp} · ${t(lang, "mp")} ${turnMp(target)}`);
    for (const id of target.abilities) {
      const ab = ABILITIES[id]!;
      const cd = target.cooldowns[id];
      const dmg = ab.damage ? ` ${ab.damage.min}–${ab.damage.max}` : "";
      const state_ = cd ? `⏳ ${t(lang, "cooldown", { n: cd })}` : t(lang, "ready");
      const leaves = ab.status ? ` · ${STATUS[ab.status.id].icon}` : "";
      lines.push(`${abilityName(lang, id)}${dmg}${leaves} · ${ab.range[0]}–${ab.range[1]} · ${state_}${zone.includes(id) ? ` · <b class="down">${t(lang, "reachesYou")}</b>` : ""}`);
    }
  }
  showTip(tip, [...lines, ...ground].join("<br>"), at, ev);
}

/** What the ground under a tile does: objects, fire, ice. */
function tileInfo(at: Pos): string[] {
  const tile = tileAt(state.map, at);
  if (!tile) return [];
  const out: string[] = [];
  if (tile.prop === "barrel") out.push(`<b>${t(lang, "barrel")}</b> · ${t(lang, "barrelInfo")}`);
  if (tile.prop === "crate") out.push(`<b>${t(lang, "crate")}</b> · ${t(lang, "crateInfo", { n: tile.propHp ?? 0 })}`);
  if ((tile.fireUntil ?? 0) > state.clock) out.push(`🔥 ${t(lang, "fireInfo")}`);
  if (tile.terrain === "ice") out.push(`❄ ${t(lang, "iceInfo")}`);
  if (tile.terrain === "bridge") out.push(t(lang, "bridgeInfo"));
  if (tile.terrain === "water") out.push(t(lang, "waterInfo"));
  return out;
}

function showTip(tip: HTMLElement, html: string, at: Pos, ev?: { clientX: number; clientY: number }) {
  tip.innerHTML = html;
  tip.style.display = "block";
  const spot = ev ?? screenOf(at);
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = ev ? spot.clientX + 14 : spot.clientX - w / 2;
  const y = ev ? spot.clientY + 14 : spot.clientY - h - 70 * view.scale / (window.devicePixelRatio || 1);
  tip.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

let toastTimer = 0;
function toast(msg: string, ms = 1600) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------- view: fit, zoom, pan, rotate ---------- */

function layout() {
  const dpr = window.devicePixelRatio || 1;
  // Size the drawing buffer to the box the canvas really fills. Mobile browsers can make 100vh taller than the
  // visible window (the address bar), which used to stretch the picture and put taps one tile too low.
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const top = $("top").getBoundingClientRect().height, bottom = $("bottom").getBoundingClientRect().height;
  const size = mapPixelSize(state.map);
  const availW = innerWidth - 16, availH = innerHeight - top - bottom - 8;
  const fit = Math.min(availW / size.w, availH / size.h);
  const base = fit >= 1 ? Math.floor(fit * 2) / 2 : fit; // whole or half steps keep pixel art crisp
  // On a phone the whole map fits only with tiles too small for a finger, so start closer in and let the player pan.
  if (zoom === 0) zoom = Math.min(2, Math.max(1, MIN_TILE_PX / (TW * base)));
  const scale = base * zoom * dpr;
  // Keep at least part of the map on screen whatever the pan.
  const halfW = (size.w * scale) / dpr / 2, halfH = (size.h * scale) / dpr / 2;
  panX = Math.max(-halfW - availW / 2 + 60, Math.min(halfW + availW / 2 - 60, panX));
  panY = Math.max(-halfH - availH / 2 + 60, Math.min(halfH + availH / 2 - 60, panY));
  view = { ...view, scale, ox: (canvas.width - size.w * scale) / 2 + panX * dpr, oy: top * dpr + (availH * dpr - size.h * scale) / 2 + panY * dpr };
}

/** Screen point to canvas pixels, measured from the canvas's real box so any CSS stretch is undone. */
function toCanvas(ev: { clientX: number; clientY: number }) {
  const box = canvas.getBoundingClientRect();
  return { x: (ev.clientX - box.left) * (canvas.width / box.width), y: (ev.clientY - box.top) * (canvas.height / box.height) };
}

function toMap(ev: { clientX: number; clientY: number }, slack = 0) {
  const c = toCanvas(ev);
  return pickAt(state.map, state.units, (c.x - view.ox) / view.scale, (c.y - view.oy) / view.scale, view.rot, slack);
}

function screenOf(p: Pos) {
  const c = tileCenter(state.map, p, view.rot), box = canvas.getBoundingClientRect();
  return { clientX: box.left + (c.x * view.scale + view.ox) * (box.width / canvas.width), clientY: box.top + (c.y * view.scale + view.oy) * (box.height / canvas.height) };
}

/** Pans so a tile sits in the middle of the free space between the bars. */
function centreOn(p: Pos) {
  const top = $("top").getBoundingClientRect().height, bottom = $("bottom").getBoundingClientRect().height;
  const now = screenOf(p);
  panX += innerWidth / 2 - now.clientX;
  panY += top + (innerHeight - top - bottom) / 2 - now.clientY;
  layout();
}

/** When the map is bigger than the screen, bring the hero into view as their turn starts. */
function followHero() {
  if (!heroTurn()) return;
  const pos = activeUnit(state).pos, p = screenOf(pos);
  const top = $("top").getBoundingClientRect().height, bottom = $("bottom").getBoundingClientRect().height;
  if (p.clientX < 60 || p.clientX > innerWidth - 60 || p.clientY < top + 80 || p.clientY > innerHeight - bottom - 40) centreOn(pos);
}

/* ---------- input ---------- */

/** What tapping tile `p` would do now, or why it can't. */
function actionAt(p: Pos): { cmd: Command } | { why: string } | null {
  const u = activeUnit(state);
  if (selected) {
    const why = castProblem(state, u, selected, p);
    return why ? { why: explain(why) } : { cmd: { t: "cast", unit: u.id, ability: selected, target: p } };
  }
  if (p.x === u.pos.x && p.y === u.pos.y) return null;
  if (reachable(state.map, u.pos, moveRules(state, u)).has(`${p.x},${p.y}`)) return { cmd: { t: "move", unit: u.id, to: p } };
  return unitAt(state, p) ? null : { why: t(lang, "cantReach") };
}

function act(cmd: Command) {
  const ok = run(cmd);
  if (cmd.t === "cast" && ok) selected = null;
  pending = null;
  refresh();
  if (cmd.t === "cast") maybeFoeTurn();
}

/** A mouse click acts at once (the hover already previewed it). A finger has no hover, so its first tap chooses
    the tile and shows what will happen; tapping it again or pressing Confirm does it. */
function onTap(p: Pos, touch: boolean) {
  if (!heroTurn() || busy || animating()) return;
  const a = actionAt(p);
  if (!a) {
    // Tapping a foe (no ability chosen) shows where it can strike next turn; tapping it again hides that.
    const who = unitAt(state, p);
    inspect = who && who.team === "foes" && inspect !== who.id ? who.id : null;
    pending = null; refresh(); tooltip(p); return;
  }
  if ("why" in a) { pending = null; refresh(); if (selected || touch) toast(a.why); tooltip(p); return; }
  if (!touch || (pending && pending.x === p.x && pending.y === p.y)) { act(a.cmd); tooltip(null); return; }
  pending = p; refresh(); tooltip(p);
}

function confirmPending() {
  if (!pending || !heroTurn() || busy || animating()) return;
  const a = actionAt(pending);
  if (a && "cmd" in a) act(a.cmd); else { pending = null; refresh(); }
  tooltip(null);
}

/** What the selected ability would move or set off at the tile under the finger or cursor (push preview). */
let effectsCache: { key: string; out: MovePreview | undefined } | null = null;
function previewMoves(): MovePreview | undefined {
  const at = pending ?? hover;
  if (!selected || !at || !heroTurn()) return undefined;
  const key = `${state.turns}:${state.active}:${selected}:${at.x},${at.y}:${state.units.map((u) => `${u.pos.x},${u.pos.y}`).join(";")}`;
  if (effectsCache?.key === key) return effectsCache.out;
  const u = activeUnit(state), ab = ABILITIES[selected]!;
  const tile = tileAt(state.map, at);
  let out: MovePreview | undefined;
  if ((ab.push || tile?.prop === "barrel" || areaTiles(ab, at).some((p) => tileAt(state.map, p)?.prop === "barrel")) && !castProblem(state, u, selected, at)) {
    out = previewEffects(state, u, ab, at);
    if (!out.moves.length && !out.blasts.length) out = undefined;
  }
  effectsCache = { key, out };
  return out;
}

/** The selected attack's predicted damage on the unit under the finger or cursor, for the health bar. */
function previewHit() {
  const at = pending ?? hover;
  if (!selected || !at || !heroTurn()) return undefined;
  const u = activeUnit(state), target = unitAt(state, at), ab = ABILITIES[selected]!;
  if (!target || !ab.damage || target.team === u.team || castProblem(state, u, selected, at)) return undefined;
  const r = damagePreview(state, u, target, ab), bump = previewMoves()?.moves.find((m) => m.unit === target.id)?.bump ?? 0;
  return { unit: target.id, min: r.min + bump, max: r.max + bump };
}

/** For each foe backing off or running: the way it would take to the nearest edge tile. */
let escapeCache: { s: BattleState; paths: Pos[][] } | null = null;
function escapePaths(): Pos[][] {
  if (escapeCache?.s === state) return escapeCache.paths;
  const paths: Pos[][] = [];
  for (const u of state.units) {
    if (u.team !== "foes" || u.life !== "up" || u.escape === "none") continue;
    let best: { cost: number; path: Pos[] } | null = null;
    for (const [k, r] of reachable(state.map, u.pos, { ...moveRules(state, u), mp: 99 })) {
      const [x, y] = k.split(",").map(Number);
      if (isBorder(state, { x: x!, y: y! }) && (!best || r.cost < best.cost)) best = r;
    }
    if (best && best.path.length) paths.push([{ ...u.pos }, ...best.path]);
  }
  escapeCache = { s: state, paths };
  return paths;
}

function frame(time: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d1f2b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (onMap) { requestAnimationFrame(frame); return; }
  const moving = time < animUntil;
  if (focus && time > focus.until) focus = null;
  drawBattle(ctx, state, images, view, {
    marks: moving ? new Map() : marks(), hover, active: state.active, time, floaters, motions,
    danger: dangerTiles(), preview: moving ? undefined : previewHit(), effects: moving ? undefined : previewMoves(), focus: focus?.id,
    escapePaths: moving ? undefined : escapePaths(),
  });
  requestAnimationFrame(frame);
}

async function start() {
  const base = import.meta.env.BASE_URL;
  const tiles = ["top-grass", "top-dirt", "top-water", "top-rock", "top-tree", "top-ice", "top-bridge", "side-left", "side-right", "obj-rock", "obj-tree"];
  const srcs: Record<string, string> = Object.fromEntries(tiles.map((k) => [k, `${base}art/iso/${k}.png`]));
  const looks = [...TEST_UNITS, ...Object.values(COMPANIONS).map((c) => c.spec), ...REGIONS.flatMap((r) => [...(r.natives ?? []), ...(r.boss.unit ? [r.boss.unit] : [])])];
  for (const u of looks) srcs[`unit-${u.look}`] = `${base}art/creatures/${u.look}.png`;
  images = await loadImages(srcs);
  setFlat(safeGet(VIEW_KEY) === "flat");
  // Until a battle starts (the map screen comes first), the battle screen holds the test fight, never shown.
  state = createBattle({ seed: 0, map: MEADOW, units: TEST_UNITS });
  loadOrNew();
  refresh();
  followHero();
  addEventListener("resize", layout);

  // One finger (or the mouse) taps or drags to pan; two fingers pinch to zoom.
  const touches = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; panX: number; panY: number; dragged: boolean } | null = null;
  let pinch: { dist: number; zoom: number } | null = null;
  const spread = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  canvas.addEventListener("pointerdown", (ev) => {
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) { pinch = { dist: spread(), zoom }; down = null; return; }
    down = { x: ev.clientX, y: ev.clientY, panX, panY, dragged: false };
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && touches.size === 2) {
      zoom = Math.min(3, Math.max(0.5, pinch.zoom * spread() / Math.max(1, pinch.dist)));
      layout(); return;
    }
    const touch = ev.pointerType !== "mouse";
    if (down && (ev.buttons || touch)) {
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > (touch ? 14 : 6)) { down.dragged = true; panX = down.panX + dx; panY = down.panY + dy; layout(); }
    }
    if (touch) return; // a finger has no hover: its tap shows the preview instead
    const h = toMap(ev);
    if (h?.x !== hover?.x || h?.y !== hover?.y) hover = h;
    tooltip(hover, ev);
  });
  const lift = (ev: PointerEvent) => {
    touches.delete(ev.pointerId);
    if (pinch) { if (touches.size === 0) pinch = null; down = null; return; }
    const tap = down && !down.dragged;
    down = null;
    if (!tap || ev.type === "pointercancel") return;
    const touch = ev.pointerType !== "mouse";
    const p = toMap(ev, touch ? 0.6 : 0);
    if (p) onTap(p, touch);
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") { hover = null; tooltip(null); } });
  canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); zoom = Math.min(3, Math.max(0.5, zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))); layout(); }, { passive: false });
  $("zoomIn").addEventListener("click", () => { zoom = Math.min(3, zoom * 1.25); layout(); });
  $("zoomOut").addEventListener("click", () => { zoom = Math.max(0.5, zoom / 1.25); layout(); });
  $("rotate").addEventListener("click", () => { view.rot = (view.rot + 1) % 4; });
  const pass = (t_: "endTurn" | "wait") => {
    if (!heroTurn() || busy || animating()) return;
    run({ t: t_, unit: activeUnit(state).id }); selected = null; pending = null; tooltip(null); refresh(); maybeFoeTurn();
  };
  $("end").addEventListener("click", () => pass("endTurn"));
  $("wait").addEventListener("click", () => pass("wait"));
  $("rewind").addEventListener("click", rewind);
  $("danger").addEventListener("click", () => { dangerAll = !dangerAll; refresh(); });
  $("flat").addEventListener("click", () => { setFlat(!isFlat()); safeSet(VIEW_KEY, isFlat() ? "flat" : "iso"); tooltip(null); refresh(); });
  $("undo").addEventListener("click", undo);
  $("confirm").addEventListener("click", confirmPending);
  $("cancel").addEventListener("click", () => { selected = null; pending = null; tooltip(null); refresh(); });
  $("again").addEventListener("click", afterBattleButton);
  $("gearBtn").addEventListener("click", () => { if (choosingDifficulty) return; gearOpen = !gearOpen; showMap(); });
  $("newRun").addEventListener("click", () => { if (journey.over || confirmNewRun()) startRun(); });
  $("mapLang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); showMap(); });
  $("lang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); refresh(); });
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") { selected = null; pending = null; inspect = null; tooltip(null); refresh(); } });
  requestAnimationFrame(frame);
  maybeFoeTurn();
  // Small hook for automated browser checks: where a tile is on screen, and the current state.
  Object.assign(window, { __tactics: {
    state: () => state,
    run: () => journey,
    setRun: (r: RunState) => { journey = r; showMap(); },
    pickNode: (id: number) => pickNode(id),
    marks: () => [...marks().entries()],
    select: (id: string | null) => { selected = id; refresh(); },
    pick: (x: number, y: number) => toMap({ clientX: x, clientY: y }),
    screenOf: (p: Pos) => { const c = screenOf(p); return { x: c.clientX, y: c.clientY }; },
  } });
}

start().catch((e) => { document.body.textContent = String(e); });
