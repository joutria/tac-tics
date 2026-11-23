/* The title screen: the game's name over the battle board, then a short menu like a console game's (Continue, New
   game, Options, Credits). It is the first thing shown when the game opens, and the in-game ☰ menu comes back to
   it. The screens inside it (options, credits, "start over?") replace the menu in place; Back returns to it. */
import { t, type Lang } from "../i18n/text";

export interface TitleOptions {
  lang: Lang;
  /** One line about the saved run (where, how far), or null when there is none. */
  saved: string | null;
  /** The build name, shown small in a corner. */
  build: string;
  onContinue: () => void;
  onNew: () => void;
  /** Fills the options screen's window (sound, language, view); `rerender` redraws the title after a change. */
  fillOptions: (box: HTMLElement, rerender: () => void) => void;
}

type Screen = "menu" | "options" | "credits" | "sure";

/** Who made what: the game, then every third-party pack (CREDITS.md has the full table). */
const CREDITS: { what: string; who: string; licence: string }[] = [
  { what: "Ninja Adventure", who: "Pixel-boy & AAA", licence: "CC0" },
  { what: "24x32 characters (the party)", who: "Svetlana Kushnariova · lana-chan@yandex.ru", licence: "CC-BY 3.0" },
  { what: "JS Actors · Aeon Warriors (human foes)", who: "JosephSeraph", licence: "CC-BY 3.0" },
  { what: "Ratfolk", who: "Svetlana Kushnariova · lana-chan@yandex.ru, Redshrike, AntumDeluge", licence: "CC-BY 3.0" },
  { what: "Free RPG Character Sprites (goblins)", who: "Pipoya", licence: "Free use" },
  { what: "Golden UI", who: "Buch", licence: "CC0" },
  { what: "496 pixel art icons", who: "Henrique Lazarini (7Soul1)", licence: "CC0" },
  { what: "Chromatic Campfires", who: "Idylwild", licence: "CC0" },
  { what: "Animated tree and water", who: "abetusk", licence: "CC0" },
  { what: "Fire Smoke Animations", who: "Reactorcore", licence: "CC0" },
  { what: "512 Sound Effects · 4 Chiptunes", who: "Juhani Junkala", licence: "CC0" },
  { what: "50 RPG sound effects", who: "Kenney", licence: "CC0" },
];
const FONTS = [
  { what: "Pixelify Sans", who: "Stefie Justprince", licence: "OFL" },
  { what: "Jacquard 12", who: "The Soft Type Project (Sarah Cadigan-Fried)", licence: "OFL" },
];

let screen: Screen = "menu";
/** Where the title reads its options, each time it draws (the language may change on the options screen). */
let source: () => TitleOptions = () => { throw new Error("title not open"); };

export function titleOpen(): boolean {
  return document.body.classList.contains("titleopen");
}

export function hideTitle() {
  document.body.classList.remove("titleopen");
  document.getElementById("title")!.replaceChildren();
}

export function showTitle(get: () => TitleOptions) {
  screen = "menu"; source = get;
  document.body.classList.add("titleopen");
  render();
}

/** The buttons a keyboard or controller moves between on the title. */
export function titleButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("#title button")].filter((b) => !b.disabled && b.offsetParent !== null);
}

/** Escape / B on the title: back to the menu from a screen inside it. Returns false when already on the menu. */
export function titleBack(): boolean {
  if (screen === "menu") return false;
  screen = "menu"; render(); return true;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function render() {
  const o = source();
  const root = document.getElementById("title")!;
  const go = (s: Screen) => { screen = s; render(); };
  const L = o.lang;

  // Embers drifting up behind the name: a dozen squares with their own speed and start.
  const embers = el("div", "embers");
  for (let i = 0; i < 14; i++) {
    const e = el("i");
    e.style.left = `${(i * 37) % 100}%`;
    e.style.animationDelay = `${-((i * 1.7) % 9)}s`;
    e.style.animationDuration = `${7 + (i % 5) * 1.3}s`;
    embers.append(e);
  }
  const logo = el("div", "logo");
  logo.append(el("h1", "", t(L, "title")), el("p", "tagline", t(L, "tagline")));

  const body = el("div", "titleBody");
  if (screen === "menu") {
    const nav = el("nav", "titleMenu");
    const item = (text: string, sub: string | null, act: () => void, primary = false) => {
      const b = el("button", primary ? "titleItem first" : "titleItem");
      b.append(el("span", "nm", text));
      if (sub) b.append(el("small", "", sub));
      b.onclick = act;
      nav.append(b);
      return b;
    };
    const first = o.saved
      ? item(t(L, "menuContinue"), o.saved, o.onContinue, true)
      : item(t(L, "menuNew"), t(L, "menuFirst"), o.onNew, true);
    if (o.saved) item(t(L, "menuNew"), null, () => go("sure"));
    item(t(L, "menuOptions"), null, () => go("options"));
    item(t(L, "menuCredits"), null, () => go("credits"));
    body.append(nav);
    root.replaceChildren(embers, logo, body, footer(o));
    first.focus({ preventScroll: true });
    return;
  }

  const box = el("div", "win titlePanel");
  const back = el("button", "", t(L, "menuBack"));
  back.onclick = () => go("menu");
  if (screen === "options") {
    box.append(el("h3", "", t(L, "menuOptions")));
    const inner = el("div", "opts");
    o.fillOptions(inner, render);
    box.append(inner, back);
  } else if (screen === "credits") {
    box.append(el("h3", "", t(L, "menuCredits")), el("p", "made", t(L, "creditsMade", { who: "Jose (joutria)" })));
    const table = (head: string, rows: typeof CREDITS) => {
      const sec = el("div", "credits");
      sec.append(el("h4", "", head));
      for (const r of rows) {
        const row = el("div", "row");
        row.append(el("b", "", r.what), el("span", "", r.who), el("em", "", r.licence));
        sec.append(row);
      }
      return sec;
    };
    box.append(table(t(L, "creditsArt"), CREDITS), table(t(L, "creditsFont"), FONTS), el("p", "thanks", t(L, "creditsThanks")), back);
  } else {
    box.classList.add("sure");
    const yes = el("button", "on", t(L, "menuNewYes"));
    yes.onclick = o.onNew;
    box.append(el("h3", "", t(L, "menuNewSure")), el("p", "", t(L, "menuNewLose", { where: o.saved ?? "" })));
    const row = el("div", "row");
    row.append(back, yes);
    box.append(row);
  }
  body.append(box);
  root.replaceChildren(embers, logo, body, footer(o));
  (screen === "sure" ? back : box.querySelector<HTMLElement>("input, button"))?.focus({ preventScroll: true });
}

function footer(o: TitleOptions) {
  const f = el("footer", "titleFoot");
  f.append(el("span", "", `v ${o.build}`), el("span", "", t(o.lang, "optHold")));
  return f;
}
