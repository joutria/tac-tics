/* M0 test screen: the meadow map in isometric view. Every unit is moved by hand (no enemy AI until M1).
   Each command is saved as it happens, so reloading the page resumes the battle exactly where it was. */
import { MEADOW } from "./data/maps/meadow";
import { TEST_UNITS } from "./data/units";
import { reachable } from "./engine/movement";
import { BattleSave, fromJSON, replay, SAVE_VERSION, toJSON } from "./engine/save";
import { activeUnit, applyCommand, BattleSetup, BattleState, Command, unitAt } from "./engine/state";
import { Lang, t } from "./i18n/text";
import { drawBattle, Images, loadImages, mapPixelSize, pickTile, View } from "./render/iso";
import { Pos, samePos } from "./engine/grid";

const SAVE_KEY = "tac-tics.save";
const LANG_KEY = "tac-tics.lang";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d")!;

let lang: Lang = (safeGet(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : "en");
let save: BattleSave;
let state: BattleState;
let images: Images;
let view: View = { ox: 0, oy: 0, scale: 1 };
let hover: Pos | null = null;

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: play without saving */ } }

function newBattle() {
  const setup: BattleSetup = { seed: Date.now(), map: MEADOW, units: TEST_UNITS };
  save = { version: SAVE_VERSION, setup, commands: [] };
  state = replay(setup, []);
  persist();
}

function loadOrNew() {
  const text = safeGet(SAVE_KEY);
  if (text) {
    try { save = fromJSON(text); state = replay(save.setup, save.commands); return; } catch (e) { console.warn("save ignored:", e); }
  }
  newBattle();
}

function persist() { safeSet(SAVE_KEY, toJSON(save)); }

function run(cmd: Command) {
  const r = applyCommand(state, cmd);
  if (!r.ok) { toast(r.error); return; }
  state = r.state;
  save.commands.push(cmd);
  persist();
  updateHud();
}

function moves() {
  const u = activeUnit(state);
  return reachable(state.map, u.pos, { mp: u.mp, jump: u.jump, blocked: (p) => !!unitAt(state, p) && !samePos(p, u.pos) });
}

function updateHud() {
  const u = activeUnit(state);
  $("turn").textContent = `${t(lang, "round", { n: state.round })} · ${t(lang, "turnOf", { name: u.name })}`;
  $("stats").textContent = `${t(lang, "mp")} ${u.mp}/${u.maxMp} · ${t(lang, "ap")} ${u.ap}/${u.maxAp}`;
  $("end").textContent = t(lang, "endTurn");
  $("new").textContent = t(lang, "newBattle");
  $("lang").textContent = lang === "es" ? "English" : "Español";
  $("hint").textContent = t(lang, "hint");
  document.documentElement.lang = lang;
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 1800);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  const hud = $("hud").getBoundingClientRect().height;
  const size = mapPixelSize(state.map);
  const availW = innerWidth - 32, availH = innerHeight - hud - 16;
  // Whole-number zoom keeps the pixel art crisp; below 1x on very small screens, fall back to a fraction.
  const fit = Math.min(availW / size.w, availH / size.h);
  const scale = (fit >= 1 ? Math.floor(fit * 2) / 2 : fit) * dpr;
  view = { scale, ox: (canvas.width - size.w * scale) / 2, oy: hud * dpr + (availH * dpr - size.h * scale) / 2 };
}

function toMap(ev: PointerEvent) {
  const dpr = window.devicePixelRatio || 1;
  return pickTile(state.map, (ev.clientX * dpr - view.ox) / view.scale, (ev.clientY * dpr - view.oy) / view.scale);
}

function frame(time: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d1f2b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const highlight = state.winner ? new Set<string>() : new Set(moves().keys());
  drawBattle(ctx, state, images, view, { highlight, hover, active: activeUnit(state).id, time });
  requestAnimationFrame(frame);
}

async function start() {
  const base = import.meta.env.BASE_URL;
  const tiles = ["top-grass", "top-dirt", "top-water", "top-rock", "top-tree", "side-left", "side-right", "obj-rock", "obj-tree"];
  const srcs: Record<string, string> = Object.fromEntries(tiles.map((k) => [k, `${base}art/iso/${k}.png`]));
  for (const u of TEST_UNITS) srcs[`unit-${u.look}`] = `${base}art/creatures/${u.look}.png`;
  images = await loadImages(srcs);
  loadOrNew();
  if (save.commands.length) toast(t(lang, "resume"));
  updateHud(); resize();
  addEventListener("resize", resize);
  canvas.addEventListener("pointermove", (ev) => { hover = toMap(ev); });
  canvas.addEventListener("pointerdown", (ev) => {
    const p = toMap(ev);
    if (!p || state.winner) return;
    const u = activeUnit(state);
    if (moves().has(`${p.x},${p.y}`)) run({ t: "move", unit: u.id, to: p });
  });
  $("end").addEventListener("click", () => run({ t: "endTurn", unit: activeUnit(state).id }));
  $("new").addEventListener("click", () => { newBattle(); updateHud(); });
  $("lang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); updateHud(); resize(); });
  requestAnimationFrame(frame);
}

start().catch((e) => { document.body.textContent = String(e); });
