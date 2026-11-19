/* The run map screen: the region's nodes in layers from the bottom (the town's edge) to the top (the boss),
   the path taken so far, and the nodes the player can go to next. Plain SVG in a DOM overlay, so it stays sharp
   and easy to tap on a phone. */
import { HERO } from "../data/region";
import { t, type Lang } from "../i18n/text";
import type { NodeKind, RunNode } from "../run/map";
import { rivalName } from "../run/rivals";
import { nextNodes, type RunState } from "../run/run";

export const NODE_ICON: Record<NodeKind, string> = { battle: "⚔", elite: "☠", rest: "🔥", rival: "★", boss: "♛" };

const SVG = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function renderRunMap(root: HTMLElement, run: RunState, lang: Lang, onPick: (id: number) => void) {
  const open = new Set(nextNodes(run).map((n) => n.id));
  const done = new Set(run.path);
  const { layers, width } = run.map;
  const W = 320, H = 520, padX = 50, padY = 46;
  const pos = (n: RunNode) => ({
    x: padX + (width === 1 ? 0.5 : n.col / (width - 1)) * (W - 2 * padX),
    y: H - padY - (n.layer / (layers - 1)) * (H - 2 * padY),
  });

  root.querySelector("#runHead")!.innerHTML =
    `<b>${t(lang, "regionTown")}</b> · ${t(lang, "hp")} ${run.heroHp}/${HERO.hp} · ${t(lang, "nodesDone", { n: run.path.length })}`;
  const waiting = nextNodes(run).flatMap((n) => run.rivals.filter((r) => r.id === n.rival && !r.settled)).map((r) => rivalName(r, lang));
  root.querySelector("#runHint")!.textContent = run.over === "won" ? t(lang, "runWon") : run.over === "lost" ? t(lang, "runLost")
    : waiting.length ? `${t(lang, "rivalsAhead", { names: waiting.join(", ") })} ${t(lang, "runHint")}` : t(lang, "runHint");

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t(lang, "regionTown") });
  // Links first, so nodes sit on top. Links on the path taken are bright.
  for (const n of run.map.nodes) for (const id of n.next) {
    const m = run.map.nodes[id]!, a = pos(n), b = pos(m);
    const taken = done.has(n.id) && (done.has(id) || open.has(id));
    svg.append(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: taken ? "link taken" : "link" }));
  }
  for (const n of run.map.nodes) {
    const p = pos(n);
    const g = el("g", { class: `node ${n.kind}${open.has(n.id) ? " open" : ""}${done.has(n.id) ? " done" : ""}`, transform: `translate(${p.x} ${p.y})` });
    g.append(el("circle", { r: n.kind === "boss" ? 24 : 18 }));
    const icon = el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": n.kind === "boss" ? 22 : 17 });
    icon.textContent = NODE_ICON[n.kind];
    g.append(icon);
    const rival = n.rival ? run.rivals.find((r) => r.id === n.rival && !r.settled) : undefined;
    const label = rival ? `${rivalName(rival, lang)} · ${t(lang, "rival", { n: rival.level })}` : t(lang, `node.${n.kind}`);
    const title = el("title", {}); title.textContent = label; g.append(title);
    if (open.has(n.id)) {
      g.setAttribute("tabindex", "0"); g.setAttribute("role", "button"); g.setAttribute("aria-label", label);
      g.addEventListener("click", () => onPick(n.id));
      g.addEventListener("keydown", (ev) => { if ((ev as KeyboardEvent).key === "Enter") onPick(n.id); });
      // Open nodes say what they are, since the player is choosing between them.
      const tag = el("text", { y: n.kind === "boss" ? 38 : 32, "text-anchor": "middle", class: "tag" });
      // Short, so neighbouring tags never overlap; the full rival name is in the title and the hint line.
      tag.textContent = rival ? t(lang, "rival", { n: rival.level }) : t(lang, `node.${n.kind}`);
      g.append(tag);
    }
    svg.append(g);
  }
  const box = root.querySelector("#runSvg")!;
  box.replaceChildren(svg);
}
