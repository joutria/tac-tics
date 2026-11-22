/* Updates (M4 phone app): the game always starts on the newest build. The service worker (made by vite.config.ts)
   loads the page from the network first and keeps every file for offline play, so opening the game online is the
   update, on the web and in the phone app alike. This file registers it, says so when the build changed since
   the last time, and checks again when the game comes back from the background after a while. */
declare const __BUILD__: string;

export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
const SEEN_KEY = "tac-tics.build";
/** Back from the background after this long, the game checks for a newer build. */
const RECHECK_MS = 10 * 60 * 1000;

/** True when `latest` names a different build than the one running (and neither is a dev build). */
export const isNewer = (running: string, latest: string | undefined) => !!latest && running !== "dev" && latest !== running;

/** Registers the service worker; `updated` gets the build when it changed since the last start; `reloadOk` says whether
    reloading now is safe (the run is saved on every step, so it only waits out a walk or a battle animation). */
export function startUpdates(opts: { updated: (build: string) => void; reloadOk: () => boolean; get: (k: string) => string | null; set: (k: string, v: string) => void }) {
  if (BUILD === "dev") return;
  const seen = opts.get(SEEN_KEY);
  if (seen && seen !== BUILD) opts.updated(BUILD);
  opts.set(SEEN_KEY, BUILD);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("offline cache:", e));
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!hiddenAt || Date.now() - hiddenAt < RECHECK_MS) return;
    void fetch("./version.json", { cache: "no-store" }).then((r) => r.json() as Promise<{ build?: string }>)
      .then((v) => { if (isNewer(BUILD, v.build) && opts.reloadOk()) location.reload(); })
      .catch(() => { /* offline: keep playing this build */ });
  });
}
