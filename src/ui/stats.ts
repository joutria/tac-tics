/* The play log on this device: storage, and the Stats panel on the map screen (summary, export, switch off,
   clear). Nothing here leaves the device unless the player exports the file and sends it. */
import { t, type Lang } from "../i18n/text";
import { appendCapped, LOG_VERSION, summarize, summaryLines, type PlayEvent } from "../run/playlog";

const LOG_KEY = "tac-tics.playlog.v1";
const OFF_KEY = "tac-tics.playlog.off";

function read(): PlayEvent[] {
  try {
    const all = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as PlayEvent[];
    return Array.isArray(all) ? all.filter((e) => e && e.v === LOG_VERSION) : [];
  } catch { return []; }
}

export const logOn = () => { try { return localStorage.getItem(OFF_KEY) !== "1"; } catch { return false; } };

/** Keeps events, unless the player switched the log off (or storage is unavailable). */
export function record(...events: (PlayEvent | null)[]) {
  const real = events.filter((e): e is PlayEvent => !!e);
  if (!real.length || !logOn()) return;
  try { localStorage.setItem(LOG_KEY, JSON.stringify(appendCapped(read(), real))); } catch { /* full or private mode: play on */ }
}

function exportLog() {
  const blob = new Blob([JSON.stringify({ game: "tac-tics", log: LOG_VERSION, exported: new Date().toISOString(), events: read() })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tac-tics-playlog-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let clearArmed = 0;

export function renderStats(panel: HTMLElement, lang: Lang, close: () => void) {
  const redraw = () => renderStats(panel, lang, close);
  const events = read();
  panel.style.display = "flex";
  const title = document.createElement("h2"); title.textContent = t(lang, "stats");
  const about = document.createElement("p"); about.className = "say"; about.textContent = t(lang, "statsAbout");
  const body = document.createElement("pre"); body.className = "stats";
  body.textContent = events.length ? summaryLines(summarize(events)).join("\n") + `\n\n${t(lang, "statsEvents", { n: events.length })}` : t(lang, "statsEmpty");
  const foot = document.createElement("div"); foot.className = "row";
  const button = (text: string, onClick: () => void, cls = "", disabled = false) => {
    const b = document.createElement("button"); b.textContent = text; b.className = cls; b.disabled = disabled; b.onclick = onClick; foot.append(b);
  };
  button(t(lang, "statsExport"), exportLog, "", !events.length);
  button(t(lang, logOn() ? "statsOff" : "statsOn"), () => {
    try { if (logOn()) localStorage.setItem(OFF_KEY, "1"); else localStorage.removeItem(OFF_KEY); } catch { /* no storage */ }
    redraw();
  });
  button(t(lang, performance.now() < clearArmed ? "statsClearAgain" : "statsClear"), () => {
    if (performance.now() > clearArmed) { clearArmed = performance.now() + 3000; redraw(); return; }
    clearArmed = 0;
    try { localStorage.removeItem(LOG_KEY); } catch { /* no storage */ }
    redraw();
  }, "", !events.length);
  button(t(lang, "close"), close, "primary");
  panel.replaceChildren(title, about, body, foot);
}
