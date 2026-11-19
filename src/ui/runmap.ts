/* The run map screen: the region's nodes in layers from the bottom (the town's edge) to the top (the boss),
   the path taken so far, and the nodes the player can go to next. Plain SVG in a DOM overlay, so it stays sharp
   and easy to tap on a phone. */
import { ELEMENTS, type Element } from "../data/elements";
import { ITEMS, PERKS, SHOP, xpToNext, type Mods } from "../data/gear";
import { abilityName, t, type Lang } from "../i18n/text";
import type { NodeKind, RunNode } from "../run/map";
import { rivalName } from "../run/rivals";
import { APPROVAL, COMPANIONS, TALKS } from "../data/companions";
import { fielded, heroMaxHp, memberMaxHp, nextNodes, priceOf, type RewardOption, type RunState } from "../run/run";
import type { Member } from "../run/party";

export const NODE_ICON: Record<NodeKind, string> = { battle: "⚔", elite: "☠", rest: "🔥", shop: "🪙", recruit: "☺", rival: "★", boss: "♛" };

const SVG = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function moodOf(m: Member, lang: Lang): string {
  if (m.status === "leaving") return t(lang, "mood.leaving");
  if (m.approval < APPROVAL.refuses) return t(lang, "mood.refuses");
  if (m.approval < APPROVAL.cold) return t(lang, "mood.cold");
  return t(lang, m.approval >= 25 ? "mood.warm" : "mood.ok");
}

/** What the map screen can ask the game to do. */
export interface MapActions {
  pick: (id: number) => void;
  choose: (index: number) => void;
  buy: (itemId: string) => void;
  heal: () => void;
  leave: () => void;
  wear: (itemId: string) => void;
}

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "+6 Mag · Res fire +15%", from an item's or a perk's mods. */
export function modsText(m: Mods, lang: Lang): string {
  const parts: string[] = [];
  for (const k of ["hp", "ap", "mp", "speed", "str", "mag", "agi"] as const) if (m[k]) parts.push(`+${m[k]} ${t(lang, k)}`);
  for (const [e, v] of Object.entries(m.res ?? {})) parts.push(`${ELEMENTS[e as Element].icon} ${t(lang, "res")} +${v}%`);
  return parts.join(" · ");
}

function itemCard(id: string, lang: Lang, extra = ""): string {
  const it = ITEMS[id]!;
  const teach = it.teaches ? `<br>${t(lang, "teaches", { ab: abilityName(lang, it.teaches) })}` : "";
  return `<b class="r-${it.rarity}">${html(it.name[lang])}</b><small>${t(lang, `slot.${it.slot}`)} · ${t(lang, `rarity.${it.rarity}`)}</small>`
    + `<span>${modsText(it.mods, lang)}${teach}</span>${extra}`;
}

function rewardCard(r: RewardOption, lang: Lang): string {
  if (r.t === "item") return itemCard(r.id, lang);
  if (r.t === "coins") return `<b>🪙 ${t(lang, "coins", { n: r.n })}</b>`;
  if (r.t === "shards") return `<b class="r-epic">◆ ${t(lang, "shards", { n: r.n })}</b>`;
  return `<b>✚ ${t(lang, "healReward", { n: r.n })}</b>`;
}

/** The first thing to answer (perk, reward or shop), or the gear panel when `gearOpen`. */
function renderPanel(panel: HTMLElement, run: RunState, lang: Lang, act: MapActions, gearOpen: boolean, closeGear: () => void) {
  const offer = run.offers[0];
  panel.style.display = offer || gearOpen ? "flex" : "none";
  if (!offer && !gearOpen) { panel.replaceChildren(); return; }
  const button = (inner: string, onClick: () => void, cls = "card", disabled = false) => {
    const b = document.createElement("button"); b.className = cls; b.innerHTML = inner; b.disabled = disabled; b.onclick = onClick; return b;
  };
  const title = document.createElement("h2");
  const list = document.createElement("div"); list.className = "cards";
  const foot = document.createElement("div"); foot.className = "row";
  // What the last battle gave, shown above the first choice after it.
  const sp = run.spoils;
  const spoils = document.createElement("p"); spoils.className = "spoils";
  if (sp && offer && offer.kind !== "shop") spoils.textContent = t(lang, "spoils", { c: sp.coins, x: sp.xp })
    + (sp.shards ? t(lang, "spoilsShards", { s: sp.shards }) : "") + (sp.levels ? t(lang, "levelUp", { n: run.hero.level }) : "");
  if (offer?.kind === "talk") {
    const talk = TALKS[offer.id]!;
    title.textContent = COMPANIONS[talk.companion]!.spec.name;
    for (const l of talk.lines) { const p = document.createElement("p"); p.className = "say"; p.textContent = l[lang]; list.append(p); }
    if (offer.reply) {
      const p = document.createElement("p"); p.className = "say reply"; p.textContent = offer.reply[lang]; list.append(p);
      foot.append(button(t(lang, "goOn"), () => act.choose(0), "primary"));
    } else talk.choices.forEach((c, i) => list.append(button(`<span>${html(c.text[lang])}</span>`, () => act.choose(i))));
  } else if (offer?.kind === "perk") {
    title.textContent = t(lang, "pickPerk");
    offer.options.forEach((id, i) => list.append(button(`<b>${html(PERKS[id]!.name[lang])}</b><span>${html(PERKS[id]!.desc[lang])}</span>`, () => act.choose(i))));
  } else if (offer?.kind === "reward") {
    title.textContent = t(lang, "pickReward");
    offer.options.forEach((r, i) => list.append(button(rewardCard(r, lang), () => act.choose(i))));
  } else if (offer?.kind === "shop") {
    title.textContent = t(lang, "shopTitle");
    for (const id of offer.stock) {
      const p = priceOf(id);
      const cost = p.currency === "coins" ? `🪙 ${p.amount}` : `◆ ${p.amount}`;
      list.append(button(itemCard(id, lang, `<em>${t(lang, "buy")} · ${cost}</em>`), () => act.buy(id), "card", run[p.currency] < p.amount));
    }
    const heal = Math.round(heroMaxHp(run) * SHOP.heal);
    foot.append(button(t(lang, "shopHeal", { n: heal, p: SHOP.healPrice }), act.heal, "", run.coins < SHOP.healPrice || run.heroHp >= heroMaxHp(run)));
    foot.append(button(t(lang, "leave"), act.leave, "primary"));
  } else {
    title.textContent = t(lang, "gear");
    for (const m of fielded(run)) {
      const p = document.createElement("p"); p.className = "say";
      p.textContent = `${COMPANIONS[m.id]!.spec.name} · ${t(lang, "hp")} ${m.hp}/${memberMaxHp(run, m)} · ${t(lang, "approval", { n: m.approval })} · ${moodOf(m, lang)}`;
      list.append(p);
    }
    for (const slot of ["weapon", "armour", "charm"] as const) {
      const id = run.hero.gear[slot];
      if (id) list.append(button(itemCard(id, lang, `<em>${t(lang, "worn")}</em>`), () => {}, "card worn"));
    }
    for (const id of run.hero.bag) list.append(button(itemCard(id, lang, `<em>${t(lang, "wear")}</em>`), () => act.wear(id)));
    if (!run.hero.bag.length) { const p = document.createElement("p"); p.textContent = t(lang, "bagEmpty"); list.append(p); }
    foot.append(button(t(lang, "close"), closeGear, "primary"));
  }
  panel.replaceChildren(title, ...(spoils.textContent ? [spoils] : []), list, foot);
}

export function renderRunMap(root: HTMLElement, run: RunState, lang: Lang, act: MapActions, gearOpen = false, closeGear: () => void = () => {}) {
  const onPick = act.pick;
  renderPanel(root.querySelector<HTMLElement>("#runPanel")!, run, lang, act, gearOpen, closeGear);
  const open = new Set(nextNodes(run).map((n) => n.id));
  const done = new Set(run.path);
  const { layers, width } = run.map;
  const W = 320, H = 520, padX = 50, padY = 46;
  const pos = (n: RunNode) => ({
    x: padX + (width === 1 ? 0.5 : n.col / (width - 1)) * (W - 2 * padX),
    y: H - padY - (n.layer / (layers - 1)) * (H - 2 * padY),
  });

  const lv = run.hero.level;
  root.querySelector("#runHead")!.innerHTML =
    `<b>${t(lang, "regionTown")}</b> · ${t(lang, `diff.${run.difficulty ?? "normal"}`)} · ${t(lang, "nodesDone", { n: run.path.length })}<br>`
    + `${t(lang, "level", { n: lv })} · ${t(lang, "xpBar", { a: run.hero.xp, b: xpToNext(lv) })} · ${t(lang, "hp")} ${run.heroHp}/${heroMaxHp(run)} · 🪙 ${run.coins} · ◆ ${run.shards}`;
  const waiting = nextNodes(run).flatMap((n) => run.rivals.filter((r) => r.id === n.rival && !r.settled)).map((r) => rivalName(r, lang));
  const party = fielded(run).map((m) => `${COMPANIONS[m.id]!.spec.name} ${m.hp}/${memberMaxHp(run, m)} (${moodOf(m, lang)})`);
  if (party.length) root.querySelector("#runHead")!.innerHTML += `<br>${t(lang, "party")}: ${html(party.join(", "))}`;
  const said = run.remarks.map((l) => l[lang]).join("\n");
  root.querySelector("#runHint")!.textContent = run.over === "won" ? t(lang, "runWon") : run.over === "lost" ? t(lang, "runLost")
    : [said, waiting.length ? t(lang, "rivalsAhead", { names: waiting.join(", ") }) : "", t(lang, "runHint")].filter(Boolean).join("\n");

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
