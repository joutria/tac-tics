/* M1 battle screen: the hero against three foes on the meadow. You play the hero; the enemy AI plays the foes.
   Each command is saved as it happens, so reloading the page resumes the battle exactly where it was. */
import { ABILITIES } from "./data/abilities";
import { elementMultiplier } from "./data/elements";
import { MEADOW } from "./data/maps/meadow";
import { TEST_UNITS } from "./data/units";
import { planTurn } from "./engine/ai";
import { abilityAvailable, areaTiles, castProblem, damagePreview, directionBonus, maxRange, unitAbilities } from "./engine/combat";
import { manhattan, Pos } from "./engine/grid";
import { reachable } from "./engine/movement";
import { BattleSave, fromJSON, replay, SAVE_VERSION, toJSON } from "./engine/save";
import {
  activeUnit, applyCommand, BattleEvent, BattleSetup, BattleState, Command, moveRules, roundOf, unitAt, unitById, upcomingTurns,
} from "./engine/state";
import { abilityDesc, abilityName, Lang, t } from "./i18n/text";
import { drawBattle, Floater, Images, loadImages, mapPixelSize, Mark, pickTile, tileCenter, View } from "./render/iso";

const SAVE_KEY = "tac-tics.save.v2";
const LANG_KEY = "tac-tics.lang";
const FOE_STEP_MS = 380;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d")!;

let lang: Lang = (safeGet(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : "en");
let save: BattleSave;
let state: BattleState;
let images: Images;
let view: View = { ox: 0, oy: 0, scale: 1, rot: 0 };
let zoom = 1, panX = 0, panY = 0;
let hover: Pos | null = null;
let selected: string | null = null;
let busy = false;
let turnStart = 0;
const floaters: Floater[] = [];

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: play without saving */ } }

const heroTurn = () => !state.winner && activeUnit(state).team === "heroes";

function newBattle() {
  const setup: BattleSetup = { seed: Date.now(), map: MEADOW, units: TEST_UNITS };
  save = { version: SAVE_VERSION, setup, commands: [] };
  state = replay(setup, []);
  turnStart = 0; selected = null;
  persist(); refresh(); maybeFoeTurn();
}

function loadOrNew() {
  const text = safeGet(SAVE_KEY);
  if (text) {
    try {
      save = fromJSON(text); state = replay(save.setup, save.commands);
      turnStart = save.commands.length;
      toast(t(lang, "resume"));
      return;
    } catch (e) { console.warn("save ignored:", e); }
  }
  newBattle();
}

function persist() { safeSet(SAVE_KEY, toJSON(save)); }

function run(cmd: Command): boolean {
  const before = state.active;
  const r = applyCommand(state, cmd);
  if (!r.ok) { toast(r.error); return false; }
  state = r.state;
  save.commands.push(cmd);
  if (state.active !== before) turnStart = save.commands.length;
  persist();
  showEvents(r.events);
  return true;
}

function showEvents(events: BattleEvent[]) {
  const now = performance.now();
  for (const ev of events) {
    if (ev.e !== "cast") continue;
    for (const h of ev.hits) {
      const u = unitById(state, h.unit);
      const add = (text: string, color: string, delay = 0) => floaters.push({ pos: { ...u.pos }, text, color, born: now + delay });
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
  busy = true; refresh();
  while (!state.winner && activeUnit(state).team === "foes") {
    for (const c of planTurn(state)) {
      await new Promise((ok) => setTimeout(ok, FOE_STEP_MS));
      if (!run(c)) break;
      refresh();
    }
  }
  busy = false; selected = null; refresh();
}

function canUndo() {
  if (!heroTurn() || busy || save.commands.length <= turnStart) return false;
  return save.commands.slice(turnStart).every((c) => c.t === "move");
}

function undo() {
  if (!canUndo()) return;
  save.commands.pop();
  state = replay(save.setup, save.commands);
  persist(); refresh();
}

/* ---------- what the map highlights ---------- */

function marks(): Map<string, Mark> {
  const out = new Map<string, Mark>();
  if (!heroTurn() || busy) return out;
  const u = activeUnit(state);
  if (!selected) {
    for (const k of reachable(state.map, u.pos, moveRules(state, u)).keys()) out.set(k, "move");
    return out;
  }
  const ab = ABILITIES[selected]!;
  for (let y = 0; y < state.map.h; y++) for (let x = 0; x < state.map.w; x++) {
    const p = { x, y }, d = manhattan(u.pos, p);
    if (d < ab.range[0] || d > maxRange(state, ab, u.pos, p)) continue;
    out.set(`${x},${y}`, castProblem(state, u, selected, p) ? "range" : "target");
  }
  if (hover && out.get(`${hover.x},${hover.y}`) === "target") for (const p of areaTiles(ab, hover)) out.set(`${p.x},${p.y}`, "area");
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
    const chip = document.createElement("span");
    chip.className = `chip ${v.team}${i === 0 ? " now" : ""}`;
    chip.textContent = v.life === "downed" ? `${v.name} ✚` : v.name;
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
    b.onclick = () => { selected = selected === id ? null : id; refresh(); };
    bar.append(b);
  }
  $<HTMLButtonElement>("end").disabled = !mine;
  $<HTMLButtonElement>("wait").disabled = !mine || u.spentAp || u.moved || u.waited;
  $<HTMLButtonElement>("undo").disabled = !canUndo();
  $("end").textContent = t(lang, "endTurn");
  $("wait").textContent = t(lang, "wait");
  $("wait").title = t(lang, "waitHint");
  $("undo").textContent = t(lang, "undo");
  $("new").textContent = t(lang, "newBattle");
  $("rotate").textContent = `⟳ ${t(lang, "rotate")}`;
  $("lang").textContent = lang === "es" ? "English" : "Español";
  $("hint").textContent = !mine ? t(lang, "hintFoe") : selected ? t(lang, "hintTarget") : t(lang, "hintMove");
  $("again").textContent = t(lang, "playAgain");
  const over = $("overlay");
  over.style.display = state.winner ? "flex" : "none";
  $("result").textContent = state.winner === "heroes" ? t(lang, "victory") : t(lang, "defeat");
  document.documentElement.lang = lang;
  layout();
}

function tooltip(ev: PointerEvent) {
  const tip = $("tip");
  const u = heroTurn() ? activeUnit(state) : null;
  const target = hover && unitAt(state, hover);
  if (!hover || !target) { tip.style.display = "none"; return; }
  const lines = [`<b>${target.name}</b> · ${t(lang, "hp")} ${target.hp}/${target.maxHp}`];
  if (u && selected && !castProblem(state, u, selected, hover)) {
    const ab = ABILITIES[selected]!;
    if (ab.damage && target.team !== u.team) {
      const r = damagePreview(state, u, target, ab);
      const m = elementMultiplier(ab.element, target.element);
      const dir = directionBonus(target, u.pos);
      lines.push(`${abilityName(lang, selected)}: <b>${r.min}–${r.max}</b>${m > 1 ? ` · ${t(lang, "strong")}` : m < 1 ? ` · ${t(lang, "weak")}` : ""}`);
      if (dir > 1.2) lines.push(t(lang, "back")); else if (dir > 1) lines.push(t(lang, "side"));
      lines.push(t(lang, "crit"));
    } else if (ab.heal) lines.push(`${abilityName(lang, selected)}: <b>+${ab.heal.min}–${ab.heal.max}</b>`);
  }
  tip.innerHTML = lines.join("<br>");
  tip.style.display = "block";
  tip.style.left = `${Math.min(ev.clientX + 14, innerWidth - 250)}px`;
  tip.style.top = `${ev.clientY + 14}px`;
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 1600);
}

/* ---------- view: fit, zoom, pan, rotate ---------- */

function layout() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  const top = $("top").getBoundingClientRect().height, bottom = $("bottom").getBoundingClientRect().height;
  const size = mapPixelSize(state.map);
  const availW = innerWidth - 16, availH = innerHeight - top - bottom - 8;
  const fit = Math.min(availW / size.w, availH / size.h);
  const base = fit >= 1 ? Math.floor(fit * 2) / 2 : fit; // whole or half steps keep pixel art crisp
  const scale = base * zoom * dpr;
  view = { ...view, scale, ox: (canvas.width - size.w * scale) / 2 + panX * dpr, oy: top * dpr + (availH * dpr - size.h * scale) / 2 + panY * dpr };
}

function toMap(ev: PointerEvent | MouseEvent) {
  const dpr = window.devicePixelRatio || 1;
  return pickTile(state.map, (ev.clientX * dpr - view.ox) / view.scale, (ev.clientY * dpr - view.oy) / view.scale, view.rot);
}

/* ---------- input ---------- */

function onTap(p: Pos) {
  if (!heroTurn() || busy) return;
  const u = activeUnit(state);
  if (selected) {
    if (!castProblem(state, u, selected, p)) {
      run({ t: "cast", unit: u.id, ability: selected, target: p });
      selected = null;
      refresh(); maybeFoeTurn();
    }
    return;
  }
  if (reachable(state.map, u.pos, moveRules(state, u)).has(`${p.x},${p.y}`)) { run({ t: "move", unit: u.id, to: p }); refresh(); }
}

function frame(time: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d1f2b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawBattle(ctx, state, images, view, { marks: marks(), hover, active: state.active, time, floaters });
  requestAnimationFrame(frame);
}

async function start() {
  const base = import.meta.env.BASE_URL;
  const tiles = ["top-grass", "top-dirt", "top-water", "top-rock", "top-tree", "side-left", "side-right", "obj-rock", "obj-tree"];
  const srcs: Record<string, string> = Object.fromEntries(tiles.map((k) => [k, `${base}art/iso/${k}.png`]));
  for (const u of TEST_UNITS) srcs[`unit-${u.look}`] = `${base}art/creatures/${u.look}.png`;
  images = await loadImages(srcs);
  loadOrNew();
  refresh();
  addEventListener("resize", layout);

  let down: { x: number; y: number; panX: number; panY: number; dragged: boolean } | null = null;
  canvas.addEventListener("pointerdown", (ev) => { down = { x: ev.clientX, y: ev.clientY, panX, panY, dragged: false }; });
  canvas.addEventListener("pointermove", (ev) => {
    if (down && (ev.buttons || ev.pointerType === "touch")) {
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) { down.dragged = true; panX = down.panX + dx; panY = down.panY + dy; layout(); }
    }
    const h = toMap(ev);
    if (h?.x !== hover?.x || h?.y !== hover?.y) hover = h;
    tooltip(ev);
  });
  canvas.addEventListener("pointerup", (ev) => {
    const tap = down && !down.dragged;
    down = null;
    const p = toMap(ev);
    if (tap && p) { hover = p; onTap(p); tooltip(ev); }
  });
  canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); zoom = Math.min(3, Math.max(0.5, zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))); layout(); }, { passive: false });
  $("zoomIn").addEventListener("click", () => { zoom = Math.min(3, zoom * 1.25); layout(); });
  $("zoomOut").addEventListener("click", () => { zoom = Math.max(0.5, zoom / 1.25); layout(); });
  $("rotate").addEventListener("click", () => { view.rot = (view.rot + 1) % 4; });
  $("end").addEventListener("click", () => { if (heroTurn()) { run({ t: "endTurn", unit: activeUnit(state).id }); selected = null; refresh(); maybeFoeTurn(); } });
  $("wait").addEventListener("click", () => { if (heroTurn()) { run({ t: "wait", unit: activeUnit(state).id }); selected = null; refresh(); maybeFoeTurn(); } });
  $("undo").addEventListener("click", undo);
  $("new").addEventListener("click", newBattle);
  $("again").addEventListener("click", newBattle);
  $("lang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); refresh(); });
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") { selected = null; refresh(); } });
  requestAnimationFrame(frame);
  maybeFoeTurn();
  // Small hook for automated browser checks: where a tile is on screen, and the current state.
  Object.assign(window, { __tactics: {
    state: () => state,
    marks: () => [...marks().entries()],
    select: (id: string | null) => { selected = id; refresh(); },
    screenOf: (p: Pos) => { const c = tileCenter(state.map, p, view.rot); const dpr = window.devicePixelRatio || 1; return { x: (c.x * view.scale + view.ox) / dpr, y: (c.y * view.scale + view.oy) / dpr }; },
  } });
}

start().catch((e) => { document.body.textContent = String(e); });
