/* The text and panels of the screen between battles: the header, the hint line and the panel of choices
   (rewards, perks, shops, talks, the epilogue). The travel scene and the route map themselves are drawn on the
   canvas (main.ts, src/run/travel.ts, src/ui/worldmap.ts). */
import { ELEMENTS, type Element } from "../data/elements";
import { ITEMS, PERKS, SHOP, xpToNext, type Mods } from "../data/gear";
import { abilityName, t, type Lang } from "../i18n/text";
import type { NodeKind, RunNode } from "../run/map";
import { rivalName } from "../run/rivals";
import { APPROVAL, COMPANIONS, QUESTS, TALKS } from "../data/companions";
import { JOBS } from "../data/jobs";
import { ALTAR, questChoices, fielded, heroMaxHp, regionOf, memberMaxHp, nextNodes, priceIn, type RewardOption, type RunState } from "../run/run";
import { endingOf, readyForLesson, type Member } from "../run/party";

export const NODE_ICON: Record<NodeKind, string> = { battle: "⚔", elite: "☠", rest: "🔥", shop: "🪙", recruit: "☺", rival: "★", quest: "❖", boss: "♛" };


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
  /** Starts a new run (from the epilogue). */
  newRun?: () => void;
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
  const epilogue = !!run.over && run.party.length > 0 && !gearOpen;
  panel.style.display = offer || gearOpen || epilogue ? "flex" : "none";
  if (!offer && !gearOpen && !epilogue) { panel.replaceChildren(); return; }
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
  if (epilogue) {
    // The run is over: one short epilogue per companion ever recruited.
    title.textContent = t(lang, "epilogue");
    for (const m of run.party) {
      const q = QUESTS[m.id];
      if (!q) continue;
      const end = endingOf(m);
      const p = document.createElement("p"); p.className = `say ending ${end}`;
      p.innerHTML = `<b>${html(COMPANIONS[m.id]!.spec.name)} · ${html(t(lang, `ending.${end}`))}</b><br>${html(q.endings[end][lang])}`;
      list.append(p);
    }
    if (act.newRun) foot.append(button(t(lang, "newRun"), act.newRun, "primary"));
  } else if (offer?.kind === "job") {
    title.textContent = t(lang, "pickJob");
    for (const [i, id] of offer.options.entries()) {
      const j = JOBS[id];
      list.append(button(`<b>${html(j.name[lang])}</b><span>${html(j.desc[lang])}</span><small>${j.abilities.map((a) => html(abilityName(lang, a))).join(" · ")}</small>`, () => act.choose(i)));
    }
    if (offer.options.length === 1) { const p = document.createElement("p"); p.className = "spoils"; p.textContent = t(lang, "jobLocked"); list.append(p); }
  } else if (offer?.kind === "quest") {
    const q = QUESTS[offer.companion]!;
    title.textContent = t(lang, "questOf", { name: COMPANIONS[offer.companion]!.spec.name });
    for (const l of q.lines) { const p = document.createElement("p"); p.className = "say"; p.textContent = l[lang]; list.append(p); }
    if (offer.reply) {
      const p = document.createElement("p"); p.className = "say reply"; p.textContent = offer.reply[lang]; list.append(p);
      foot.append(button(t(lang, "goOn"), () => act.choose(0), "primary"));
    } else {
      const m = run.party.find((x) => x.id === offer.companion)!;
      if (!readyForLesson(m)) { const p = document.createElement("p"); p.className = "say down"; p.textContent = q.notReady[lang]; list.append(p); }
      questChoices(run, offer.companion).forEach((lesson, i) => list.append(button(`<span>${html(q.choices[lesson].text[lang])}</span>`, () => act.choose(i))));
    }
  } else if (offer?.kind === "talk") {
    const talk = TALKS[offer.id]!;
    title.textContent = COMPANIONS[talk.companion]!.spec.name;
    for (const l of talk.lines) { const p = document.createElement("p"); p.className = "say"; p.textContent = l[lang]; list.append(p); }
    if (offer.reply) {
      const p = document.createElement("p"); p.className = "say reply"; p.textContent = offer.reply[lang]; list.append(p);
      foot.append(button(t(lang, "goOn"), () => act.choose(0), "primary"));
    } else talk.choices.forEach((c, i) => list.append(button(`<span>${html(c.text[lang])}</span>`, () => act.choose(i))));
  } else if (offer?.kind === "altar") {
    title.textContent = t(lang, "altarTitle");
    const p = document.createElement("p"); p.className = "say"; p.textContent = t(lang, "altarText"); list.append(p);
    for (const m of fielded(run)) {
      const c = COMPANIONS[m.id]!;
      if (!m.known || !c.forbidden.includes("destroyShards")) continue;
      const w = document.createElement("p"); w.className = "say down"; w.textContent = `⚠ ${c.forbiddenWarning[lang]}`; list.append(w);
    }
    list.append(button(`<b>🔥 ${html(t(lang, "altarBurn", { n: ALTAR.shards }))}</b>`, () => act.choose(0)));
    list.append(button(`<b>◆ ${html(t(lang, "altarKeep"))}</b>`, () => act.choose(1)));
  } else if (offer?.kind === "perk") {
    title.textContent = t(lang, "pickPerk");
    offer.options.forEach((id, i) => list.append(button(`<b>${html(PERKS[id]!.name[lang])}</b><span>${html(PERKS[id]!.desc[lang])}</span>`, () => act.choose(i))));
  } else if (offer?.kind === "reward") {
    title.textContent = offer.gift ? t(lang, "giftFrom", { name: offer.gift }) : t(lang, "pickReward");
    offer.options.forEach((r, i) => list.append(button(rewardCard(r, lang), () => act.choose(i))));
  } else if (offer?.kind === "shop") {
    title.textContent = offer.discount ? `${t(lang, "shopTitle")} · ${t(lang, "shopDiscount", { name: offer.discount })}` : t(lang, "shopTitle");
    for (const id of offer.stock) {
      const p = priceIn(run, id);
      const cost = p.currency === "coins" ? `🪙 ${p.amount}` : `◆ ${p.amount}`;
      list.append(button(itemCard(id, lang, `<em>${t(lang, "buy")} · ${cost}</em>`), () => act.buy(id), "card", run[p.currency] < p.amount));
    }
    const heal = Math.round(heroMaxHp(run) * SHOP.heal);
    foot.append(button(t(lang, "shopHeal", { n: heal, p: SHOP.healPrice }), act.heal, "", run.coins < SHOP.healPrice || run.heroHp >= heroMaxHp(run)));
    foot.append(button(t(lang, "leave"), act.leave, "primary"));
  } else {
    title.textContent = t(lang, "gear");
    const out = fielded(run);
    for (const m of run.party.filter((x) => x.status === "with" || x.status === "leaving")) {
      const p = document.createElement("p"); p.className = "say";
      p.textContent = `${COMPANIONS[m.id]!.spec.name} · ${t(lang, "hp")} ${m.hp}/${memberMaxHp(run, m)} · ${t(lang, "approval", { n: m.approval })} · ${moodOf(m, lang)}`
        + (out.includes(m) ? "" : ` · ${t(lang, "atCamp")}`);
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

/** Node label: a rival's name and level, a companion's quest, or the kind of stop. `short` keeps it to a few words. */
export function nodeLabel(run: RunState, n: RunNode, lang: Lang, short = false): string {
  const rival = n.rival ? run.rivals.find((r) => r.id === n.rival && !r.settled) : undefined;
  if (rival) return short ? t(lang, "rival", { n: rival.level }) : `${rivalName(rival, lang)} · ${t(lang, "rival", { n: rival.level })}`;
  if (n.quest && COMPANIONS[n.quest]) return t(lang, "questOf", { name: COMPANIONS[n.quest]!.spec.name });
  return t(lang, `node.${n.kind}`);
}

/** The text around the travel scene and the route map: the header (region, level, HP, purse, party) and the hint
    line (what companions said, rivals waiting ahead), and the panel of whatever has to be answered first. */
export function renderRunMap(root: HTMLElement, run: RunState, lang: Lang, act: MapActions, gearOpen = false, closeGear: () => void = () => {}) {
  renderPanel(root.querySelector<HTMLElement>("#runPanel")!, run, lang, act, gearOpen, closeGear);
  const lv = run.hero.level;
  root.querySelector("#runHead")!.innerHTML =
    `<b>${html(regionOf(run).name[lang])}</b> · ${t(lang, `diff.${run.difficulty ?? "normal"}`)} · ${t(lang, "nodesDone", { n: run.path.length })}<br>`
    + `${t(lang, "level", { n: lv })} · ${t(lang, "xpBar", { a: run.hero.xp, b: xpToNext(lv) })} · ${t(lang, "hp")} ${run.heroHp}/${heroMaxHp(run)} · 🪙 ${run.coins} · ◆ ${run.shards}`;
  const waiting = nextNodes(run).flatMap((n) => run.rivals.filter((r) => r.id === n.rival && !r.settled)).map((r) => rivalName(r, lang));
  const party = fielded(run).map((m) => `${COMPANIONS[m.id]!.spec.name} ${m.hp}/${memberMaxHp(run, m)} (${moodOf(m, lang)})`);
  if (party.length) root.querySelector("#runHead")!.innerHTML += `<br>${t(lang, "party")}: ${html(party.join(", "))}`;
  const said = run.remarks.map((l) => l[lang]).join("\n");
  const hint = run.over === "won" ? t(lang, "runWon") : run.over === "lost" ? t(lang, "runLost")
    : [said, waiting.length ? t(lang, "rivalsAhead", { names: waiting.join(", ") }) : ""].filter(Boolean).join("\n");
  root.querySelector("#runHint")!.textContent = hint;
  root.querySelector("#routeHint")!.textContent = hint || t(lang, "runHint");
}
