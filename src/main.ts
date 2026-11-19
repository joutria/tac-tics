/* M1 battle screen: the hero against three foes on the meadow. You play the hero; the enemy AI plays the foes.
   Each command is saved as it happens, so reloading the page resumes the battle exactly where it was. */
import { ABILITIES } from "./data/abilities";
import { elementMultiplier } from "./data/elements";
import { MEADOW } from "./data/maps/meadow";
import { TEST_UNITS } from "./data/units";
import { planTurn } from "./engine/ai";
import { abilityAvailable, areaTiles, castProblem, CRIT_MULT, damagePreview, directionBonus, maxRange, unitAbilities } from "./engine/combat";
import { manhattan, Pos, TERRAIN, tileAt } from "./engine/grid";
import { reachable } from "./engine/movement";
import { dangerZone } from "./engine/threat";
import { BattleSave, fromJSON, replay, SAVE_VERSION, toJSON } from "./engine/save";
import {
  activeUnit, applyCommand, BattleEvent, BattleSetup, BattleState, Command, moveRules, roundOf, unitAt, unitById, upcomingTurns,
} from "./engine/state";
import { abilityDesc, abilityName, Lang, t, type TextKey } from "./i18n/text";
import { drawBattle, Floater, Images, isFlat, loadImages, mapPixelSize, Mark, Motion, motionMs, pickAt, portrait, setFlat, tileCenter, TW, View } from "./render/iso";

const SAVE_KEY = "tac-tics.save.v2";
const LANG_KEY = "tac-tics.lang";
const VIEW_KEY = "tac-tics.view";
const REWINDS_PER_BATTLE = 1;
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

function newBattle() {
  const setup: BattleSetup = { seed: Date.now(), map: MEADOW, units: TEST_UNITS };
  save = { version: SAVE_VERSION, setup, commands: [], rewindsUsed: 0 };
  rebuild([]);
  resetView();
  persist(); refresh(); followHero(); maybeFoeTurn();
}

function loadOrNew() {
  const text = safeGet(SAVE_KEY);
  if (text) {
    try {
      save = fromJSON(text); rebuild(save.commands);
      toast(t(lang, "resume"));
      return;
    } catch (e) { console.warn("save ignored:", e); }
  }
  newBattle();
}

function persist() { safeSet(SAVE_KEY, toJSON(save)); }

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
    if (ev.e !== "cast") continue;
    for (const h of ev.hits) {
      const u = unitById(state, h.unit);
      // A pushed unit gets its numbers where it lands, once it has slid there.
      const start = was.get(h.unit);
      const wait = h.pushedTo && start ? 120 + PUSH_STEP_MS * Math.max(1, manhattan(start, h.pushedTo)) : 0;
      const add = (text: string, color: string, delay = 0) => floaters.push({ pos: { ...u.pos }, text, color, born: now + wait + delay });
      if (h.damage) add(`-${h.damage}${h.crit ? "!" : ""}`, h.crit ? "#ffd86b" : "#ff8a7a");
      if (h.heal) add(`+${h.heal}`, "#7ed957");
      if (h.revived) add(t(lang, "revived"), "#7ed957");
      if (h.rooted) add(t(lang, "rooted"), "#b9e08a", 250);
      if (h.downed) add(t(lang, "downed"), "#ffffff", 300);
      if (h.died) add(t(lang, "dead"), "#ffffff", 300);
    }
  }
  while (floaters.length > 40) floaters.shift();
}

async function maybeFoeTurn() {
  if (busy) return;
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
  if (!heroTurn() || busy || (save.rewindsUsed ?? 0) >= REWINDS_PER_BATTLE) return null;
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
    out.set(`${x},${y}`, !why ? "target" : why === "no line of sight" || TERRAIN[tileAt(state.map, p)!.terrain].blocksSight ? "blocked" : "range");
  }
  const focus = pending ?? hover;
  if (focus && out.get(`${focus.x},${focus.y}`) === "target") for (const p of areaTiles(ab, focus)) out.set(`${p.x},${p.y}`, "area");
  if (pending) out.set(`${pending.x},${pending.y}`, "chosen");
  return out;
}

/* ---------- HUD ---------- */

function refresh() {
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
  const left = REWINDS_PER_BATTLE - (save.rewindsUsed ?? 0);
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
  $("new").textContent = t(lang, "newBattle");
  $("rotate").textContent = `⟳ ${t(lang, "rotate")}`;
  $("lang").textContent = lang === "es" ? "English" : "Español";
  const confirm = $<HTMLButtonElement>("confirm");
  confirm.style.display = mine && pending ? "" : "none";
  confirm.textContent = selected ? `✔ ${abilityName(lang, selected)}` : `✔ ${t(lang, "moveHere")}`;
  $("cancel").style.display = mine && (pending || selected) ? "" : "none";
  $("cancel").textContent = t(lang, "cancel");
  $("act").style.bottom = `${$("bottom").getBoundingClientRect().height + 10}px`;
  $("hint").textContent = !mine ? t(lang, "hintFoe") : pending ? t(lang, "hintConfirm") : selected ? t(lang, "hintTarget") : `${t(lang, "hintMove")} ${t(lang, "foeTip")}`;
  $("again").textContent = t(lang, "playAgain");
  const over = $("overlay");
  over.style.display = state.winner ? "flex" : "none";
  $("result").textContent = state.winner === "heroes" ? t(lang, "victory") : t(lang, "defeat");
  document.documentElement.lang = lang;
  layout();
}

/** Shows what is on a tile, with the damage the selected ability would deal there. Near the pointer for a mouse;
    above the tile for a finger, so the finger does not cover it. */
function tooltip(at: Pos | null, ev?: { clientX: number; clientY: number }) {
  const tip = $("tip");
  const u = heroTurn() ? activeUnit(state) : null;
  const target = at && unitAt(state, at);
  if (!at || !target) { tip.style.display = "none"; return; }
  const hover = at;
  const lines = [`<b>${target.name}</b> · ${t(lang, "hp")} ${target.hp}/${target.maxHp}`];
  if (u && selected && !castProblem(state, u, selected, hover)) {
    const ab = ABILITIES[selected]!;
    if (ab.damage && target.team !== u.team) {
      const r = damagePreview(state, u, target, ab);
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
      lines.push(t(lang, "crit"));
    } else if (ab.heal) lines.push(`${abilityName(lang, selected)}: <b>+${ab.heal.min}–${ab.heal.max}</b>`);
  } else if (!selected && target.team === "foes") {
    // Foe info: its abilities, which are ready, and which could reach the hero next turn.
    const hero = state.units.find((h) => h.team === "heroes" && h.life !== "dead");
    const zone = hero ? dangerZone(state, target).get(`${hero.pos.x},${hero.pos.y}`) ?? [] : [];
    lines.push(`${t(lang, "ap")} ${target.maxAp} · ${t(lang, "mp")} ${target.maxMp}`);
    for (const id of target.abilities) {
      const ab = ABILITIES[id]!;
      const cd = target.cooldowns[id];
      const dmg = ab.damage ? ` ${ab.damage.min}–${ab.damage.max}` : "";
      const state_ = cd ? `⏳ ${t(lang, "cooldown", { n: cd })}` : t(lang, "ready");
      lines.push(`${abilityName(lang, id)}${dmg} · ${ab.range[0]}–${ab.range[1]} · ${state_}${zone.includes(id) ? ` · <b class="down">${t(lang, "reachesYou")}</b>` : ""}`);
    }
  }
  tip.innerHTML = lines.join("<br>");
  tip.style.display = "block";
  const spot = ev ?? screenOf(at);
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = ev ? spot.clientX + 14 : spot.clientX - w / 2;
  const y = ev ? spot.clientY + 14 : spot.clientY - h - 70 * view.scale / (window.devicePixelRatio || 1);
  tip.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 1600);
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

/** The selected attack's predicted damage on the unit under the finger or cursor, for the health bar. */
function previewHit() {
  const at = pending ?? hover;
  if (!selected || !at || !heroTurn()) return undefined;
  const u = activeUnit(state), target = unitAt(state, at), ab = ABILITIES[selected]!;
  if (!target || !ab.damage || target.team === u.team || castProblem(state, u, selected, at)) return undefined;
  return { unit: target.id, ...damagePreview(state, u, target, ab) };
}

function frame(time: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d1f2b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const moving = time < animUntil;
  if (focus && time > focus.until) focus = null;
  drawBattle(ctx, state, images, view, {
    marks: moving ? new Map() : marks(), hover, active: state.active, time, floaters, motions,
    danger: dangerTiles(), preview: moving ? undefined : previewHit(), focus: focus?.id,
  });
  requestAnimationFrame(frame);
}

async function start() {
  const base = import.meta.env.BASE_URL;
  const tiles = ["top-grass", "top-dirt", "top-water", "top-rock", "top-tree", "side-left", "side-right", "obj-rock", "obj-tree"];
  const srcs: Record<string, string> = Object.fromEntries(tiles.map((k) => [k, `${base}art/iso/${k}.png`]));
  for (const u of TEST_UNITS) srcs[`unit-${u.look}`] = `${base}art/creatures/${u.look}.png`;
  images = await loadImages(srcs);
  setFlat(safeGet(VIEW_KEY) === "flat");
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
  $("new").addEventListener("click", newBattle);
  $("again").addEventListener("click", newBattle);
  $("lang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); refresh(); });
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") { selected = null; pending = null; inspect = null; tooltip(null); refresh(); } });
  requestAnimationFrame(frame);
  maybeFoeTurn();
  // Small hook for automated browser checks: where a tile is on screen, and the current state.
  Object.assign(window, { __tactics: {
    state: () => state,
    marks: () => [...marks().entries()],
    select: (id: string | null) => { selected = id; refresh(); },
    pick: (x: number, y: number) => toMap({ clientX: x, clientY: y }),
    screenOf: (p: Pos) => { const c = screenOf(p); return { x: c.clientX, y: c.clientY }; },
  } });
}

start().catch((e) => { document.body.textContent = String(e); });
