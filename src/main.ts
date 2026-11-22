/* M1 battle screen: the hero against three foes on the meadow. You play the hero; the enemy AI plays the foes.
   Each command is saved as it happens, so reloading the page resumes the battle exactly where it was. */
import { inWater, nativeSwimmer, swimProblem } from "./engine/swim";
import { startUpdates } from "./app/update";
import { AUDIO_KEY, audioSettings, battleSounds, initAudio, playMusic, readAudioSettings, setAudio, sfx } from "./audio/sound";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/jacquard-12/400.css";
import { ABILITIES, type Ability } from "./data/abilities";
import { elementMultiplier, ELEMENTS } from "./data/elements";
import { COMPANIONS } from "./data/companions";
import { MEADOW } from "./data/maps/meadow";
import { HERO } from "./data/region";
import { TEST_UNITS } from "./data/units";
import { planTurn } from "./engine/ai";
import { abilityAvailable, areaTiles, castProblem, comboProblem, guardAbility, CRIT_MULT, MAX_REVIVES, damagePreview, damageParts, type DamagePart, maxRange, previewEffects, unitAbilities, type MovePreview } from "./engine/combat";
import { manhattan, Pos, rockSizeOf, sightBlock, TERRAIN, tileAt, type GridMap } from "./engine/grid";
import { reachable } from "./engine/movement";
import { heightShapesReach, reachAt, reachBound, type Reach } from "./engine/reach";
import { dangerZone } from "./engine/threat";
import { actionCost, manaCost, setRules, usesMana } from "./engine/rules";
import { cowering, isBorder, turnMp, wavering, yielding } from "./engine/escape";
import { STATUS } from "./engine/status";
import { charged } from "./engine/terrain";
import { rivalName, rivalTaunt, rivalTitle } from "./run/rivals";
import { carriedNemesis, carriedReturn, closeRun, hasMilestone, keepsakeOf, keepsakesOpen, kitOf, newLegacy, type Legacy } from "./run/legacy";
import { KITS, LORE, MILESTONE_HINT } from "./data/camp";
import { buy, choose, enterNode, fielded, finishBattle, helpLine, heroOf, leaveShop, newRun, nextNodes, regionOf, rulesOf, RUN_VERSION, shopHeal, upgradeRun, wear, wearTwin, type RunState } from "./run/run";
import { aheadOf, choices } from "./run/map";
import { memberSpec } from "./run/party";
import { deployUnit, deployZone } from "./run/deploy";
import { approachScene, departScene, placeOf, type Origin, type Scene } from "./run/travel";
import { routeGrid, type RouteGrid } from "./ui/worldmap";
import { DIFFICULTY, REGIONS, SAP_TIERS, type Difficulty } from "./data/region";
import { alignShiftText, iconTile, nodeLabel, renderRunMap } from "./ui/runmap";
import { abilityIcon, icon, iconCanvas, iconize, ICONS, iconUrl, loadPackIcons, pk, RUN_PACK, type IconId } from "./ui/icons";
import { BUILD } from "./app/update";
import { hideTitle, showTitle, titleBack, titleButtons, titleOpen, type TitleOptions } from "./ui/title";
import { record, renderStats } from "./ui/stats";
import { logBattle, logBuy, logChoice, logNode, logRunEnd, logRunStart, logShopHeal, logShopLeave, logWear, PLAYER } from "./run/playlog";
import { BattleSave, replay } from "./engine/save";
import {
  activeUnit, applyCommand, BattleEvent, BattleState, createBattle, Command, moveRules, roundOf, unitAt, unitById, unsettled, upcomingTurns, type Unit, type UnitSpec,
} from "./engine/state";
import { abilityDesc, abilityName, Lang, t, type TextKey } from "./i18n/text";
import { fxSources, type Burst } from "./render/fx";
import { SCENERY_IMAGES } from "./render/scenery";
import { drawBattle, Floater, type ReachBadge, type SightLine, Images, isFlat, loadImages, mapPixelSize, Mark, Motion, motionMs, pickAt, portrait, rotate as rotateGrid, setFlat, tileCenter, TW, unrotate as unrotateGrid, View } from "./render/iso";

/** The run save: the run, with the battle being fought inside it. */
const RUN_KEY = "tac-tics.run.v1";
const LANG_KEY = "tac-tics.lang";
/** What carries between runs (run/legacy.ts): the nemesis. */
const LEGACY_KEY = "tac-tics.legacy.v1";
const VIEW_KEY = "tac-tics.view";
const HOLD_KEY = "tac-tics.hold";
const FOE_STEP_MS = 380;
const WALK_STEP_MS = 190, PUSH_STEP_MS = 90, BLINK_MS = 320;
const MIN_TILE_PX = 58; // a tile narrower than this is hard to hit with a finger

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d")!;

// Prototype turn rules (src/engine/rules.ts): ?rules=act for FFTA-style Move + Act with mana, ?rules=pips for two pips.
{ const r = new URLSearchParams(location.search).get("rules"); if (r === "act" || r === "pips") setRules({ mode: r }); }
/** What a card costs under the turn rules in play: AP (or Acts/pips) and mana. */
const costText = (ab: Ability) => {
  const m = manaCost(ab), a = actionCost(ab);
  if (!usesMana()) return a ? `${a}${icon("ap")}` : "";
  return m ? `${m}${icon("mana")}` : "";
};
let lang: Lang = (safeGet(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : "en");
let save: BattleSave;
let state: BattleState;
let images: Images;
let view: View = { ox: 0, oy: 0, scale: 1, rot: 0 };
let zoom = 0, panX = 0, panY = 0; // zoom 0 = pick a comfortable size on the first layout
let hover: Pos | null = null;
let selected: string | null = null;
/** The quick actions row is open (one free quick action per turn). */
let quickOpen = false;
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
/** Hold back: hits that would down a foe stop at 1 HP (sent with each cast). Remembered between battles. */
let holdBack = false;
const floaters: Floater[] = [];
/** One-off smoke and steam puffs on the board (src/render/fx.ts). */
const bursts: Burst[] = [];
/** Units hit lately (they flash), and until when the view shakes (blasts, rolling rocks, critical hits). */
const flashes = new Map<string, number>();
let shakeUntil = 0;
const motions = new Map<string, Motion>();
let animUntil = 0; // input waits until units have finished moving
const animating = () => performance.now() < animUntil;

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode: play without saving */ } }

const heroTurn = () => !deploy && !state.winner && activeUnit(state).team === "heroes";

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
/** While true (and choosing), the camp between runs shows first: the record, kits and lore (data/camp.ts). */
let atCamp = false;
/** The lore page open at the camp. */
let campPage: string | null = null;
/** While true, the map shows the play log panel. */
let statsOpen = false;
/** When the battle on screen started, for the play log (0 for a battle resumed from a save). */
let battleStartedAt = 0;
/** Before a fight: the tiles the party may start on and the party member picked to move (run/deploy.ts). */
let deploy: { zone: Pos[]; pick: string | null } | null = null;
/** The battle view grows (or shrinks) from the travel scene's size when a fight opens after the intro. */
let introZoom: { from: number; at: number } | null = null;
const INTRO_ZOOM_MS = 750;
/** The travel scene's scale when its intro handed over to a fight (0 when there was no intro). */
let introFrom = 0;
/** The battle intro on the travel screen: the ground around the arena drops away while the camera settles on it. */
const INTRO = { rowMs: 55, jitterMs: 140, fallMs: 520, holdMs: 350 };

/** A new run starts with the difficulty choice; the run itself is made once the player picks. */
function startRun() {
  // Giving up a run that had begun counts as its end in the play log.
  if (journey && !journey.over && !choosingDifficulty && (journey.path.length || journey.battle)) record(logRunEnd(PLAYER, journey, "abandoned"));
  journey = newRun(`${Date.now()}`);
  choosingDifficulty = true;
  // The camp only shows once there is something behind the hero: a first journey goes straight to the difficulty.
  atCamp = loadLegacy().runs > 0; campPage = null;
  showMap();
}

function loadLegacy(): Legacy {
  try { const l = JSON.parse(safeGet(LEGACY_KEY) ?? "null") as Legacy | null; return l?.version === 1 ? l : newLegacy(); } catch { return newLegacy(); }
}
/** A finished run goes into the legacy once (closeRun ignores a run it has already counted). */
function closeLegacy() {
  if (!journey?.over) return;
  safeSet(LEGACY_KEY, JSON.stringify(closeRun(loadLegacy(), journey)));
}

function pickDifficulty(d: Difficulty, tier = 0) {
  sfx("select");
  const legacy = loadLegacy();
  journey = newRun(`${Date.now()}`, d, carriedNemesis(legacy), kitOf(legacy), { returning: carriedReturn(legacy), keepsake: keepsakeOf(legacy), tier });
  choosingDifficulty = false;
  record(logRunStart(PLAYER, journey));
  showMap();
}

function saveLegacy(f: (l: Legacy) => void) { const l = loadLegacy(); f(l); safeSet(LEGACY_KEY, JSON.stringify(l)); }

/** The camp between runs: what the hero has done so far, the starting kits it opened, and the journal pages. */
function renderCamp(panel: HTMLElement) {
  panel.style.display = "flex";
  const legacy = loadLegacy(), fresh = new Set(legacy.fresh ?? []), kit = kitOf(legacy);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const title = el("h2", "", t(lang, "camp"));
  const rec = el("p", "say", t(lang, "campRecord", { runs: legacy.runs, wins: legacy.wins, settled: legacy.settled.length }));
  const parts: HTMLElement[] = [title, rec];
  if (legacy.nemesis) parts.push(el("p", "say down", t(lang, "campNemesis", { name: rivalName(legacy.nemesis, lang) })));
  const card = (open: boolean, isNew: boolean, name: string, desc: string, hint: string) => {
    const b = el("button", "card"); b.disabled = !open;
    const n = el("b", "", open ? name : `🔒 ${t(lang, "campLocked")}`);
    if (isNew) n.append(" ", el("em", "", t(lang, "campNew")));
    b.append(n, el("small", "", open ? desc : hint));
    return b;
  };
  const kits = el("div", "cards");
  for (const k of KITS) {
    const open = hasMilestone(legacy, k.needs);
    const b = card(open, !!k.needs && fresh.has(k.needs), k.name[lang], k.desc[lang], k.needs ? MILESTONE_HINT[k.needs][lang] : "");
    if (k.id === kit.id) { b.classList.add("worn"); b.setAttribute("aria-pressed", "true"); }
    b.dataset.kit = k.id;
    b.onclick = () => { sfx("equip"); saveLegacy((l) => { l.kit = k.id; }); showMap(); document.querySelector<HTMLButtonElement>(`[data-kit="${k.id}"]`)?.focus(); };
    kits.append(b);
  }
  const lore = el("div", "cards");
  for (const page of LORE) {
    const open = hasMilestone(legacy, page.needs);
    const b = card(open, fresh.has(page.needs), page.title[lang], campPage === page.id ? page.text[lang] : "…", MILESTONE_HINT[page.needs][lang]);
    b.setAttribute("aria-expanded", String(campPage === page.id));
    b.onclick = () => { sfx("page"); campPage = campPage === page.id ? null : page.id; showMap(); document.querySelector<HTMLButtonElement>(`[data-lore="${page.id}"]`)?.focus(); };
    b.dataset.lore = page.id;
    lore.append(b);
  }
  const go = el("button", "", t(lang, "campSetOut"));
  // Leaving the camp: what was new has been seen.
  go.onclick = () => { saveLegacy((l) => { l.fresh = []; }); atCamp = false; showMap(); };
  // Keepsakes: one perk carried from a companion's good ending; and who waits on the road from a bad one.
  const keeps = el("div", "cards"), worn = keepsakeOf(legacy), back = carriedReturn(legacy);
  for (const p of keepsakesOpen(legacy)) {
    const b = card(true, false, p.name[lang], p.desc[lang], "");
    if (p.id === worn) { b.classList.add("worn"); b.setAttribute("aria-pressed", "true"); }
    b.dataset.keep = p.id;
    b.onclick = () => { sfx("equip"); saveLegacy((l) => { l.keepsake = p.id; }); showMap(); document.querySelector<HTMLButtonElement>(`[data-keep="${p.id}"]`)?.focus(); };
    keeps.append(b);
  }
  if (!keeps.childElementCount) keeps.append(el("p", "spoils", t(lang, "campNoKeepsake")));
  if (back) parts.push(el("p", "say down", t(lang, "campReturning", { name: back.base.name })));
  parts.push(go, el("h3", "", t(lang, "campKits")), kits, el("h3", "", t(lang, "campKeepsakes")), keeps, el("h3", "", t(lang, "campLore")), lore);
  panel.replaceChildren(...parts);
  go.focus();
}

function renderDifficulty(panel: HTMLElement) {
  panel.style.display = "flex";
  const title = document.createElement("h2"); title.textContent = t(lang, "pickDifficulty");
  const list = document.createElement("div"); list.className = "cards pick";
  for (const d of Object.keys(DIFFICULTY) as Difficulty[]) {
    const b = document.createElement("button"); b.className = "card ico";
    b.innerHTML = `${iconTile(pk(RUN_PACK[d]), d === "hard" ? "epic" : d === "normal" ? "rare" : "common")}<span class="tx"></span>`;
    const name = document.createElement("b"); name.textContent = t(lang, `diff.${d}`);
    const desc = document.createElement("span"); desc.textContent = t(lang, `diff.${d}.desc`);
    b.querySelector(".tx")!.append(name, desc); b.onclick = () => pickDifficulty(d);
    list.append(b);
  }
  // Sap tiers opened by winning on Hard: each adds its twist to the ones below it.
  const open = Math.min(SAP_TIERS.length, loadLegacy().tiers ?? 0);
  for (let i = 1; i <= open; i++) {
    const tier = SAP_TIERS[i - 1]!;
    const b = document.createElement("button"); b.className = "card";
    const name = document.createElement("b"); name.textContent = `${t(lang, "diff.hard")} · ${tier.name[lang]}`;
    const desc = document.createElement("span"); desc.textContent = tier.twist[lang];
    b.append(name, desc);
    if (i > 1) { const more = document.createElement("small"); more.textContent = t(lang, "tierKeeps", { n: SAP_TIERS[i - 2]!.name[lang] }); b.append(more); }
    b.onclick = () => pickDifficulty("hard", i);
    list.append(b);
  }
  const hint = document.createElement("p"); hint.className = "spoils";
  hint.textContent = open < SAP_TIERS.length ? t(lang, "tierHint", { n: open ? SAP_TIERS[open - 1]!.name[lang] : t(lang, "diff.hard") }) : "";
  panel.replaceChildren(title, list, hint);
}

function showMap() {
  onMap = true; busy = false;
  playMusic(choosingDifficulty || journey.over ? "camp" : "map");
  journey.battle = undefined;
  if (!choosingDifficulty) persist();
  resetView();
  $("travel").style.display = "block";
  $("overlay").style.display = "none";
  for (const id of ["top", "bottom", "act"]) $(id).style.visibility = "hidden";
  const update = (next: RunState) => { journey = next; showMap(); };
  const safely = (f: () => RunState) => { try { update(f()); } catch (e) { toast(t(lang, "tooPoor")); console.warn(e); } };
  renderRunMap(document.body, journey, lang, {
    pick: pickNode,
    choose: (i) => { const before = journey; sfx("select"); update(choose(journey, i)); record(logChoice(PLAYER, before, i)); },
    buy: (id) => { const before = journey; safely(() => buy(journey, id)); if (journey !== before) { sfx("buy"); record(logBuy(PLAYER, before, id)); } },
    heal: () => { const before = journey; safely(() => shopHeal(journey)); if (journey !== before) record(logShopHeal(PLAYER, before)); },
    leave: () => { record(logShopLeave(PLAYER, journey)); update(leaveShop(journey)); },
    wear: (id) => { sfx("equip"); journey = wear(journey, id); record(logWear(PLAYER, journey, id)); showMap(); },
    // Keeps keyboard and controller focus on the card just swapped.
    twin: (base, on) => { try { update(wearTwin(journey, base, on)); document.querySelector<HTMLButtonElement>(`[data-twin="${base}"]`)?.focus(); } catch (e) { console.warn(e); } },
    newRun: () => startRun(),
    face: (look) => portrait(images, look),
  }, gearOpen, () => { gearOpen = false; showMap(); });
  if (choosingDifficulty) (atCamp ? renderCamp : renderDifficulty)($("runPanel"));
  else if (statsOpen) renderStats($("runPanel"), lang, () => { statsOpen = false; showMap(); });
  const label = (id: string, ic: IconId | null, text: string, help: string) => {
    $(id).innerHTML = `${ic ? icon(ic) : ""}<span class="lbl">${text}</span>`; $(id).setAttribute("aria-label", text);
    explains($(id), () => plainHelp(text, help, ic ?? undefined));
  };
  label("statsBtn", "stats", t(lang, "stats"), t(lang, "statsHint"));
  label("newRun", null, t(lang, "newRun"), t(lang, "newRunHint"));
  label("gearBtn", "gear", t(lang, "gear"), t(lang, "gearHint"));
  label("mapSound", audioSettings().muted ? "muted" : "sound", t(lang, "sound"), t(lang, "soundHint"));
  label("mapTitle", "menu", t(lang, "menuTitle"), t(lang, "menuTitleHint"));
  label("mapLang", "lang", lang === "es" ? "English" : "Español", t(lang, "langHint"));
  label("mapBtn", "map", t(lang, "routeMap"), t(lang, "mapKeys"));
  label("travelMore", "menu", t(lang, "more"), t(lang, "moreRunHint"));
  document.documentElement.lang = lang;
  ensureDepart();
  // A finished run shows the route it took, under the epilogue.
  if (journey.over && !mapOpen) openMap(true);
  if (mapOpen) openMap(true);
  const walking = !!play && !play.finished && play.started !== null;
  $("skipBtn").textContent = `» ${t(lang, "skipWalk")}`;
  $("skipBtn").style.display = walking ? "" : "none";
  if (!journey.over && !journey.remarks.length && !$("runHint").textContent) $("runHint").textContent = walking ? t(lang, "walking") : t(lang, "travelHint");
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
  if (choosingDifficulty || !onMap || (play?.kind === "approach" && !play.finished)) return;
  if (!nextNodes(journey).some((n) => n.id === id)) return;
  const kind = journey.map.nodes[id]!.kind;
  const before = journey.heroHp;
  sfx("select");
  record(logNode(PLAYER, journey, id, nextNodes(journey).map((n) => n.id)));
  journey = enterNode(journey, id, lang);
  openMap(false);
  $("signs").style.display = "none";
  $("runHint").textContent = t(lang, "walking");
  $("skipBtn").style.display = "";
  // Walk there first; a fight starts when the party reaches the foes, a stop opens when they reach it.
  approach(id, () => {
    if (!journey.battle) { if (kind === "rest") { toast(t(lang, "rested", { n: journey.heroHp - before })); sfx("rest"); } else sfx("door"); showMap(); return; }
    startBattle(kind === "rival" || kind === "boss");
  });
}

/** Shows the battle in `journey.battle` (new or loaded). */
function startBattle(announce: boolean) {
  onMap = false;
  openMap(false);
  $("travel").style.display = "none";
  for (const id of ["top", "bottom", "act"]) $(id).style.visibility = "";
  save = journey.battle!;
  playMusic(journey.map.nodes[journey.battle!.node]?.kind === "boss" ? "boss" : "battle");
  // Each battle opens centred on its arena (the travel screen never pans the battle view).
  panX = 0; panY = 0;
  battleStartedAt = save.commands.length ? 0 : Date.now();
  rebuild(save.commands);
  resetView();
  // A fresh fight (not an ambush) first lets the player place the party.
  deploy = !save.commands.length && !save.setup.ambush && !save.placed ? { zone: deployZone(save.setup), pick: HERO.id } : null;
  if (introFrom) { introZoom = { from: introFrom, at: performance.now() }; introFrom = 0; }
  persist(); refresh(); followHero();
  const rivals = journey.rivals.filter((r) => !r.settled && save.setup.units.some((u) => u.id === r.id));
  if (announce && rivals.length && !save.commands.length) toast(rivals.map((r) => rivalTaunt(r, lang)).join("\n"), 4500);
  else if (save.setup.ambush && !save.commands.length) toast(t(lang, "ambush"), 2600);
  else if (journey.help && journey.help.node === journey.battle!.node && !save.commands.length) toast(helpLine(journey, lang), 3200);
  maybeFoeTurn();
}

/** Placing the party: a tap on a party member picks it; a tap on a gold tile moves it there (or swaps two). */
function deployTap(p: Pos) {
  if (!deploy) return;
  const who = unitAt(state, p);
  if (who && who.team === "heroes" && who.id !== deploy.pick) { deploy.pick = who.id; sfx("select"); refresh(); return; }
  if (!deploy.pick) return;
  const next = deployUnit(save.setup, deploy.pick, p, deploy.zone);
  if (next === save.setup) { if (!who) sfx("error"); return; }
  save.setup = next;
  rebuild([]);
  sfx("step");
  persist(); refresh();
}

/** The party is placed: the fight begins. */
function beginFight() {
  if (!deploy) return;
  deploy = null;
  save.placed = true;
  battleStartedAt = Date.now();
  sfx("select");
  persist(); refresh(); followHero();
  maybeFoeTurn();
}

/** The overlay's button after a battle: back to the map, or a new run when this one is over. */
function afterBattleButton() {
  if (journey.over) { startRun(); return; }
  if (!journey.battle || !state.winner) return;
  const region = journey.region;
  const before = journey, fought = { ...save, node: journey.battle.node };
  // The next walk sets out from this arena, from where the party stands now.
  const standing = state.units.filter((u) => u.team === "heroes" && (u.life === "up" || u.life === "downed"))
    .sort((a, b) => (a.id === heroOf(journey).id ? -1 : b.id === heroOf(journey).id ? 1 : 0));
  lastArena = { key: `${journey.region ?? 0}:${journey.battle.node}`, map: structuredClone(state.map), at: standing.map((u) => ({ ...u.pos })) };
  journey = finishBattle(journey, state);
  try {
    record(...logBattle(PLAYER, before, fought, state, journey, battleStartedAt ? Date.now() - battleStartedAt : undefined));
    if (journey.over) record(logRunEnd(PLAYER, journey, journey.over));
  } catch (e) { console.warn("play log:", e); }
  closeLegacy();
  if (journey.region !== region) { toast(t(lang, "newRegion", { name: regionOf(journey).name[lang] }), 3200); showMap(); return; }
  const sp = journey.spoils;
  if (sp?.levels) sfx("levelUp"); else if (sp?.coins) sfx("coin");
  if (sp && !journey.offers.length) toast(t(lang, "spoils", { c: sp.coins, x: sp.xp }) + (sp.shards ? t(lang, "spoilsShards", { s: sp.shards }) : "") + (sp.levels ? t(lang, "levelUp", { n: journey.hero.level }) : "")
    + (alignShiftText(sp.align, lang) ? ` · ${alignShiftText(sp.align, lang)}` : ""), 2600);
  showMap();
}

function loadOrNew() {
  const text = safeGet(RUN_KEY);
  if (text) {
    try {
      const saved = upgradeRun(JSON.parse(text) as RunState);
      if (saved.version !== RUN_VERSION) throw new Error(`unknown run version ${saved.version}`);
      journey = saved;
      closeLegacy();
      if (journey.battle) { startBattle(false); toast(t(lang, "resume")); } else { skipNextWalk = true; showMap(); }
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
  const before = state.active, hadWinner = !!state.winner;
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
  battleSounds(r.events);
  if (!hadWinner && state.winner) {
    const lost = state.winner === "foes" || state.units.some((x) => x.id === HERO.id && x.life !== "up");
    playMusic(null); sfx(lost ? "defeat" : "victory", 300);
  }
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
    if (ev.e === "spared") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: t(lang, "sparedTag"), color: "#ffffff", born: now });
      if (!state.winner || !unsettled(state).length) toast(t(lang, "sparedToast", { name: u.name }));
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
    if (ev.e === "guardHit") {
      const g = unitById(state, ev.unit), v = unitById(state, ev.target);
      floaters.push({ pos: { ...g.pos }, text: `🛡 ${t(lang, "guard")}!`, color: "#8fd0ff", born: now });
      toast(t(lang, "guardToast", { name: g.name, target: v.name }));
      continue;
    }
    if (ev.e === "guarded") {
      const g = unitById(state, ev.unit);
      floaters.push({ pos: { ...g.pos }, text: `🛡 ${t(lang, "guard")}`, color: "#8fd0ff", born: now });
      continue;
    }
    if (ev.e === "shocked") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: "⚡", color: STATUS.stun.colour, born: now });
      toast(t(lang, "shockedToast", { name: u.name }));
      continue;
    }
    if (ev.e === "trampled") {
      // A giant walking through: crates it crushes break with a puff, tall grass it treads on goes flat.
      for (const p of ev.crushed) { floaters.push({ pos: { ...p }, text: `✕ ${t(lang, "broken")}`, color: "#e8f4ff", born: now }); bursts.push({ pos: { ...p }, born: now, kind: "smoke" }); }
      if (ev.crushed.length) shakeUntil = now + 220;
      continue;
    }
    if (ev.e === "sapped") {
      const u = unitById(state, ev.unit), info = STATUS[ev.status];
      floaters.push({ pos: { ...u.pos }, text: `${info.icon} ${t(lang, "sapGood")}`, color: info.colour, born: now });
      continue;
    }
    if (ev.e === "stunned") {
      const u = unitById(state, ev.unit);
      floaters.push({ pos: { ...u.pos }, text: `${STATUS.stun.icon} ${t(lang, "st.stun")}`, color: STATUS.stun.colour, born: now });
      toast(t(lang, "stunnedToast", { name: u.name }));
      continue;
    }
    if (ev.e !== "cast") continue;
    callout(ev.unit, ev.ability);
    if (ev.fx.some((f) => f.fx === "explode" || f.fx === "flare" || f.fx === "impact") || ev.hits.some((h) => h.crit)) shakeUntil = now + 320;
    for (const h of ev.hits) if (h.damage > 0) {
      const start = was.get(h.unit);
      flashes.set(h.unit, now + (h.pushedTo && start ? 120 + PUSH_STEP_MS * Math.max(1, manhattan(start, h.pushedTo)) : 0) + (h.source ? 200 : 0));
    }
    for (const f of ev.fx) {
      const word = { ignite: "🔥", douse: "💨", freeze: "❄", melt: "💧", explode: `💥 ${t(lang, "boom")}`, break: `✕ ${t(lang, "broken")}`, slide: "", chain: "⚡",
        flare: `🔥 ${t(lang, "flare")}`, steam: "☁", charge: "⚡", calm: "💧", cleanse: "✦", sink: "💧", impact: "", regrow: "🌿" }[f.fx];
      const loud = f.fx === "explode" || f.fx === "flare";
      if (word) floaters.push({ pos: { ...f.at }, text: word, color: loud ? "#ffb347" : "#e8f4ff", born: now + (loud ? 0 : 100) });
      const puff = ({ douse: "smoke", break: "smoke", explode: "smoke", steam: "steam", melt: "steam", freeze: "steam" } as const)[f.fx as string];
      if (puff) bursts.push({ pos: { ...f.at }, born: now, kind: puff });
    }
    for (const h of ev.hits) {
      const u = unitById(state, h.unit);
      // A pushed unit gets its numbers where it lands, once it has slid there.
      const start = was.get(h.unit);
      const wait = h.pushedTo && start ? 120 + PUSH_STEP_MS * Math.max(1, manhattan(start, h.pushedTo)) : 0;
      const add = (text: string, color: string, delay = 0) => floaters.push({ pos: { ...u.pos }, text, color, born: now + wait + delay });
      const tag = h.source === "blast" || h.source === "impact" ? "💥 " : h.source === "chain" ? "⚡ " : h.source === "sap" ? "◆ " : "";
      if (h.damage) add(`${tag}-${h.damage}${h.crit ? "!" : ""}`, h.crit ? "#ffd86b" : "#ff8a7a", h.source ? 200 : 0);
      if (h.heal) add(`+${h.heal}`, "#7ed957");
      if (h.revived) add(t(lang, "revived"), "#7ed957");
      if (h.maxHpLost) add(t(lang, "maxHpDown", { n: h.maxHpLost }), "#c9a0ff", 350);
      if (h.rooted) add(t(lang, "rooted"), "#b9e08a", 250);
      if (h.freed) add(`🌿 ✕`, "#8fd0ff", 250);
      if (h.slid) add(`❄ ${t(lang, "slid")}`, "#cfefff", 200);
      if (h.shielded) add(`${STATUS.shield.icon} ${h.shielded}`, STATUS.shield.colour, 150);
      for (const id of h.statuses ?? []) add(`${STATUS[id].icon} ${t(lang, `st.${id}` as TextKey)}`, STATUS[id].colour, 450);
      for (const id of h.cleansed ?? []) add(`${STATUS[id].icon} ✕`, "#8fd0ff", 450);
      if (h.held) add("🤚 1", "#ffffff", 300);
      if (h.downed) add(t(lang, "downed"), "#ffffff", 300);
      if (h.died) add(t(lang, "dead"), "#ffffff", 300);
    }
  }
  while (floaters.length > 40) floaters.shift();
  while (bursts.length > 24) bursts.shift();
}

async function maybeFoeTurn() {
  if (busy || onMap || deploy) return;
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
    ["needs an enemy", "err.foe"], ["needs a standing ally", "err.ally"], ["needs a downed", "err.downedAlly"], ["hidden in tall grass", "err.hidden"],
    ["needs an empty tile", "err.empty"], ["needs a yielding foe", "err.yielding"], ["not enough AP", "err.ap"], ["not enough mana", "err.mana"], ["on cooldown", "err.cooldown"], ["already used", "err.used"],
    ["the combo partner is not standing", "err.comboDown"], ["the combo partner is too far", "err.comboFar"], ["needs the combo partner", "err.comboTarget"],
  ];
  if (why.endsWith("while swimming")) return t(lang, "swimming");
  const hit = map.find(([k]) => why.startsWith(k));
  return hit ? t(lang, hit[1]) : why;
}

/* ---------- what the map highlights ---------- */

function marks(): Map<string, Mark> {
  return aimView().marks;
}

/** Everything the board shows while aiming: the marks, small reach badges (▲ reached only thanks to height,
    ▼ lost to lower ground) and, over a tile whose line of sight is cut, that line and what cuts it. */
function aimView(): { marks: Map<string, Mark>; badges: Map<string, ReachBadge>; line?: SightLine } {
  const out = new Map<string, Mark>(), badges = new Map<string, ReachBadge>();
  if (deploy) {
    for (const p of deploy.zone) out.set(`${p.x},${p.y}`, "deploy");
    const at = deploy.pick ? unitById(state, deploy.pick).pos : null;
    if (at) out.set(`${at.x},${at.y}`, "chosen");
    return { marks: out, badges };
  }
  if (!heroTurn() || busy) return { marks: out, badges };
  const u = activeUnit(state);
  if (!selected) {
    for (const k of reachable(state.map, u.pos, moveRules(state, u)).keys()) out.set(k, "move");
    if (pending) out.set(`${pending.x},${pending.y}`, "chosen");
    return { marks: out, badges };
  }
  const ab = ABILITIES[selected]!;
  const bound = reachBound(state, u, ab);
  for (let y = 0; y < state.map.h; y++) for (let x = 0; x < state.map.w; x++) {
    const p = { x, y }, k = `${x},${y}`;
    if (manhattan(u.pos, p) > bound) continue;
    const r = reachAt(state, u, ab, p);
    if (r.problem === "far") continue;
    // Too close (only worth showing for abilities that cannot reach next to the caster) or lost to low ground.
    if (r.problem === "near") { if (r.min >= 2 && r.dist > 0) out.set(k, "short"); continue; }
    if (r.problem === "low") { out.set(k, "short"); badges.set(k, "down"); continue; }
    if (r.dist > r.base + r.aim) badges.set(k, "up");
    const why = castProblem(state, u, selected, p);
    out.set(k, !why ? "target" : why === "no line of sight" || sightBlock(tileAt(state.map, p)!) > 0 ? "blocked" : "range");
  }
  const focus = pending ?? hover;
  if (focus && out.get(`${focus.x},${focus.y}`) === "target") for (const p of areaTiles(ab, focus)) out.set(`${p.x},${p.y}`, "area");
  if (pending) out.set(`${pending.x},${pending.y}`, "chosen");
  let line: SightLine | undefined;
  if (focus && out.has(`${focus.x},${focus.y}`)) {
    const r = reachAt(state, u, ab, focus);
    if (r.blocker) line = { from: u.pos, to: focus, blocker: r.blocker };
  }
  return { marks: out, badges, line };
}

/* ---------- HUD: FFTA-style windows ---------- */

/** Help window: what the menu item under the pointer, in keyboard or controller focus, or chosen does. Each item
    that explains itself is marked data-h and registers how to say it. */
const helpers = new WeakMap<Element, () => string>();
let helpHover: Element | null = null;
/** How long a finger holds an item before its help shows. */
const HOLD_MS = 380;
/** True while a finger holds an item to read its help (a tap never shows it). */
let held = false;
function explains(el: HTMLElement, say: () => string) { el.dataset.h = "1"; helpers.set(el, say); el.removeAttribute("title"); }
const plainHelp = (title: string, body: string, ic?: IconId) => `<div class="head">${ic ? icon(ic, "big") : ""}<span>${title}</span></div><p>${body}</p>`;

function showHelp() {
  const box = $("help");
  // The item hovered may have been rebuilt by a refresh: find the one under the pointer now.
  if (helpHover && !document.contains(helpHover)) helpHover = held ? null : [...document.querySelectorAll("[data-h]:hover")].pop() ?? null;
  const say = helpHover && helpers.get(helpHover);
  const html = say ? say() : "";
  if (!html || mapOpen) { box.style.display = "none"; return; }
  box.innerHTML = html;
  box.style.display = "block";
  placeBeside(box, helpHover!);
}

/** Puts a popup right next to the item it explains, like a spell bar's tooltip: above it when there is room, else
    beside the window the item sits in, never off screen. A small caret points at the item. */
function placeBeside(box: HTMLElement, el: Element) {
  const r = el.getBoundingClientRect();
  const win = (el.closest(".win") ?? el).getBoundingClientRect();
  const w = box.offsetWidth, h = box.offsetHeight, gap = 8, edge = 6;
  const clampX = (x: number) => Math.max(edge, Math.min(innerWidth - w - edge, x));
  const clampY = (y: number) => Math.max(edge, Math.min(innerHeight - h - edge, y));
  let x: number, y: number, side: string;
  if (win.top - gap - h >= edge) { x = clampX(r.left + r.width / 2 - w / 2); y = win.top - gap - h; side = "below"; }
  else if (innerHeight - win.bottom - gap - h >= edge) { x = clampX(r.left + r.width / 2 - w / 2); y = win.bottom + gap; side = "above"; }
  else if (win.left - gap - w >= edge) { x = win.left - gap - w; y = clampY(r.top + r.height / 2 - h / 2); side = "right"; }
  else { x = Math.min(innerWidth - w - edge, win.right + gap); y = clampY(r.top + r.height / 2 - h / 2); side = "left"; }
  box.style.left = `${x}px`; box.style.top = `${y}px`;
  box.dataset.caret = side;
  // Where along its edge the caret sits: at the item's centre.
  box.style.setProperty("--caret", side === "below" || side === "above" ? `${Math.max(12, Math.min(w - 12, r.left + r.width / 2 - x))}px` : `${Math.max(12, Math.min(h - 12, r.top + r.height / 2 - y))}px`);
}

/** Why an ability can't be used, in words. */
function explainAvail(why: string): string {
  if (why.startsWith("quick action")) return t(lang, "err.quick");
  if (why === "nobody yields") return t(lang, "err.nobody");
  return explain(why);
}

/** Everything about one ability, for the help window. */
function abilityHelp(id: string, u: Unit | null): string {
  const ab = ABILITIES[id]!;
  const chips: string[] = [];
  const chip = (ic: IconId | null, text: string) => chips.push(`<span>${ic ? icon(ic) : ""}${text}</span>`);
  if (!usesMana()) chip("ap", ab.ap ? `${ab.ap} ${t(lang, "ap")}` : t(lang, "free"));
  else chip("mana", manaCost(ab) ? `${manaCost(ab)} ${t(lang, "mana")}` : t(lang, "free"));
  chip("range", ab.range[1] === 0 ? t(lang, "h.self") : t(lang, "h.range", { r: ab.range[0] === ab.range[1] ? `${ab.range[1]}` : `${ab.range[0]}–${ab.range[1]}` }));
  if (ab.area === "cross1") chip("area", t(lang, "h.area"));
  if (ab.area === "square1") chip("area", t(lang, "h.square"));
  if (ab.combo) chip("recruit", t(lang, "h.combo", { name: state.units.find((x) => x.id === ab.combo!.partner)?.name ?? ab.combo.partner, n: ab.combo.reach }));
  if (ab.los) chip("sight", t(lang, "h.sight"));
  // League-style: the base roll, the stat's share in its own colour, then what it comes to for this unit.
  if (ab.damage) {
    const k = ab.damage.stat, stat = u ? u[k] : 0, f = 1 + stat / 100;
    const total = u ? ` = <b>${Math.floor(ab.damage.min * f)}–${Math.floor(ab.damage.max * f)}</b>` : "";
    chip("sword", `${ab.damage.min}–${ab.damage.max} <i class="s-${k}">(+${u ? `${stat}% ` : ""}${t(lang, k)})</i>${total}`);
  }
  if (ab.heal) chip("heal", `+${ab.heal.min}–${ab.heal.max}`);
  if (ab.push) chip("push", t(lang, "h.push", { n: ab.shove ? "1–2" : ab.push }));
  if (ab.status) chip(ab.status.id, `${t(lang, `st.${ab.status.id}` as TextKey)} · ${t(lang, "turnsLeft", { n: ab.status.turns })}`);
  if (ab.also) chip(ab.also.id, `${t(lang, `st.${ab.also.id}` as TextKey)} · ${t(lang, "turnsLeft", { n: ab.also.turns })}`);
  if (u && u.team === "heroes" && u.aiming && heightShapesReach(ab) && !ab.quick) chip(null, t(lang, "r.aim"));
  if (ab.cooldown) chip("cooldown", t(lang, "h.cd", { n: ab.cooldown }));
  if (ab.perTurn > 1 && ab.perTurn < 4) chip(null, t(lang, "h.perTurn", { n: ab.perTurn }));
  if (ab.quick) chip("quick", t(lang, "h.quick"));
  const why = u && u.team === "heroes" ? abilityAvailable(u, id) ?? comboProblem(state, u, ab) ?? swimProblem(state.map, u, ab) ?? (ab.spare && !state.units.some(yielding) ? "nobody yields" : null) : null;
  // How its reach works: height (ranged only), the blind spot next to the caster, and what cuts the line of sight.
  const rules: string[] = [];
  if (ab.range[1] > 0 && !ab.quick) rules.push(t(lang, heightShapesReach(ab) ? "h.heightRule" : "h.meleeRule"));
  if (ab.range[0] >= 2) rules.push(t(lang, "h.minRule", { n: ab.range[0] - 1 }));
  if (ab.los) rules.push(t(lang, "h.sightRule"));
  const el = ELEMENTS[ab.element];
  const key = u ? menuOrder(u).indexOf(id) + 1 : 0;
  return `<div class="head">${icon(abilityIcon(id, ab.element), "big")}<span>${abilityName(lang, id)}</span>${key > 0 && key <= 9 ? `<kbd>${key}</kbd>` : ""}`
    + `<small style="margin-left:auto;font-weight:400;color:var(--quiet)">${icon(abilityIcon("", ab.element))} ${el[lang]}</small></div>`
    + `<div class="chips">${chips.join("")}</div>`
    + `<div class="body">${shapeDiagram(ab)}<div><p>${abilityDesc(lang, id)}</p>${rules.length ? `<p class="rules">${rules.join(" ")}</p>` : ""}</div></div>`
    + `${why ? `<p class="why">${explainAvail(why)}</p>` : ""}`;
}

/** The order abilities are listed in the menu (and picked with the number keys): the unit's own, then the quick ones. */
function menuOrder(u: Unit): string[] {
  const all = unitAbilities(u);
  return [...all.filter((id) => !ABILITIES[id]!.quick), ...all.filter((id) => ABILITIES[id]!.quick)];
}

const pips = (n: number, max: number) => Array.from({ length: max }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");

/** The window with the unit in play: face, name, element, HP, AP and MP. */
function renderUnitCard(u: Unit) {
  const ratio = u.hp / Math.max(1, u.maxHp);
  const face = portrait(images, u.look);
  const el = (u.element in ICONS ? u.element : "neutral") as IconId;
  const statuses = u.statuses.map((x) => icon(x.id)).join("");
  $("unitCard").innerHTML = `${face ? `<img class="face" src="${face}" alt="">` : `<span class="face"></span>`}`
    + `<div class="name ${u.team}">${icon(el)}<span>${u.name}</span>${statuses}<span class="round">${t(lang, "round", { n: roundOf(state) })}</span></div>`
    + `<div class="gauge">${icon("hp")}<span class="track"><span class="fill${ratio < 0.25 ? " crit" : ratio < 0.5 ? " low" : ""}" style="width:${ratio * 100}%"></span></span><b>${u.hp}/${u.maxHp}</b></div>`
    + `<div class="gauge">${icon("ap")}<span class="pips ap">${pips(u.ap, u.maxAp)}</span>${icon("mp")}<span class="pips mp">${pips(u.mp, u.maxMp)}</span>${u.maxMana ? `${icon("mana")}<b>${u.mana}/${u.maxMana}</b>` : ""}</div>`;
  $("unitCard").setAttribute("aria-label", `${t(lang, "turnOf", { name: u.name })} · ${t(lang, "hp")} ${u.hp}/${u.maxHp} · ${t(lang, "ap")} ${u.ap}/${u.maxAp} · ${t(lang, "mp")} ${u.mp}/${u.maxMp}`);
}

/** A button with a pixel icon, a label (hidden on phones for the system buttons) and its help. */
function dress(id: string, ic: IconId, label: string, help: () => string, iconOnly = false) {
  const b = $<HTMLButtonElement>(id);
  b.innerHTML = `${icon(ic)}${iconOnly ? "" : `<span class="lbl">${label}</span>`}`;
  b.setAttribute("aria-label", label);
  explains(b, help);
}

function refresh() {
  if (onMap) return;
  const u = activeUnit(state);
  renderUnitCard(deploy?.pick ? unitById(state, deploy.pick) : u);
  document.body.classList.toggle("deploying", !!deploy);
  if (deploy) {
    $("deployTitle").textContent = t(lang, "deployTitle");
    $("deployHint").textContent = t(lang, "deployHint");
    $("deployGo").innerHTML = `${icon("confirm")}<span>${t(lang, "deployGo")}</span>`;
  }
  const queue = $("queue");
  const label = document.createElement("span"); label.className = "label"; label.textContent = `${t(lang, "upNext")}:`;
  queue.replaceChildren(label);
  upcomingTurns(state, 8).forEach((id, i) => {
    const v = unitById(state, id);
    const chip = document.createElement("button");
    chip.className = `chip ${v.team}${i === 0 ? " now" : ""}`;
    const face = portrait(images, v.look);
    const mark = v.life === "downed" ? "✚" : yielding(v) ? "🏳" : "";
    chip.innerHTML = `${face ? `<img src="${face}" alt="">` : `<span>${v.name.slice(0, 2)}</span>`}${mark ? `<span class="mark">${mark}</span>` : ""}`;
    chip.setAttribute("aria-label", `${i === 0 ? `${t(lang, "turnOf", { name: v.name })}` : v.name}${mark ? ` ${mark}` : ""}`);
    explains(chip, () => plainHelp(v.name, `${t(lang, "hp")} ${v.hp}/${v.maxHp}${v.life === "downed" ? " ✚" : ""}`));
    chip.onclick = () => {
      // Find the unit: pan to it and make it pulse; for a foe, also show its reach.
      focus = { id: v.id, until: performance.now() + 1800 };
      if (v.team === "foes") inspect = v.id;
      centreOn(v.pos);
    };
    queue.append(chip);
  });
  const mine = heroTurn() && !busy;
  // The command menu: the unit's abilities as rows, then the quick actions folded under one row.
  const bar = $("abilities");
  bar.replaceChildren();
  $("menu").style.display = u.team === "heroes" ? "" : "none";
  $("menuTitle").textContent = t(lang, "actions");
  const quickIds = menuOrder(u).filter((id) => ABILITIES[id]!.quick);
  const quickDone = !!u.usedThisTurn.quick;
  if (selected && ABILITIES[selected]?.quick) quickOpen = true;
  const shown = menuOrder(u).filter((id) => !ABILITIES[id]!.quick);
  for (const id of [...shown, "__quick", ...(quickOpen ? quickIds : [])]) {
    if (u.team !== "heroes") break;
    if (id === "__quick") {
      // One row opens the quick actions: a free one per turn, shared between them.
      const q = document.createElement("button");
      q.className = `cmd quickToggle${quickOpen ? " open" : ""}`;
      q.disabled = !mine || quickDone;
      q.innerHTML = `${icon("quick")}<span class="nm">${t(lang, quickDone ? "quickUsed" : "quickMenu")}</span><span class="cost">0${icon("ap")}</span>`;
      explains(q, () => plainHelp(t(lang, "quickMenu"), t(lang, "quickInfo"), "quick"));
      q.onclick = () => { quickOpen = !quickOpen; if (!quickOpen && selected && ABILITIES[selected]?.quick) selected = null; refresh(); };
      bar.append(q);
      continue;
    }
    const ab = ABILITIES[id]!;
    const b = document.createElement("button");
    b.className = `cmd${ab.quick ? " sub" : ""}${selected === id ? " on" : ""}`;
    b.style.setProperty("--el", ELEMENTS[ab.element].col);
    const why = abilityAvailable(u, id) ?? comboProblem(state, u, ab) ?? swimProblem(state.map, u, ab) ?? (ab.spare && !state.units.some(yielding) ? "nobody yields" : null);
    b.disabled = !mine || !!why;
    const cd = u.cooldowns[id];
    b.innerHTML = `${icon(abilityIcon(id, ab.element))}<span class="nm">${abilityName(lang, id)}</span>`
      + `<span class="cost${cd ? " cd" : ""}">${cd ? `${icon("cooldown")}${cd}` : costText(ab)}</span>`;
    b.setAttribute("aria-label", `${abilityName(lang, id)}, ${ab.ap} ${t(lang, "ap")}`);
    explains(b, () => abilityHelp(id, activeUnit(state)));
    b.onclick = () => { selected = selected === id ? null : id; pending = null; inspect = null; tooltip(null); refresh(); };
    bar.append(b);
  }
  $<HTMLButtonElement>("end").disabled = !mine;
  $<HTMLButtonElement>("wait").disabled = !mine || u.spentAp || u.moved || u.waited || !!u.usedThisTurn.quick;
  const wet = inWater(state.map, u) && !nativeSwimmer(u);
  const guardWith = mine && u.escape === "none" && !wet ? guardAbility(u) : null;
  const gb = $<HTMLButtonElement>("guard");
  gb.disabled = !guardWith;
  dress("guard", "shield", t(lang, "guard"), () => plainHelp(t(lang, "guard"), guardWith ? t(lang, "guardHint", { ab: abilityName(lang, guardWith) }) : t(lang, wet ? "swimming" : "guardNo"), "shield"));
  $<HTMLButtonElement>("undo").disabled = !canUndo();
  const rw = $<HTMLButtonElement>("rewind");
  const left = rulesOf(journey).rewinds - (save.rewindsUsed ?? 0);
  rw.disabled = rewindTarget() === null;
  const armed = performance.now() < rewindArmed;
  dress("rewind", "rewind", armed ? t(lang, "rewindAgain") : `${t(lang, "rewind")} (${left})`, () => plainHelp(t(lang, "rewind"), t(lang, "rewindHint"), "rewind"));
  rw.classList.toggle("armed", armed);
  dress("danger", "danger", t(lang, "danger"), () => plainHelp(t(lang, "danger"), `${t(lang, "dangerHint")} (Y)`, "danger"));
  $("danger").classList.toggle("on", dangerAll);
  dress("flat", "flat", t(lang, "flat"), () => plainHelp(t(lang, "flat"), t(lang, "flatHint"), "flat"));
  $("flat").classList.toggle("on", isFlat());
  dress("end", "end", t(lang, "endTurn"), () => plainHelp(t(lang, "endTurn"), t(lang, "endHint"), "end"));
  dress("wait", "wait", t(lang, "wait"), () => plainHelp(t(lang, "wait"), t(lang, "waitHint"), "wait"));
  dress("hold", "hold", t(lang, "holdBack"), () => plainHelp(t(lang, "holdBack"), t(lang, "holdHint"), "hold"));
  const hold = $<HTMLButtonElement>("hold");
  hold.classList.toggle("on", holdBack); hold.setAttribute("aria-pressed", String(holdBack));
  hold.disabled = !mine;
  dress("undo", "undo", t(lang, "undo"), () => plainHelp(t(lang, "undo"), t(lang, "undoHint"), "undo"));
  for (const [id, dir, key, ic] of [["rotateL", "rotateLeft", "Q", "rotL"], ["rotateR", "rotateRight", "E", "rotR"]] as const) {
    dress(id, ic, t(lang, dir), () => plainHelp(t(lang, dir), `${t(lang, dir)} (${key}, ${key === "Q" ? "LB" : "RB"})`, ic), true);
  }
  dress("zoomIn", "zoomIn", t(lang, "zoomIn"), () => plainHelp(t(lang, "zoomIn"), t(lang, "zoomIn"), "zoomIn"));
  dress("zoomOut", "zoomOut", t(lang, "zoomOut"), () => plainHelp(t(lang, "zoomOut"), t(lang, "zoomOut"), "zoomOut"));
  dress("sound", audioSettings().muted ? "muted" : "sound", t(lang, "sound"), () => plainHelp(t(lang, "sound"), t(lang, "soundHint"), "sound"));
  dress("toTitle", "menu", t(lang, "menuTitle"), () => plainHelp(t(lang, "menuTitle"), t(lang, "menuTitleHint"), "menu"));
  dress("lang", "lang", lang === "es" ? "English" : "Español", () => plainHelp(lang === "es" ? "English" : "Español", t(lang, "langHint"), "lang"));
  dress("toolsBtn", "menu", t(lang, "more"), () => plainHelp(t(lang, "more"), t(lang, "moreHint"), "menu"), true);
  const confirm = $<HTMLButtonElement>("confirm");
  confirm.style.display = mine && pending ? "" : "none";
  confirm.innerHTML = `${icon("confirm")}<span>${selected ? abilityName(lang, selected) : t(lang, "moveHere")}</span>`;
  $("cancel").style.display = mine && (pending || selected) ? "" : "none";
  $("cancel").innerHTML = `${icon("cancel")}<span>${t(lang, "cancel")}</span>`;
  const bottomH = $("bottom").getBoundingClientRect().height;
  $("hint").style.bottom = `${roomy() ? 10 : bottomH + 2}px`;
  $("act").style.bottom = `${roomy() ? 36 : bottomH + 24}px`;
  $("hint").textContent = !mine ? t(lang, u.team === "foes" ? "foeTurn" : "hintFoe") : pending ? t(lang, "hintConfirm") : selected ? t(lang, "hintTarget") : `${t(lang, "hintMove")} ${t(lang, "foeTip")}`;
  const lost = state.winner === "foes" || state.units.some((x) => x.id === HERO.id && x.life !== "up");
  const boss = journey.battle && journey.map.nodes[journey.battle.node]!.kind === "boss";
  $("again").textContent = t(lang, lost ? "newRun" : boss ? "regionCleared" : "toMap");
  const over = $("overlay");
  over.style.display = state.winner && !onMap ? "flex" : "none";
  $("result").textContent = state.winner === "heroes" && !lost ? t(lang, "victory") : t(lang, "defeat");
  over.classList.toggle("lost", !!state.winner && lost);
  const escaped = state.units.filter((x) => x.team === "foes" && x.life === "escaped").length;
  const spared = state.units.filter((x) => x.team === "foes" && x.life === "spared").length;
  $("resultNote").textContent = [escaped ? t(lang, "escapedNote", { n: escaped }) : "", spared ? t(lang, "sparedNote", { n: spared }) : "", lost ? t(lang, "runLost") : ""].filter(Boolean).join(" ");
  renderMercy();
  document.documentElement.lang = lang;
  layout();
  showHelp();
}

/** After a win, foes still on the map (downed or under the white flag) wait for the party's choice. The button to
    move on shows once every one of them has been spared or finished. */
function renderMercy() {
  const box = $("mercy"), left = state.winner && !onMap ? unsettled(state) : [];
  $("again").style.display = left.length ? "none" : "";
  const key = left.map((u) => u.id).join(",") + lang;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!left.length) { box.replaceChildren(); return; }
  const settle = (id: string, choice: "spare" | "finish") => { run({ t: "settle", unit: id, choice }); refresh(); focusOverlay(); };
  const title = document.createElement("h2"); title.textContent = t(lang, "mercyTitle");
  const hint = document.createElement("p"); hint.textContent = t(lang, "mercyHint");
  const rows = left.map((u) => {
    const row = document.createElement("div"); row.className = "foe";
    const face = portrait(images, u.look);
    row.innerHTML = `${face ? `<img src="${face}" alt="">` : ""}<span>${u.name} · ${t(lang, u.life === "downed" ? "mercyDowned" : "mercyYields")}</span>`;
    const spare = document.createElement("button"); spare.className = "go"; spare.textContent = t(lang, "spareBtn"); spare.onclick = () => settle(u.id, "spare");
    const finish = document.createElement("button"); finish.textContent = t(lang, "finishBtn"); finish.onclick = () => settle(u.id, "finish");
    row.append(spare, finish);
    return row;
  });
  const all = document.createElement("button"); all.className = "go"; all.textContent = t(lang, "spareAll");
  all.onclick = () => { for (const u of unsettled(state)) run({ t: "settle", unit: u.id, choice: "spare" }); refresh(); focusOverlay(); };
  box.replaceChildren(title, hint, ...rows, ...(left.length > 1 ? [all] : []));
}

/** Buttons on the end-of-battle overlay, for the keyboard and the controller. */
const overlayButtons = () => [...$("overlay").querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.disabled && b.offsetParent !== null);
function focusOverlay() { if (padUsed) overlayButtons()[0]?.focus(); }

/** Shows what is on a tile, with the damage the selected ability would deal there. Near the pointer for a mouse;
    above the tile for a finger, so the finger does not cover it. */
function tooltip(at: Pos | null, ev?: { clientX: number; clientY: number }) {
  const tip = $("tip");
  const u = heroTurn() ? activeUnit(state) : null;
  const target = at && unitAt(state, at);
  const ground = at ? tileInfo(at) : [];
  const reach = at ? reachLines(at) : [];
  if (!at || (!target && !ground.length && !reach.length)) { tip.style.display = "none"; return; }
  if (!target) { showTip(tip, [...reach, ...objectLines(at), ...ground].join("<br>"), at, ev); return; }
  const hover = at;
  const lines = [`<b>${target.name}</b> · ${t(lang, "hp")} ${target.hp}/${target.maxHp}`, ...reach];
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
  // A foe's temper: how it is likely to play (rush in, work round the back, hold a spot, or hang back).
  if (target.temper && target.team === "foes") lines.push(`<b>${t(lang, `temper.${target.temper}` as TextKey)}</b> · ${t(lang, `temper.${target.temper}.d` as TextKey)}`);
  if (target.guard) lines.push(`<span style="color:#8fd0ff">🛡 ${t(lang, "guard")}</span> · ${t(lang, "guardingInfo")}`);
  for (const st of target.statuses) lines.push(`<span style="color:${STATUS[st.id].colour}">${STATUS[st.id].icon} ${t(lang, `st.${st.id}` as TextKey)}</span> · ${t(lang, `st.${st.id}.d` as TextKey, { n: st.power })} · ${t(lang, "turnsLeft", { n: st.turns })}`);
  if (wavering(target, roundOf(state))) lines.push(`<span class="esc">${t(lang, "waveringTag")}</span> · ${t(lang, "waverInfo")}`);
  if (yielding(target)) lines.push(`<b>${t(lang, "yieldingTag")}</b> · ${cowering(target) ? `${t(lang, "cowerInfo")} ` : ""}${t(lang, "yieldInfo")}`);
  if (u && selected && !castProblem(state, u, selected, hover)) {
    const ab = ABILITIES[selected]!;
    const mvAll = previewMoves()?.moves.find((x) => x.unit === target.id);
    const pushDmg = (mvAll?.bump ?? 0) + (mvAll?.fall ?? 0);
    const pushLines = () => {
      if (mvAll && (mvAll.to.x !== mvAll.from.x || mvAll.to.y !== mvAll.from.y) && !mvAll.bump && !mvAll.fall) lines.push(t(lang, "pushTo", { n: 0 }));
      if (mvAll?.fall) lines.push(`<b class="down">${t(lang, "pushFall", { n: mvAll.fall, l: mvAll.fell })}</b>`);
      if (mvAll?.bump) lines.push(mvAll.slammed ? t(lang, "slamInto", { n: mvAll.bump, what: t(lang, `slam.${mvAll.slammed}` as TextKey) }) : t(lang, "pushBump", { n: mvAll.bump }));
      for (const sp of previewMoves()?.splashes ?? []) {
        const who = unitById(state, sp.unit).name;
        lines.push(`<b class="down">${t(lang, mvAll?.fall && !mvAll.bump ? "crushOn" : "splashOn", { who, n: sp.damage })}</b>`);
      }
    };
    if (ab.damage && target.team !== u.team) {
      const base = damagePreview(state, u, target, ab), bump = pushDmg;
      const r = { min: base.min + bump, max: base.max + bump };
      const m = elementMultiplier(ab.element, target.element);
      lines.push(`${abilityName(lang, selected)}: <b>${r.min}–${r.max}</b>${m > 1 ? ` · ${t(lang, "strong")}` : m < 1 ? ` · ${t(lang, "weak")}` : ""}`);
      lines.push(dmgBreakdown(u, target, ab));
      // Forecast: what is left of the target, and whether this can put it down.
      // Holding back, nobody standing drops under 1 HP.
      const floor = holdBack && target.life === "up" ? 1 : 0;
      const lo = Math.max(floor, target.hp - r.max), hi = Math.max(floor, target.hp - r.min);
      lines.push(t(lang, "hpAfter", { a: lo === hi ? `${lo}` : `${lo}–${hi}` }));
      if (holdBack && Math.floor(r.max * CRIT_MULT) >= target.hp) lines.push(`<b>${t(lang, "holdOn")}</b>`);
      else if (r.min >= target.hp) lines.push(`<b class="down">✖ ${t(lang, "downsIt")}</b> · <span class="quiet">${t(lang, "holdBack")} (H)</span>`);
      else if (r.max >= target.hp) lines.push(`<b class="down">✖ ${t(lang, "canDown")}</b> · <span class="quiet">${t(lang, "holdBack")} (H)</span>`);
      else if (Math.floor(r.max * CRIT_MULT) >= target.hp) lines.push(`<span class="down">${t(lang, "critDown")}</span>`);
      pushLines();
      lines.push(t(lang, "crit"));
    } else if (ab.push && target.team !== u.team) {
      // A push with no damage of its own (Shove): what the fall or the slam would leave.
      lines.push(`${abilityName(lang, selected)}${pushDmg ? `: <b>${pushDmg}</b>` : ""}`);
      pushLines();
      if (pushDmg) {
        lines.push(t(lang, "hpAfter", { a: `${Math.max(0, target.hp - pushDmg)}` }));
        if (pushDmg >= target.hp) lines.push(holdBack ? `<b>${t(lang, "holdOn")}</b>` : `<b class="down">✖ ${t(lang, "downsIt")}</b>`);
      }
    } else if (ab.heal) lines.push(`${abilityName(lang, selected)}: <b>+${ab.heal.min}–${ab.heal.max}</b>`);
  } else if (u && selected && target.team !== u.team && castProblem(state, u, selected, hover) === "too heavy to shove") {
    lines.push(`<span class="down">${t(lang, "tooHeavy")}</span>`);
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

/** With a push chosen and an object under the cursor: where it goes and whom it hits. */
function objectLines(at: Pos): string[] {
  const u = heroTurn() ? activeUnit(state) : null;
  if (!u || !selected || !tileAt(state.map, at)?.prop || castProblem(state, u, selected, at)) return [];
  const ab = ABILITIES[selected]!;
  if (!ab.push || ab.damage) return [];
  const pv = previewMoves();
  const out = [`<b>${abilityName(lang, selected)}</b>`];
  const mv = pv?.moves[0];
  if (mv) out.push(t(lang, "rollTo", { n: manhattan(mv.from, mv.to) }));
  for (const sp of pv?.splashes ?? []) out.push(`<b class="down">${t(lang, "impactOn", { who: unitById(state, sp.unit).name, n: sp.damage })}</b>`);
  if (pv?.blasts.length) {
    const near = state.units.filter((v) => v.life === "up" && pv.blasts.some((b) => Math.max(Math.abs(b.x - v.pos.x), Math.abs(b.y - v.pos.y)) <= 1));
    for (const v of near) out.push(`<b class="down">${t(lang, "rollBlast", { who: v.name })}</b>`);
  }
  return out;
}

/** The height chip: how standing higher changes this attack's damage (its reach is in reachLines). */
/** The forecast's sum, League-style: the ability's base roll, then every factor that scales it, each in its own
    colour (green for a boost, red for a cut), so the player sees why the number is what it is. */
function dmgBreakdown(u: Unit, target: Unit, ab: Ability): string {
  const pct = (f: number) => { const n = Math.round((f - 1) * 100); return n >= 0 ? `+${n}%` : `−${-n}%`; };
  const label = (p: DamagePart) => p.why === "str" || p.why === "mag" ? t(lang, p.why) : p.why === "strong" || p.why === "weak" ? t(lang, p.why)
    : p.why === "res" ? `${t(lang, "p.res")} ${ELEMENTS[ab.element][lang]}` : t(lang, `p.${p.why}` as TextKey);
  const parts = damageParts(state, u, target, ab).filter((p) => Math.round((p.f - 1) * 100) !== 0)
    .map((p) => `<i class="${p.why === "str" || p.why === "mag" ? `s-${p.why}` : p.f > 1 ? "up" : "dn"}">${label(p)} ${pct(p.f)}</i>`);
  return `<span class="sum">${ab.damage!.min}–${ab.damage!.max} ${t(lang, "dmgBase")}${parts.length ? ` ${parts.join(" ")}` : ""}</span>`;
}

/** While aiming: is this tile in reach, and if not, why. Height and Aim are spelled out. */
function reachLines(at: Pos): string[] {
  const u = heroTurn() ? activeUnit(state) : null;
  if (!u || !selected) return [];
  const ab = ABILITIES[selected]!;
  if (ab.range[1] === 0) return [];
  const r = reachAt(state, u, ab, at);
  if (r.dist === 0 && r.problem === "near") return [];
  const out: string[] = [];
  if (r.problem === null) out.push(`<span class="ok">◎ ${t(lang, "r.ok", { d: r.dist, max: r.max })}</span>`);
  else if (r.problem === "near") out.push(`<span class="down">${t(lang, "r.near", { n: r.min })}</span>`);
  else if (r.problem === "far") out.push(`<span class="down">${t(lang, "r.far", { d: r.dist, max: r.max })}</span>`);
  else if (r.problem === "low") out.push(`<span class="down">${t(lang, "r.low", { d: r.dist, max: r.max })}</span>`);
  else out.push(`<span class="down">${t(lang, "r.sight", { what: blockerName(r.blocker!) })}</span>`, `<span class="quiet">${t(lang, "r.dist", { d: r.dist, max: r.max })}</span>`);
  out.push(...reachBonusLines(r));
  return out;
}

/** What height and Aim add to (or take from) the reach to one tile. */
function reachBonusLines(r: Reach): string[] {
  const out: string[] = [];
  if (r.height > 0) out.push(`<span class="hg">${t(lang, "highReach", { n: r.height })}</span>`);
  if (r.height < 0) out.push(`<span class="down">${t(lang, "lowReach", { n: -r.height })}</span>`);
  if (r.aim) out.push(`<span class="hg">${t(lang, "r.aim")}</span>`);
  return out;
}

/** What stands between the caster and the tile aimed at, in words. */
function blockerName(p: Pos): string {
  const o = unitAt(state, p);
  if (o && o.life === "up") return o.name;
  const tile = tileAt(state.map, p)!;
  if (tile.steamUntil !== undefined) return t(lang, "r.steam");
  if (tile.prop) return t(lang, `r.${tile.prop}` as TextKey);
  if (tile.terrain === "tree") return t(lang, "r.tree");
  return t(lang, "r.ground");
}

/** A small map of an ability's reach around the caster (gold), with what it cannot reach close by darkened and,
    for area abilities, the area it covers at the far end (orange). */
function shapeDiagram(ab: Ability): string {
  const R = Math.min(ab.range[1], 6), n = R + (ab.area === "single" ? 0 : 1);
  if (n === 0) return "";
  const area = new Set(ab.area === "single" ? [] : areaTiles(ab, { x: 0, y: -R }).map((p) => `${p.x},${p.y}`));
  let cells = "";
  for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) {
    const d = Math.abs(x) + Math.abs(y);
    const cls = x === 0 && y === 0 ? "me" : area.has(`${x},${y}`) ? "ar" : d <= R && d >= ab.range[0] ? "in" : d <= R ? "no" : "";
    cells += cls ? `<i class="${cls}"></i>` : "<i></i>";
  }
  return `<div class="shape" style="grid-template-columns:repeat(${2 * n + 1},var(--c))" aria-hidden="true">${cells}</div>`;
}

/** What the ground under a tile does: objects, fire, ice. */
function tileInfo(at: Pos): string[] {
  const tile = tileAt(state.map, at);
  if (!tile) return [];
  const out: string[] = [];
  if (tile.prop === "barrel") out.push(`<b>${t(lang, "barrel")}</b> · ${t(lang, "barrelInfo")}`);
  if (tile.prop === "crate") out.push(`<b>${t(lang, "crate")}</b> · ${t(lang, "crateInfo", { n: tile.propHp ?? 0 })}`);
  if (tile.prop === "rock") out.push(`<b>${t(lang, "rockName")}</b> · ${t(lang, ({ s: "rockS", m: "rockM", l: "rockL" } as const)[rockSizeOf(tile)])} ${t(lang, "rockInfo")}`);
  if ((tile.fireUntil ?? 0) > state.clock) out.push(`🔥 ${t(lang, tile.prop || tile.terrain === "tree" ? "burningObjInfo" : "fireInfo")}`);
  if (tile.scorchedAt !== undefined) out.push(t(lang, "scorchedInfo"));
  if (tile.terrain === "ice") out.push(`❄ ${t(lang, "iceInfo")}`);
  if (tile.surface === "oil") out.push(`<b>🛢</b> ${t(lang, "oilInfo")}`);
  if (tile.surface === "sap") out.push(`<b>◆</b> ${t(lang, "sapInfo")}`);
  if (tile.sapSource) out.push(`<b>◆</b> ${t(lang, "sapSourceInfo")}`);
  if (charged(state, tile)) out.push(`⚡ ${t(lang, "chargedInfo")}`);
  if (tile.steamUntil !== undefined) out.push(`☁ ${t(lang, "steamInfo")}`);
  if (tile.terrain === "bridge") out.push(t(lang, "bridgeInfo"));
  if (tile.terrain === "water") out.push(t(lang, "waterInfo"));
  if (tile.terrain === "tallgrass") out.push(`<b>🌾</b> ${t(lang, "tallGrassInfo")}`);
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

/** FFTA-style call-out: the name of the ability being used, in a window at the top, for a moment. */
let calloutTimer = 0;
function callout(unit: string, ability: string) {
  const u = unitById(state, unit), ab = ABILITIES[ability];
  if (!ab) return;
  const box = $("callout");
  box.className = `win ${u.team}`;
  box.innerHTML = `${icon(abilityIcon(ability, ab.element), "big")}<span><small>${u.name}</small>${abilityName(lang, ability)}</span>`;
  box.style.top = `${$("top").getBoundingClientRect().bottom + 6}px`;
  box.classList.add("show");
  clearTimeout(calloutTimer);
  calloutTimer = window.setTimeout(() => box.classList.remove("show"), u.team === "foes" ? 1300 : 900);
}

let toastTimer = 0;
/** The sound settings: music and effects volume, and mute. Saved on the device as they change. */
function toggleSoundPanel(open = $("soundPanel").style.display !== "flex") {
  const panel = $("soundPanel");
  panel.style.display = open ? "flex" : "none";
  if (!open) return;
  const s = audioSettings();
  const save = (next: Partial<typeof s>) => {
    setAudio(next); safeSet(AUDIO_KEY, JSON.stringify(audioSettings()));
    const ic = audioSettings().muted ? "muted" : "sound";
    for (const id of ["sound", "mapSound"]) { const img = $(id).querySelector("img"); if (img) img.outerHTML = icon(ic); }
  };
  const slider = (key: "music" | "sfx", text: string) => {
    const l = document.createElement("label"); l.textContent = text;
    const r = document.createElement("input"); r.type = "range"; r.min = "0"; r.max = "100"; r.value = String(Math.round(s[key] * 100));
    r.setAttribute("aria-label", text);
    r.oninput = () => save({ [key]: Number(r.value) / 100 });
    if (key === "sfx") r.onchange = () => sfx("hurt");
    l.append(r); return l;
  };
  const mute = document.createElement("label"); mute.className = "check";
  const box = document.createElement("input"); box.type = "checkbox"; box.checked = s.muted;
  box.onchange = () => save({ muted: box.checked });
  mute.append(box, t(lang, "soundMute"));
  const title = document.createElement("h3"); title.textContent = t(lang, "sound");
  const close = document.createElement("button"); close.textContent = t(lang, "close"); close.onclick = () => toggleSoundPanel(false);
  panel.replaceChildren(title, slider("music", t(lang, "soundMusic")), slider("sfx", t(lang, "soundSfx")), mute, close);
  panel.querySelector<HTMLInputElement>("input")?.focus();
}

/** The options screen of the title: sound, language and the battle view, saved on the device as they change. */
function fillOptions(box: HTMLElement, rerender: () => void) {
  const s = audioSettings();
  const save = (next: Partial<typeof s>) => { setAudio(next); safeSet(AUDIO_KEY, JSON.stringify(audioSettings())); };
  const slider = (key: "music" | "sfx", text: string) => {
    const l = document.createElement("label"); l.textContent = text;
    const r = document.createElement("input"); r.type = "range"; r.min = "0"; r.max = "100"; r.value = String(Math.round(s[key] * 100));
    r.setAttribute("aria-label", text);
    r.oninput = () => save({ [key]: Number(r.value) / 100 });
    if (key === "sfx") r.onchange = () => sfx("hurt");
    l.append(r); return l;
  };
  const mute = document.createElement("label"); mute.className = "check";
  const box2 = document.createElement("input"); box2.type = "checkbox"; box2.checked = s.muted;
  box2.onchange = () => save({ muted: box2.checked });
  mute.append(box2, t(lang, "soundMute"));
  /** A row of choices, the chosen one lit. */
  const seg = (title: string, items: { text: string; on: boolean; pick: () => void }[]) => {
    const l = document.createElement("label"); l.textContent = title;
    const row = document.createElement("div"); row.className = "seg";
    for (const it of items) {
      const b = document.createElement("button"); b.textContent = it.text; b.className = it.on ? "primary" : "";
      b.setAttribute("aria-pressed", String(it.on));
      b.onclick = () => { sfx("select"); it.pick(); rerender(); };
      row.append(b);
    }
    l.append(row); return l;
  };
  const setLang = (l: typeof lang) => { lang = l; safeSet(LANG_KEY, lang); document.documentElement.lang = lang; };
  const setView = (flat: boolean) => { setFlat(flat); safeSet(VIEW_KEY, flat ? "flat" : "iso"); };
  box.replaceChildren(
    slider("music", t(lang, "soundMusic")), slider("sfx", t(lang, "soundSfx")), mute,
    seg(t(lang, "optLang"), [{ text: "Español", on: lang === "es", pick: () => setLang("es") }, { text: "English", on: lang === "en", pick: () => setLang("en") }]),
    seg(t(lang, "optView"), [{ text: t(lang, "optIso"), on: !isFlat(), pick: () => setView(false) }, { text: t(lang, "optFlat"), on: isFlat(), pick: () => setView(true) }]),
  );
}

/** What the title says about the saved run, or null when there is nothing to go back to. */
function savedLine(): string | null {
  if (!journey || choosingDifficulty || journey.over) return null;
  const region = regionOf(journey).name[lang];
  return journey.battle ? t(lang, "menuContinueBattle", { region })
    : t(lang, "menuContinueRoad", { region, n: journey.path.length, diff: t(lang, `diff.${journey.difficulty ?? "normal"}`) });
}

function titleOptions(): TitleOptions {
  return {
    lang, saved: savedLine(), build: BUILD,
    onContinue: () => { sfx("select"); leaveTitle(); },
    onNew: () => { sfx("select"); hideTitle(); startRun(); },
    fillOptions,
  };
}

/** Opens the title over whatever is on screen (the saved run waits behind it, already loaded). */
function openTitle() {
  for (const fold of document.querySelectorAll<HTMLElement>(".fold.open")) fold.classList.remove("open");
  if (journey && !choosingDifficulty) persist();
  playMusic("camp");
  showTitle(titleOptions);
}

/** Back to the run as it was: the screen behind is redrawn in the language and view the options may have changed. */
function leaveTitle() {
  hideTitle();
  if (onMap) showMap();
  else { playMusic(journey.map.nodes[journey.battle?.node ?? -1]?.kind === "boss" ? "boss" : "battle"); refresh(); }
}

function toast(msg: string, ms = 1600) {
  if (msg === t(lang, "tooPoor")) sfx("error");
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------- travel scenes and the route map ---------- */

/** One travel scene being shown: a strip of terrain with the party walking it (src/run/travel.ts). */
interface Play {
  key: string;
  kind: "depart" | "approach";
  scene: Scene;
  /** A battle state that only holds the strip and the walkers, for the renderer. */
  stage: BattleState;
  motions: Map<string, Motion>;
  /** When the walk started; null while it waits (an answer is due first). */
  started: number | null;
  /** When the last walker arrives. */
  done: number;
  finished: boolean;
  /** Ambush foes jump out once the party arrives; then this is when they landed. */
  sprung?: number;
  /** When the intro before a fight began (the ground around the arena drops away). */
  intro?: number;
  onDone?: () => void;
}
let play: Play | null = null;
let mapOpen = false;
/** The sign (open node) the keyboard or controller is on, at the fork and on the route map. */
let signSel = 0;
/** The arena the party just fought on and where they stood, so the next walk sets out from there. */
let lastArena: { key: string; map: GridMap; at: Pos[] } | null = null;
/** The first walk after loading a save is skipped: the party is already at the fork. */
let skipNextWalk = false;
let sceneView: View = { ox: 0, oy: 0, scale: 1, rot: 0 };
let sceneCam: { x: number; y: number } | null = null;
const TRAVEL_STEP_MS = 210, FOLLOW_GAP_MS = 340;
const sceneFloaters: Floater[] = [];

const sceneKey = () => `${journey.seed}:${journey.region ?? 0}:${journey.at}:${journey.path.length}:${fielded(journey).map((m) => m.id).join(",")}`;
/** The walk can start: nothing to answer and no panel open. */
const canWalk = () => !choosingDifficulty && !journey.over && !journey.offers.length && !gearOpen && !statsOpen;

function partySpecs(): UnitSpec[] {
  return [heroOf(journey), ...fielded(journey).map((m) => memberSpec(m, journey.hero.level, { x: 0, y: 0 }, journey.shards))];
}

/** Puts a scene on screen: everyone stands where their path ends (the renderer draws the trip from the motions). */
function stagePlay(key: string, kind: Play["kind"], scene: Scene, party: UnitSpec[], foes: UnitSpec[] = [], onDone?: () => void): Play {
  const units = [
    ...party.slice(0, scene.paths.length).map((u, i) => ({ ...u, pos: { ...scene.paths[i]!.at(-1)! } })),
    ...foes.map((u, i) => ({ ...u, pos: { ...scene.foes[i]! } })),
  ];
  const stage = createBattle({ seed: 0, map: scene.map, units });
  for (const u of stage.units) {
    u.facing = u.team === "heroes" ? "N" : "S";
    if (u.team === "foes" && scene.ambush) u.life = "escaped"; // hidden until they spring
  }
  const motions = new Map<string, Motion>();
  scene.paths.forEach((path, i) => motions.set(units[i]!.id, { points: path, born: Infinity, stepMs: TRAVEL_STEP_MS, kind: "walk" }));
  sceneCam = null;
  return { key, kind, scene, stage, motions, started: null, done: Infinity, finished: false, onDone };
}

function startWalk(p: Play) {
  const now = performance.now();
  p.started = now;
  let i = 0, done = now;
  for (const mo of p.motions.values()) { mo.born = now + i++ * FOLLOW_GAP_MS; done = Math.max(done, mo.born + motionMs(mo)); }
  p.done = done;
}

/** Jumps to the end of the walk (a tap, Space, A). */
function skipWalk() {
  if (!play || play.finished) return;
  if (play.started === null) startWalk(play);
  for (const mo of play.motions.values()) mo.born = -1e9;
  play.done = performance.now();
}

/** The walk out of the place the party is at, to the fork. Built once per stop; waits while an answer is due. */
function ensureDepart() {
  if (journey.over) return;
  const key = sceneKey();
  if (play?.key === key && play.kind === "depart") { if (play.started === null && canWalk()) startWalk(play); return; }
  const at = journey.at === null ? null : journey.map.nodes[journey.at]!;
  const place = at ? placeOf(at.kind) : null;
  const origin: Origin = lastArena && lastArena.key === `${journey.region ?? 0}:${journey.at}` ? { t: "arena", map: lastArena.map, at: lastArena.at }
    : place ? { t: "place", place } : { t: "gate" };
  const open = choices(journey.map, journey.at);
  const scene = departScene(`${journey.seed}:${journey.region ?? 0}:${journey.at}`, regionOf(journey).id, origin, open, 1 + fielded(journey).length);
  play = stagePlay(key, "depart", scene, partySpecs());
  signSel = Math.max(0, open.findIndex((n) => n.col === 1));
  if (skipNextWalk) { skipNextWalk = false; skipWalk(); play.finished = true; return; }
  if (canWalk()) startWalk(play);
}

/** After a pick: the walk down that path to what waits at its end, then the battle (or the stop's panel). */
function approach(nodeId: number, then: () => void) {
  const node = journey.map.nodes[nodeId]!;
  const b = journey.battle;
  const seed = `${journey.seed}:${journey.region ?? 0}:to:${nodeId}`;
  let scene: Scene, party: UnitSpec[], foes: UnitSpec[] = [];
  if (b) {
    const heroes = b.setup.units.filter((u) => u.team === "heroes");
    foes = b.setup.units.filter((u) => u.team === "foes");
    scene = approachScene(seed, regionOf(journey).id, node.col, { t: "fight", arena: b.setup.map, party: heroes.map((u) => u.pos), foes: foes.map((u) => u.pos), ambush: !!b.setup.ambush }, heroes.length);
    party = heroes;
  } else {
    party = partySpecs();
    scene = approachScene(seed, regionOf(journey).id, node.col, { t: "place", place: placeOf(node.kind) ?? "clearing" }, party.length);
  }
  play = stagePlay(`to:${nodeId}`, "approach", scene, party, foes, then);
  startWalk(play);
}

/** Every frame on the travel screen: ends the walk, springs an ambush, then hands over. */
function tickPlay(now: number) {
  if (!play || play.finished || play.started === null || now < play.done) return;
  if (play.scene.ambush && play.sprung === undefined) {
    // The foes jump out of cover: a hop in from the side, and a shout over each of them.
    play.sprung = now;
    for (const u of play.stage.units) {
      if (u.team !== "foes") continue;
      u.life = "up";
      const side = u.pos.x < play.stage.map.w / 2 ? -1 : 1;
      const from = { x: Math.max(0, Math.min(play.stage.map.w - 1, u.pos.x + side)), y: u.pos.y };
      play.motions.set(u.id, { points: [from, { ...u.pos }], born: now, stepMs: 260, kind: "walk" });
      sceneFloaters.push({ pos: { ...u.pos }, text: "!", color: "#ff8a7a", born: now });
    }
    toast(t(lang, "ambushTag"), 1200);
    play.done = now + 1100;
    return;
  }
  if (play.kind === "approach" && play.scene.arenaRows > 0 && play.intro === undefined) {
    // Before the fight: everything that is not the arena falls away, row by row from the arena's edge.
    play.intro = now;
    const rows = play.stage.map.h - play.scene.arenaRows;
    play.done = now + rows * INTRO.rowMs + INTRO.jitterMs + INTRO.fallMs + INTRO.holdMs;
    $("runHint").textContent = "";
    sfx("door");
    return;
  }
  if (play.intro !== undefined) introFrom = sceneView.scale;
  play.finished = true;
  if (play.kind === "depart" && $("runHint").textContent === t(lang, "walking")) $("runHint").textContent = t(lang, "travelHint");
  const next = play.onDone;
  play.onDone = undefined;
  next?.();
}

/** Where the hero is drawn right now on the strip, for the camera. */
function walkerPoint(p: Play, time: number) {
  const mo = p.motions.get(p.stage.units.find((u) => u.team === "heroes" && u.id === heroOf(journey).id)?.id ?? "") ?? [...p.motions.values()][0];
  const m = p.stage.map;
  if (!mo) return tileCenter(m, p.scene.paths[0]!.at(-1)!, 0);
  const e = Math.max(0, Math.min(mo.points.length - 1, (time - mo.born) / mo.stepMs));
  const i = Math.min(mo.points.length - 2, Math.floor(e)), f = e - i;
  if (mo.points.length < 2) return tileCenter(m, mo.points[0]!, 0);
  const a = tileCenter(m, mo.points[i]!, 0), b = tileCenter(m, mo.points[i + 1]!, 0);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Tile width on screen for scenes: big enough to read the pixel art, smaller on a phone. */
function sceneScale(dpr: number) {
  const want = Math.max(56, Math.min(104, innerWidth / 7));
  return Math.max(1, Math.round((want / TW) * 2) / 2) * dpr;
}

function drawScene(time: number) {
  if (!play) return;
  tickPlay(time);
  const dpr = window.devicePixelRatio || 1;
  const top = $("travelTop").getBoundingClientRect().height, bottom = $("travelBottom").getBoundingClientRect().height;
  let scale = sceneScale(dpr);
  if (play.intro !== undefined) {
    // The intro also pulls back until the whole arena fits, so the fight opens at nearly the same size.
    const size = mapPixelSize({ ...play.stage.map, h: play.scene.arenaRows });
    // Same rule as the battle's own first zoom (layout): never smaller than a finger-sized tile.
    const base = Math.min((innerWidth - 16) / size.w, (innerHeight - top - bottom - 40) / size.h);
    const fit = base * Math.min(2, Math.max(1, MIN_TILE_PX / (TW * base))) * dpr;
    const k = Math.min(1, (time - play.intro) / Math.max(1, (play.done - play.intro) * 0.85)), e = k * k * (3 - 2 * k);
    if (fit < scale) scale = scale + (fit - scale) * e;
  }
  // The camera follows the hero, a little ahead of them on the way, eased so it never jerks; in the intro before a
  // fight it settles slowly on the middle of the arena.
  const intro = play.intro;
  const at = walkerPoint(play, time);
  const arenaMid = intro !== undefined ? tileCenter(play.stage.map, { x: (play.stage.map.w - 1) / 2, y: (play.scene.arenaRows - 1) / 2 }, 0) : null;
  const target = arenaMid ?? { x: at.x + 40, y: at.y - 50 };
  const ease = arenaMid ? 0.045 : 0.08;
  sceneCam = sceneCam ? { x: sceneCam.x + (target.x - sceneCam.x) * ease, y: sceneCam.y + (target.y - sceneCam.y) * ease } : target;
  const midY = top + (innerHeight - top - bottom) / 2;
  sceneView = { rot: 0, scale, ox: canvas.width / 2 - sceneCam.x * scale, oy: midY * dpr - sceneCam.y * scale };
  const wasFlat = isFlat(); setFlat(false);
  const arenaRows = play.scene.arenaRows;
  const sink = intro === undefined ? undefined : (p: Pos) => {
    if (p.y < arenaRows) return null;
    const delay = (p.y - arenaRows) * INTRO.rowMs + ((p.x * 37 + p.y * 17) % 7) / 6 * INTRO.jitterMs;
    const k = (time - intro - delay) / INTRO.fallMs;
    if (k <= 0) return null;
    return { dy: 260 * k * k, alpha: Math.max(0, 1 - k * 1.1) };
  };
  drawBattle(ctx, play.stage, images, sceneView, { marks: new Map(), hover: null, active: null, time, floaters: sceneFloaters, motions: play.motions, bare: true, sink });
  setFlat(wasFlat);
  placeSigns();
}

/** Signposts at the fork: buttons over the sign tiles, shown once the party has arrived and nothing is due. */
function placeSigns() {
  const box = $("signs");
  const show = onMap && !mapOpen && !!play && play.kind === "depart" && play.finished && !journey.offers.length && !journey.over && !choosingDifficulty && !gearOpen && !statsOpen;
  box.style.display = show ? "" : "none";
  if (!show || !play) return;
  const dpr = window.devicePixelRatio || 1;
  if (box.childElementCount !== play.scene.signs.length || box.dataset.key !== `${play.key}:${lang}`) {
    box.dataset.key = `${play.key}:${lang}`;
    box.replaceChildren(...play.scene.signs.map((s, i) => {
      const n = journey.map.nodes[s.node]!;
      const b = document.createElement("button");
      b.className = `sign ${n.kind}`;
      b.innerHTML = `${icon(n.kind, "big")}<span></span>`;
      b.querySelector("span")!.textContent = nodeLabel(journey, n, lang, true);
      b.title = nodeLabel(journey, n, lang);
      b.onclick = () => { signSel = i; pickNode(s.node); };
      return b;
    }));
  }
  [...box.children].forEach((el, i) => {
    const s = play!.scene.signs[i]!, c = tileCenter(play!.stage.map, s.pos, 0);
    const e = el as HTMLElement;
    // Placed by left/top alone (no transform), so no press or hover style on buttons can shift a sign away
    // from under the pointer mid-click.
    e.style.left = `${(c.x * sceneView.scale + sceneView.ox) / dpr - e.offsetWidth / 2}px`;
    e.style.top = `${(c.y * sceneView.scale + sceneView.oy) / dpr - 18 - e.offsetHeight}px`;
    e.classList.toggle("sel", i === signSel && padUsed);
  });
}

/* The route map overlay: the run map as a small isometric world, drawn on the canvas. */
let routeCache: { key: string; grid: RouteGrid; stage: BattleState } | null = null;
let routeView: View = { ox: 0, oy: 0, scale: 1, rot: 0 };
let routePan = { x: 0, y: 0 };
/** Icons on the route map grow when the map is drawn small, so they stay easy to read and tap. */
let routeIcon = 1;

function routeStage() {
  const key = `${journey.seed}:${journey.region ?? 0}:${journey.at}:${journey.path.length}`;
  if (routeCache?.key === key) return routeCache;
  const grid = routeGrid(journey, regionOf(journey).id);
  const pos = journey.at === null ? grid.start : grid.tileOf[journey.at]!;
  const stage = createBattle({ seed: 0, map: grid.map, units: [{ ...heroOf(journey), pos: { ...pos } }] });
  stage.units[0]!.facing = "N";
  routeCache = { key, grid, stage };
  return routeCache;
}

function openMap(open: boolean) {
  mapOpen = open;
  document.body.classList.toggle("mapopen", open);
  $("runmap").style.display = open ? "block" : "none";
  if (open) {
    routePan = { x: 0, y: 0 };
    const nodes = onMap ? nextNodes(journey) : [];
    signSel = Math.max(0, Math.min(signSel, nodes.length - 1));
    $("routeTitle").textContent = `🗺 ${t(lang, "routeMap")} · ${regionOf(journey).name[lang]}`;
    $("routeKeys").textContent = t(lang, "mapKeys");
    $("closeMap").textContent = `✕ ${t(lang, "closeMap")}`;
  }
  tooltip(null);
}

/** The island's drawn extent in unscaled map pixels: its tiles, the icons over the nodes and their labels. */
function routeBounds(grid: RouteGrid) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  grid.map.tiles.forEach((t, i) => {
    if (t.offMap) return;
    const c = tileCenter(grid.map, { x: i % grid.map.w, y: Math.floor(i / grid.map.w) }, 0);
    x0 = Math.min(x0, c.x - TW / 2); x1 = Math.max(x1, c.x + TW / 2);
    y0 = Math.min(y0, c.y - 40); y1 = Math.max(y1, c.y + 16 + (t.h + 1) * 16);
  });
  for (const id of grid.tileOf.keys()) y0 = Math.min(y0, iconAt(grid, id).y - 20);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function drawRoute(time: number) {
  const { grid, stage } = routeStage();
  const dpr = window.devicePixelRatio || 1;
  const top = $("routeTop").getBoundingClientRect().height, bottom = $("routeBottom").getBoundingClientRect().height;
  // The whole island always fits: it runs up the screen, so it suits a phone held upright as well as a desktop.
  const box = routeBounds(grid);
  const availW = innerWidth - 16, availH = innerHeight - top - bottom - 16;
  const fit = Math.min(availW / box.w, availH / box.h);
  const s = Math.min(1.5, fit);
  const scale = s * dpr;
  const open = onMap ? nextNodes(journey) : [];
  routeView = {
    rot: 0, scale,
    ox: canvas.width / 2 - (box.x0 + box.w / 2) * scale + routePan.x * dpr,
    oy: (top + 8 + availH / 2) * dpr - (box.y0 + box.h / 2) * scale + routePan.y * dpr,
  };
  routeIcon = Math.max(1, 0.85 / s);
  const done = new Set(journey.path);
  const ahead = journey.over ? new Set<number>() : aheadOf(journey.map, journey.at);
  const marks = new Map<string, Mark>();
  for (const n of journey.map.nodes) {
    const p = grid.tileOf[n.id]!;
    if (done.has(n.id)) marks.set(`${p.x},${p.y}`, "chosen");
    else if (open.some((o) => o.id === n.id)) marks.set(`${p.x},${p.y}`, "move");
  }
  const sel = open[signSel];
  const wasFlat = isFlat(); setFlat(false);
  drawBattle(ctx, stage, images, routeView, { marks, hover: sel ? grid.tileOf[sel.id]! : null, active: null, time, floaters: [], bare: true });
  setFlat(wasFlat);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, routeView.ox, routeView.oy);
  // The links, drawn over the trails from icon to icon: gold where the party went, bright and moving where it
  // can go next, plain where it could still go later, and faint where it can no longer go.
  const startAt = (() => { const c = tileCenter(grid.map, grid.start, 0); return { x: c.x, y: c.y - 14 }; })();
  const went = new Set<string>();
  journey.path.forEach((id, i) => went.add(`${i ? journey.path[i - 1] : "s"}>${id}`));
  const links: { from: { x: number; y: number }; to: { x: number; y: number }; kind: "went" | "next" | "later" | "gone" }[] = [];
  const kindOf = (from: number | null, to: number) => {
    if (went.has(`${from ?? "s"}>${to}`)) return "went" as const;
    if (from === journey.at && open.some((o) => o.id === to)) return "next" as const;
    if (ahead.has(to) && (from === null ? journey.at === null : ahead.has(from) || from === journey.at)) return "later" as const;
    return "gone" as const;
  };
  for (const n of journey.map.nodes) {
    if (n.layer === 0) links.push({ from: startAt, to: iconAt(grid, n.id), kind: kindOf(null, n.id) });
    for (const id of n.next) links.push({ from: iconAt(grid, n.id), to: iconAt(grid, id), kind: kindOf(n.id, id) });
  }
  const order = { gone: 0, later: 1, went: 2, next: 3 };
  links.sort((a, b) => order[a.kind] - order[b.kind]);
  ctx.lineCap = "round";
  for (const l of links) {
    const w = (l.kind === "gone" ? 2 : l.kind === "later" ? 2.5 : 3.5) * Math.min(routeIcon, 1.6);
    ctx.setLineDash(l.kind === "next" ? [7 * routeIcon, 5 * routeIcon] : l.kind === "gone" ? [2, 5] : []);
    ctx.lineDashOffset = l.kind === "next" ? -time / 40 : 0;
    ctx.beginPath(); ctx.moveTo(l.from.x, l.from.y); ctx.lineTo(l.to.x, l.to.y);
    ctx.strokeStyle = "rgba(20, 16, 30, 0.75)"; ctx.lineWidth = w + 2.5; if (l.kind !== "gone") ctx.stroke();
    ctx.strokeStyle = l.kind === "went" ? "#ffd86b" : l.kind === "next" ? "#ffffff" : l.kind === "later" ? "rgba(225, 230, 255, 0.85)" : "rgba(160, 165, 190, 0.45)";
    ctx.lineWidth = w; ctx.stroke();
  }
  ctx.setLineDash([]);
  // Icons over the nodes, with names over the ones that can be picked; stops the party can no longer reach fade.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const n of journey.map.nodes) {
    const c = iconAt(grid, n.id);
    const isOpen = open.some((o) => o.id === n.id), r = (n.kind === "boss" ? 15 : 12) * routeIcon;
    const live = isOpen || done.has(n.id) || ahead.has(n.id) || n.kind === "boss";
    ctx.globalAlpha = live ? 1 : 0.4;
    const bob = isOpen ? Math.sin(time / 260 + n.id) * 2 : 0;
    ctx.beginPath(); ctx.arc(c.x, c.y + bob, r, 0, Math.PI * 2);
    ctx.fillStyle = done.has(n.id) ? "#4a4220" : n.kind === "boss" ? "#3d1f2a" : "#2a2c3d"; ctx.fill();
    ctx.lineWidth = isOpen ? 2.5 : 1.5;
    ctx.strokeStyle = n.rival ? "#d9a0ff" : isOpen || done.has(n.id) ? "#ffd86b" : live ? "#9a9ec0" : "#5a5e80"; ctx.stroke();
    const isz = (n.kind === "boss" ? 22 : 18) * routeIcon;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(iconCanvas(n.kind), Math.round(c.x - isz / 2), Math.round(c.y + bob - isz / 2), isz, isz);
    if (isOpen) {
      ctx.font = `600 ${11 * routeIcon}px "Pixelify Sans", system-ui, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = "#1d1f2b"; ctx.fillStyle = "#ffd86b";
      const label = nodeLabel(journey, n, lang, true);
      ctx.strokeText(label, c.x, c.y + r + 9 + bob); ctx.fillText(label, c.x, c.y + r + 9 + bob);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Where a node's icon floats, above its tile. */
function iconAt(grid: RouteGrid, id: number) {
  const c = tileCenter(grid.map, grid.tileOf[id]!, 0);
  return { x: c.x, y: c.y - 24 };
}

/** A tap on the route map: the open node whose icon (or tile) is nearest, within reach of a finger. */
function routeTap(ev: { clientX: number; clientY: number }) {
  if (!onMap) return;
  const { grid } = routeStage();
  const c = toCanvas(ev);
  const px = (c.x - routeView.ox) / routeView.scale, py = (c.y - routeView.oy) / routeView.scale;
  let best: { id: number; d: number } | null = null;
  for (const n of nextNodes(journey)) {
    const a = iconAt(grid, n.id), b = tileCenter(grid.map, grid.tileOf[n.id]!, 0);
    const d = Math.min(Math.hypot(a.x - px, a.y - py), Math.hypot(b.x - px, b.y - py));
    if (d < 30 * routeIcon && (!best || d < best.d)) best = { id: n.id, d };
  }
  if (best) pickNode(best.id);
}

/* ---------- keyboard and controller ---------- */

/** True once a controller or the arrow keys have been used, so the selection outline shows. */
let padUsed = false;
let cursor: Pos | null = null;
type Input = "up" | "down" | "left" | "right" | "confirm" | "back" | "map" | "next" | "end" | "rotL" | "rotR" | "danger" | "hold";

/** Buttons the player can move between in the panel that is in front. */
function panelButtons(): HTMLButtonElement[] {
  const panel = $("runPanel");
  if (panel.style.display === "none" || !panel.childElementCount) return [];
  return [...panel.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.disabled && b.offsetParent !== null);
}

function moveFocus(list: HTMLElement[], dir: number) {
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLElement);
  const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length]!;
  next.focus();
  next.scrollIntoView({ block: "nearest" });
}

function input(k: Input) {
  padUsed = true;
  if (titleOpen()) {
    const list = titleButtons();
    if (k === "up" || k === "left") moveFocus(list, -1);
    else if (k === "down" || k === "right") moveFocus(list, 1);
    else if (k === "confirm") { const f = document.activeElement; if (f instanceof HTMLButtonElement && list.includes(f)) f.click(); else list[0]?.focus(); }
    else if (k === "back") titleBack();
    return;
  }
  if (k === "map") { if (!choosingDifficulty) openMap(!mapOpen); return; }
  const buttons = panelButtons();
  if (buttons.length) {
    // A panel is in front (a reward, a shop, a talk): move between its buttons, A presses the one in focus.
    if (k === "up" || k === "left") moveFocus(buttons, -1);
    else if (k === "down" || k === "right") moveFocus(buttons, 1);
    else if (k === "confirm") { const f = document.activeElement; if (f instanceof HTMLButtonElement && buttons.includes(f)) f.click(); else buttons[0]!.focus(); }
    else if (k === "back" && (gearOpen || statsOpen)) { gearOpen = false; statsOpen = false; showMap(); }
    return;
  }
  if (mapOpen) {
    const open = onMap ? nextNodes(journey) : [];
    if (k === "left" || k === "up") signSel = (signSel + open.length - 1) % Math.max(1, open.length);
    else if (k === "right" || k === "down") signSel = (signSel + 1) % Math.max(1, open.length);
    else if (k === "confirm" && open[signSel]) pickNode(open[signSel]!.id);
    else if (k === "back") openMap(false);
    return;
  }
  if (onMap) {
    if (!play) return;
    if (!play.finished) { if (k === "confirm") skipWalk(); return; }
    const signs = play.kind === "depart" ? play.scene.signs : [];
    if (!signs.length) return;
    if (k === "left" || k === "up") signSel = (signSel + signs.length - 1) % signs.length;
    else if (k === "right" || k === "down") signSel = (signSel + 1) % signs.length;
    else if (k === "confirm") pickNode(signs[Math.min(signSel, signs.length - 1)]!.node);
    return;
  }
  // In battle.
  if ($("overlay").style.display === "flex") {
    // After a battle: move between the Spare / Finish buttons and the button to go on; A presses the one in focus.
    const list = overlayButtons();
    if (k === "up" || k === "left") moveFocus(list, -1);
    else if (k === "down" || k === "right") moveFocus(list, 1);
    else if (k === "confirm") {
      const f = document.activeElement;
      if (f instanceof HTMLButtonElement && list.includes(f)) f.click();
      else if (unsettled(state).length) list[0]?.focus();
      else afterBattleButton();
    }
    return;
  }
  if (k === "hold") { toggleHold(); return; }
  if (k === "rotL" || k === "rotR") { view.rot = (view.rot + (k === "rotL" ? -1 : 1) + 4) % 4; hover = cursor; tooltip(cursor); return; }
  if (k === "danger") { dangerAll = !dangerAll; refresh(); return; }
  if ((!heroTurn() && !deploy) || busy || animating()) return;
  if (k === "end") { if (deploy) beginFight(); else $("end").click(); return; }
  if (deploy && k === "next") return;
  if (k === "back") { selected = null; pending = null; inspect = null; tooltip(null); refresh(); return; }
  if (k === "next") {
    // Cycles the abilities that can be used now, then back to moving.
    const u = activeUnit(state), list = menuOrder(u).filter((id) => !abilityAvailable(u, id));
    const i = selected ? list.indexOf(selected) : -1;
    selected = i + 1 < list.length ? list[i + 1]! : null; pending = null;
    if (selected && ABILITIES[selected]!.quick) quickOpen = true;
    refresh(); tooltip(cursor);
    return;
  }
  const u = activeUnit(state);
  if (!cursor || !tileAt(state.map, cursor)) cursor = { ...u.pos };
  if (k === "confirm") { onTap(cursor, true); return; }
  // The d-pad moves the cursor along the diagonals as they look on screen, whatever the turn of the view.
  const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k as "up"];
  if (!step) return;
  const r = rotateGrid(state.map, cursor, view.rot);
  const n = unrotateGrid(state.map, { x: r.x + step[0]!, y: r.y + step[1]! }, view.rot);
  if (!tileAt(state.map, n)) return;
  cursor = n; hover = n; pending = null; refresh(); tooltip(n);
  const s = screenOf(n);
  if (s.clientX < 60 || s.clientX > innerWidth - 60 || s.clientY < 120 || s.clientY > innerHeight - 140) centreOn(n);
}

/** Standard-mapping gamepad: buttons and the left stick become the same inputs as the keyboard. */
const PAD_BUTTONS: Partial<Record<number, Input>> = { 0: "confirm", 1: "back", 2: "next", 3: "danger", 4: "rotL", 5: "rotR", 6: "hold", 8: "map", 9: "end", 12: "up", 13: "down", 14: "left", 15: "right" };

function toggleHold() {
  holdBack = !holdBack;
  safeSet(HOLD_KEY, holdBack ? "1" : "");
  refresh(); tooltip(cursor ?? hover);
}
const padHeld = new Map<string, number>();
function pollPads(now: number) {
  const pads = navigator.getGamepads?.() ?? [];
  const down = new Set<string>();
  for (const gp of pads) {
    if (!gp) continue;
    gp.buttons.forEach((b, i) => { if (b.pressed && PAD_BUTTONS[i]) down.add(PAD_BUTTONS[i]!); });
    const [ax = 0, ay = 0] = gp.axes;
    if (ax < -0.6) down.add("left"); if (ax > 0.6) down.add("right");
    if (ay < -0.6) down.add("up"); if (ay > 0.6) down.add("down");
  }
  for (const k of down) {
    const since = padHeld.get(k);
    // Fires on press, then repeats while a direction is held.
    const dir = k === "up" || k === "down" || k === "left" || k === "right";
    if (since === undefined) { padHeld.set(k, now); input(k as Input); }
    else if (dir && now - since > 380) { padHeld.set(k, now - 380 + 140); input(k as Input); }
  }
  for (const k of [...padHeld.keys()]) if (!down.has(k)) padHeld.delete(k);
}

/* ---------- view: fit, zoom, pan, rotate ---------- */

/** A screen big enough for the menus to sit in the corners beside the map (not a phone either way up). */
const roomy = () => innerWidth > 720 && innerHeight > 560;

function layout() {
  const dpr = window.devicePixelRatio || 1;
  // Size the drawing buffer to the box the canvas really fills. Mobile browsers can make 100vh taller than the
  // visible window (the address bar), which used to stretch the picture and put taps one tile too low.
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  // On a wide screen the menus sit in the bottom corners, where the diamond-shaped map leaves room, so the map may
  // use the height down to the hint line; on a phone the menu spans the width and the map stays above it.
  const wide = roomy();
  const top = $("top").getBoundingClientRect().height, bottom = wide ? 34 : $("bottom").getBoundingClientRect().height;
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
  if (!heroTurn() || onMap) return;
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
    const ab = ABILITIES[selected]!;
    const hold = holdBack && !!(ab.damage || ab.push);
    return why ? { why: explain(why) } : { cmd: { t: "cast", unit: u.id, ability: selected, target: p, ...(hold ? { hold: true } : {}) } };
  }
  if (p.x === u.pos.x && p.y === u.pos.y) return null;
  if (reachable(state.map, u.pos, moveRules(state, u)).has(`${p.x},${p.y}`)) return { cmd: { t: "move", unit: u.id, to: p } };
  return unitAt(state, p) ? null : { why: t(lang, "cantReach") };
}

function act(cmd: Command) {
  const ok = run(cmd);
  if (cmd.t === "cast" && ok) { if (ABILITIES[cmd.ability]?.quick) quickOpen = false; selected = null; }
  if (cmd.t === "endTurn" || cmd.t === "wait" || cmd.t === "guard") quickOpen = false;
  pending = null;
  refresh();
  if (cmd.t === "cast") maybeFoeTurn();
}

/** A mouse click acts at once (the hover already previewed it). A finger has no hover, so its first tap chooses
    the tile and shows what will happen; tapping it again or pressing Confirm does it. */
function onTap(p: Pos, touch: boolean) {
  if (deploy) { deployTap(p); tooltip(p); return; }
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
  const sets = (p: Pos) => { const q = tileAt(state.map, p); return q?.prop === "barrel" || (ab.element === "fire" && q?.surface === "oil"); };
  if ((ab.push || ab.throwProp || tile?.prop === "barrel" || areaTiles(ab, at).some(sets)) && !castProblem(state, u, selected, at)) {
    out = previewEffects(state, u, ab, at);
    if (!out.moves.length && !out.blasts.length && !out.splashes.length) out = undefined;
  }
  effectsCache = { key, out };
  return out;
}

/** The selected attack's predicted damage on the unit under the finger or cursor, for the health bar. */
function previewHit() {
  const at = pending ?? hover;
  if (!selected || !at || !heroTurn()) return undefined;
  const u = activeUnit(state), target = unitAt(state, at), ab = ABILITIES[selected]!;
  if (!target || !(ab.damage || ab.push) || target.team === u.team || castProblem(state, u, selected, at)) return undefined;
  const r = damagePreview(state, u, target, ab), mv = previewMoves()?.moves.find((m) => m.unit === target.id), bump = (mv?.bump ?? 0) + (mv?.fall ?? 0);
  // Holding back, the bar shows the foe left on 1 HP at worst.
  const cap = (n: number) => (holdBack && target.life === "up" ? Math.min(n, target.hp - 1) : n);
  return { unit: target.id, min: cap(r.min + bump), max: cap(r.max + bump) };
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

/** Keeps the drawing buffer the size of the box the canvas fills (the battle's layout() does this too). */
function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1, box = canvas.getBoundingClientRect();
  const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

/** Behind the board: a dim plum glow in the middle fading to near black at the edges, so the island floats in a
    vignette instead of on a flat colour. Rebuilt only when the canvas changes size. */
let backdropFill: { w: number; h: number; g: CanvasGradient } | null = null;
function backdrop(): CanvasGradient {
  const w = canvas.width, h = canvas.height;
  if (!backdropFill || backdropFill.w !== w || backdropFill.h !== h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, "#2a2236"); g.addColorStop(0.55, "#1a1522"); g.addColorStop(1, "#0b0910");
    backdropFill = { w, h, g };
  }
  return backdropFill.g;
}

function frame(time: number) {
  if (onMap || mapOpen) sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = backdrop(); ctx.fillRect(0, 0, canvas.width, canvas.height);
  pollPads(time);
  if (mapOpen) { drawRoute(time); requestAnimationFrame(frame); return; }
  if (onMap) {
    drawScene(time);
    const walking = !!play && !play.finished && play.started !== null;
    $("skipBtn").style.display = walking ? "" : "none";
    requestAnimationFrame(frame); return;
  }
  const moving = time < animUntil;
  if (focus && time > focus.until) focus = null;
  const shake = time < shakeUntil ? Math.round(Math.sin(time / 22) * 3 * ((shakeUntil - time) / 320) * (window.devicePixelRatio || 1)) : 0;
  const aiming = moving ? null : aimView();
  let shown = shake ? { ...view, ox: view.ox + shake, oy: view.oy + shake / 2 } : view;
  if (introZoom) {
    // The fight opens at the travel scene's size and eases to its own, about the arena's centre.
    const k = Math.min(1, (time - introZoom.at) / INTRO_ZOOM_MS), e = 1 - (1 - k) ** 3;
    const size = mapPixelSize(state.map), sc = introZoom.from + (view.scale - introZoom.from) * e;
    const cx = view.ox + (size.w * view.scale) / 2, cy = view.oy + (size.h * view.scale) / 2;
    shown = { ...shown, scale: sc, ox: cx - (size.w * sc) / 2, oy: cy - (size.h * sc) / 2 };
    if (k >= 1) introZoom = null;
  }
  drawBattle(ctx, state, images, shown, {
    marks: aiming?.marks ?? new Map(), badges: aiming?.badges, sightLine: aiming?.line, outline: !!selected, hover, active: state.active, time, floaters, bursts, motions, flashes,
    danger: dangerTiles(), preview: moving ? undefined : previewHit(), effects: moving ? undefined : previewMoves(), focus: focus?.id,
    escapePaths: moving ? undefined : escapePaths(),
  });
  requestAnimationFrame(frame);
}

async function start() {
  const base = import.meta.env.BASE_URL;
  const tiles = ["top-grass", "top-tallgrass", "top-dirt", "top-water", "top-tree", "top-ice", "top-bridge", "side-left", "side-right", "obj-crate", "obj-crate-hurt", "obj-barrel", ...SCENERY_IMAGES];
  const srcs: Record<string, string> = Object.fromEntries(tiles.map((k) => [k, `${base}art/iso/${k}.png`]));
  const looks = [...TEST_UNITS, ...Object.values(COMPANIONS).map((c) => c.spec), ...REGIONS.flatMap((r) => [...(r.natives ?? []), ...(r.boss.unit ? [r.boss.unit] : [])])];
  for (const u of looks) srcs[`unit-${u.look}`] = `${base}art/creatures/${u.look}.png`;
  Object.assign(srcs, fxSources(base));
  initAudio(base, readAudioSettings(safeGet(AUDIO_KEY)));
  // Always the newest build: offline copy, a word when it changed, a check when back from the background.
  startUpdates({
    updated: (build) => setTimeout(() => toast(t(lang, "updated", { build }), 2600), 1200),
    reloadOk: () => onMap && !(play && !play.finished && play.started !== null),
    get: safeGet, set: safeSet,
  });
  [images] = await Promise.all([loadImages(srcs), loadPackIcons(import.meta.env.BASE_URL)]);
  // Pixel icons everywhere: the menu hand, and every emoji any text still carries becomes a pixel icon as it lands.
  document.documentElement.style.setProperty("--pointer", `url(${iconUrl("pointer")})`);
  // The pixel window and button frames (tools/ui-art.py), used by the nine-slice skin at the end of index.html's style.
  for (const f of ["win", "btn", "btn-gold", "btn-lit", "btn-go", "btn-red"])
    document.documentElement.style.setProperty(`--skin-${f}`, `url(${import.meta.env.BASE_URL}art/ui/${f}.png)`);
  iconize(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") iconize(m.target.parentNode ?? m.target);
      else m.addedNodes.forEach((n) => iconize(n));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // The help window follows the pointer, the keyboard focus and the controller's focus.
  // Help: a mouse shows it on hover; a finger has to hold the item (a tap just uses it); the keyboard and the
  // controller show it for the item in focus.
  document.addEventListener("pointerover", (ev) => {
    if (ev.pointerType !== "mouse") return;
    const el = (ev.target as Element).closest?.("[data-h]") ?? null;
    if (el !== helpHover) { helpHover = el; showHelp(); }
  });
  document.addEventListener("pointerout", (ev) => { if (ev.pointerType === "mouse" && !(ev.relatedTarget as Element | null)?.closest?.("[data-h]")) { helpHover = null; showHelp(); } });
  let holdTimer = 0, holdFrom = { x: 0, y: 0 }, swallowClick = false;
  const letGo = () => { clearTimeout(holdTimer); holdTimer = 0; if (held) { held = false; helpHover = null; showHelp(); } };
  document.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse") return;
    const el = (ev.target as Element).closest?.("[data-h]");
    if (!el) return;
    holdFrom = { x: ev.clientX, y: ev.clientY };
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => { held = true; swallowClick = true; helpHover = el; showHelp(); navigator.vibrate?.(10); }, HOLD_MS);
  });
  document.addEventListener("pointermove", (ev) => { if (holdTimer && !held && Math.hypot(ev.clientX - holdFrom.x, ev.clientY - holdFrom.y) > 10) { clearTimeout(holdTimer); holdTimer = 0; } });
  document.addEventListener("pointerup", letGo);
  document.addEventListener("pointercancel", letGo);
  // Letting go after reading the help does not also press the button.
  document.addEventListener("click", (ev) => { if (swallowClick) { swallowClick = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  document.addEventListener("contextmenu", (ev) => { if ((ev.target as Element).closest?.("[data-h]")) ev.preventDefault(); });
  document.addEventListener("focusin", (ev) => { const el = (ev.target as Element).closest?.("[data-h]"); if (el && el.matches(":focus-visible")) { helpHover = el; showHelp(); } });
  document.addEventListener("focusout", () => { if (!held) { helpHover = null; showHelp(); } });
  // Fold-out menus (the ☰ buttons): open on press, close on a press anywhere else.
  for (const fold of document.querySelectorAll<HTMLElement>(".fold")) {
    const btn = fold.querySelector<HTMLButtonElement>(".fold-btn")!;
    btn.addEventListener("click", () => { const open = !fold.classList.contains("open"); fold.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); if (open) fold.querySelector<HTMLButtonElement>(".fold-list button")?.focus({ preventScroll: true }); });
  }
  document.addEventListener("pointerdown", (ev) => {
    for (const fold of document.querySelectorAll<HTMLElement>(".fold.open")) if (!fold.contains(ev.target as Node)) { fold.classList.remove("open"); fold.querySelector(".fold-btn")?.setAttribute("aria-expanded", "false"); }
  }, true);
  setFlat(safeGet(VIEW_KEY) === "flat");
  holdBack = safeGet(HOLD_KEY) === "1";
  // Until a battle starts (the map screen comes first), the battle screen holds the test fight, never shown.
  state = createBattle({ seed: 0, map: MEADOW, units: TEST_UNITS });
  loadOrNew();
  refresh();
  followHero();
  // The title comes first, over the saved run (or the new one's first screen) waiting behind it.
  openTitle();
  addEventListener("resize", layout);

  // One finger (or the mouse) taps or drags to pan; two fingers pinch to zoom.
  const touches = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; panX: number; panY: number; dragged: boolean } | null = null;
  let pinch: { dist: number; zoom: number } | null = null;
  const spread = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  canvas.addEventListener("pointerdown", (ev) => {
    padUsed = false;
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
      if (Math.abs(dx) + Math.abs(dy) > (touch ? 14 : 6)) {
        down.dragged = true;
        if (mapOpen) { routePan = { x: routePan.x + ev.movementX, y: routePan.y + ev.movementY }; return; }
        if (onMap) return;
        panX = down.panX + dx; panY = down.panY + dy; layout();
      }
    }
    if (mapOpen || onMap) return;
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
    if (mapOpen) { routeTap(ev); return; }
    if (onMap) { skipWalk(); return; }
    const touch = ev.pointerType !== "mouse";
    const p = toMap(ev, touch ? 0.6 : 0);
    if (p) onTap(p, touch);
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") { hover = null; tooltip(null); } });
  canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); if (onMap || mapOpen) return; zoom = Math.min(3, Math.max(0.5, zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))); layout(); }, { passive: false });
  $("zoomIn").addEventListener("click", () => { zoom = Math.min(3, zoom * 1.25); layout(); });
  $("zoomOut").addEventListener("click", () => { zoom = Math.max(0.5, zoom / 1.25); layout(); });
  // +1 turns the map clockwise on screen, -1 counter-clockwise. Hover/tooltips are cleared because tiles move.
  const turn = (dir: 1 | -1) => { view.rot = (view.rot + dir + 4) % 4; hover = null; tooltip(null); };
  $("rotateL").addEventListener("click", () => turn(-1));
  $("rotateR").addEventListener("click", () => turn(1));
  const pass = (t_: "endTurn" | "wait" | "guard") => {
    if (!heroTurn() || busy || animating()) return;
    run({ t: t_, unit: activeUnit(state).id }); selected = null; pending = null; tooltip(null); refresh(); maybeFoeTurn();
  };
  $("end").addEventListener("click", () => pass("endTurn"));
  $("wait").addEventListener("click", () => pass("wait"));
  $("guard").addEventListener("click", () => pass("guard"));
  $("rewind").addEventListener("click", rewind);
  $("danger").addEventListener("click", () => { dangerAll = !dangerAll; refresh(); });
  $("flat").addEventListener("click", () => { setFlat(!isFlat()); safeSet(VIEW_KEY, isFlat() ? "flat" : "iso"); tooltip(null); refresh(); });
  $("undo").addEventListener("click", undo);
  $("hold").addEventListener("click", toggleHold);
  $("confirm").addEventListener("click", confirmPending);
  $("deployGo").addEventListener("click", () => beginFight());
  $("cancel").addEventListener("click", () => { selected = null; pending = null; tooltip(null); refresh(); });
  $("again").addEventListener("click", afterBattleButton);
  $("gearBtn").addEventListener("click", () => { if (choosingDifficulty) return; gearOpen = !gearOpen; statsOpen = false; showMap(); });
  $("statsBtn").addEventListener("click", () => { if (choosingDifficulty || journey.offers.length) return; statsOpen = !statsOpen; gearOpen = false; showMap(); });
  $("newRun").addEventListener("click", () => { if (journey.over || confirmNewRun()) startRun(); });
  $("mapLang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); showMap(); });
  $("sound").addEventListener("click", () => toggleSoundPanel());
  $("mapSound").addEventListener("click", () => toggleSoundPanel());
  $("lang").addEventListener("click", () => { lang = lang === "es" ? "en" : "es"; safeSet(LANG_KEY, lang); refresh(); });
  $("mapBtn").addEventListener("click", () => openMap(true));
  $("toTitle").addEventListener("click", openTitle);
  $("mapTitle").addEventListener("click", openTitle);
  $("closeMap").addEventListener("click", () => openMap(false));
  $("skipBtn").addEventListener("click", skipWalk);
  addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (titleOpen()) {
      // The title: arrows move between its buttons, Escape goes back to its menu. Sliders keep their arrows.
      if (k === "escape") { titleBack(); return; }
      if ((k === "arrowup" || k === "arrowdown") && !(document.activeElement instanceof HTMLInputElement)) { ev.preventDefault(); moveFocus(titleButtons(), k === "arrowup" ? -1 : 1); }
      return;
    }
    // The sound panel keeps its keys: arrows move its sliders, Escape closes it.
    if ($("soundPanel").style.display === "flex") { if (k === "escape") toggleSoundPanel(false); return; }
    if (k === "escape") { if (mapOpen) openMap(false); else input("back"); return; }
    if (k === "m") { if (!ev.repeat) input("map"); return; }
    const arrows: Record<string, Input> = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" };
    if (arrows[k]) { ev.preventDefault(); input(arrows[k]!); return; }
    if (k === "enter" || k === " ") {
      // A focused button presses itself; otherwise Enter and Space confirm (the sign, the node, the tile).
      if (document.activeElement instanceof HTMLButtonElement && !mapOpen) return;
      ev.preventDefault(); if (!ev.repeat) input("confirm"); return;
    }
    if (ev.repeat) return;
    if (k === "q") { if (onMap) return; turn(-1); }
    else if (k === "e") { if (onMap) return; turn(1); }
    else if (k === "tab" && !onMap && !mapOpen && heroTurn()) { ev.preventDefault(); input("next"); }
    else if (k === "t" && !onMap) input("end");
    else if (k === "h" && !onMap) input("hold");
    else if (/^[1-9]$/.test(k) && !onMap && heroTurn()) {
      const id = menuOrder(activeUnit(state))[Number(k) - 1];
      if (id && !abilityAvailable(activeUnit(state), id)) { selected = selected === id ? null : id; pending = null; refresh(); }
    } else if (/^[1-3]$/.test(k) && onMap && play?.finished && play.kind === "depart") {
      const s = play.scene.signs[Number(k) - 1];
      if (s) pickNode(s.node);
    }
  });
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
