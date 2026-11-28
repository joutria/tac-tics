/* The text and panels of the screen between battles: the header, the hint line and the panel of choices
   (rewards, perks, shops, talks, the epilogue). The travel scene and the route map themselves are drawn on the
   canvas (main.ts, src/run/travel.ts, src/ui/worldmap.ts). */
import { ELEMENTS, type Element } from "../data/elements";
import { ABILITIES } from "../data/abilities";
import { ITEMS, PERKS, SHOP, xpToNext, type Mods } from "../data/gear";
import { abilityDesc, abilityName, t, type Lang } from "../i18n/text";
import type { NodeKind, RunNode } from "../run/map";
import { rivalName } from "../run/rivals";
import { NEMESIS, returnLine } from "../run/legacy";
import { APPROVAL, COMPANIONS, QUESTS, TALKS } from "../data/companions";
import { JOBS } from "../data/jobs";
import type { GoalKind } from "../engine/goals";
import { ALTAR, goalAt, questView, fielded, heroBase, heroMaxHp, regionOf, memberMaxHp, nextNodes, priceIn, type RewardOption, type RunState } from "../run/run";
import { endingOf, readyForLesson, type Member } from "../run/party";
import { ALIGN, ALIGNMENTS, type Align, type Meter } from "../data/alignment";
import { TWINS } from "../data/twins";
import { alignOf, alignmentOf, heroEnding, lockWarning, twinBar } from "../run/alignment";
import { heroSpec, sheetStats, statSources } from "../run/hero";
import { REGIONS, SAP_TIERS } from "../data/region";
import { abilityIcon, icon, ICONS, ITEM_PACK, PERK_PACK, pk, RUN_PACK, type IconId } from "./icons";

export const NODE_ICON: Record<NodeKind, string> = { battle: "⚔", elite: "☠", rest: "🔥", shop: "🪙", recruit: "☺", rival: "★", quest: "❖", boss: "♛", floodgate: "💧" };


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
  /** Swaps a card for its twin, or back. */
  twin?: (base: string, on: boolean) => void;
  /** Starts a new run (from the epilogue). */
  newRun?: () => void;
  /** A character's face as an image URL (from its sprite sheet), for the talk box. */
  face?: (look: string) => string;
}

/** An ability's element, for its icon when it has no picture of its own. */
const ABILITY_ELEMENT = (id: string) => ABILITIES[id]?.element ?? "neutral";
/** An element's icon, or the plain diamond for the elements no icon draws yet. */
const elIcon = (e: string): IconId => (e in ICONS ? (e as IconId) : "neutral");
const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "+6 Mag · Res fire +15%", from an item's or a perk's mods. */
export function modsText(m: Mods, lang: Lang): string {
  const parts: string[] = [];
  for (const k of ["hp", "ap", "mp", "mana", "speed", "str", "mag", "agi"] as const) if (m[k]) parts.push(`+${m[k]} ${t(lang, k)}`);
  if (m.regen) parts.push(t(lang, "manaRegen", { n: m.regen }));
  for (const [e, v] of Object.entries(m.res ?? {})) parts.push(`${ELEMENTS[e as Element].icon} ${t(lang, "res")} +${v}%`);
  return parts.join(" · ");
}

/** A card's picture: a pack icon in a small framed tile, its frame coloured by rarity. */
export const iconTile = (ic: Parameters<typeof icon>[0], rarity = "common") => `<span class="ic r-${rarity}">${icon(ic, "huge")}</span>`;
/** A card with its picture on the left (or on top in a row of picks) and its words beside it. */
const withIcon = (tile: string, words: string) => `${tile}<span class="tx">${words}</span>`;

function itemCard(id: string, lang: Lang, extra = ""): string {
  const it = ITEMS[id]!;
  const teach = it.teaches ? `<br>${t(lang, "teaches", { ab: abilityName(lang, it.teaches) })}` : "";
  return withIcon(iconTile(pk(ITEM_PACK[id]), it.rarity), `<b class="r-${it.rarity}">${html(it.name[lang])}</b><small>${t(lang, `slot.${it.slot}`)} · ${t(lang, `rarity.${it.rarity}`)}</small>`
    + `<span>${modsText(it.mods, lang)}${teach}</span>${extra}`);
}

function rewardCard(r: RewardOption, lang: Lang): string {
  if (r.t === "item") return itemCard(r.id, lang);
  if (r.t === "coins") return withIcon(iconTile(pk(RUN_PACK.coins)), `<b>${t(lang, "coins", { n: r.n })}</b>`);
  if (r.t === "shards") return withIcon(iconTile(pk(RUN_PACK.shards), "epic"), `<b class="r-epic">${t(lang, "shards", { n: r.n })}</b>`);
  return withIcon(iconTile(pk(RUN_PACK.heal)), `<b>${t(lang, "healReward", { n: r.n })}</b>`);
}

/** "Mercy +5 · Sap +1": what a fight or a choice moved. Empty when nothing moved. */
export function alignShiftText(a: Align | undefined, lang: Lang): string {
  if (!a) return "";
  const parts: string[] = [];
  if (a.mercy) parts.push(t(lang, "alignShift", { side: t(lang, a.mercy > 0 ? "side.mercy" : "side.severity"), n: `+${Math.abs(a.mercy)}` }));
  if (a.purity) parts.push(t(lang, "alignShift", { side: t(lang, a.purity > 0 ? "side.purity" : "side.sap"), n: `+${Math.abs(a.purity)}` }));
  return parts.join(" · ");
}

/** One meter as a small bar: the minus side on the left, the plus side on the right, ticks at the marks. */
export function meterBar(a: Align, m: Meter, lang: Lang, locked?: string): string {
  const v = a[m], left = m === "mercy" ? "side.severity" : "side.sap", right = m === "mercy" ? "side.mercy" : "side.purity";
  const pct = (x: number) => 50 + (x / ALIGN.max) * 50;
  const fill = v >= 0 ? `left:50%;width:${pct(v) - 50}%` : `left:${pct(v)}%;width:${50 - pct(v)}%`;
  const ticks = [-ALIGN.signature, -ALIGN.mark, ALIGN.mark, ALIGN.signature].map((x) => `<i class="tick${Math.abs(x) >= ALIGN.signature ? " sig" : ""}" style="left:${pct(x)}%"></i>`).join("");
  return `<span class="meter ${m}" role="meter" aria-valuemin="${-ALIGN.max}" aria-valuemax="${ALIGN.max}" aria-valuenow="${v}" aria-label="${html(t(lang, right))} ${v}">`
    + `<small>${html(t(lang, left))}</small><span class="track"><b class="fill${v < 0 ? " neg" : ""}" style="${fill}"></b>${ticks}<i class="zero"></i></span>`
    + `<small>${html(t(lang, right))}</small><em>${v > 0 ? "+" : ""}${v}${locked ? " 🔒" : ""}</em></span>`;
}

/** Both meters and the alignment they make. */
export function metersHtml(run: RunState, lang: Lang): string {
  const a = alignOf(run), id = alignmentOf(a);
  return `<span class="meters"><span class="alignName">${html(t(lang, "align"))}: <b>${html(ALIGNMENTS[id].name[lang])}</b></span>`
    + meterBar(a, "mercy", lang, run.alignLock?.mercy) + meterBar(a, "purity", lang, run.alignLock?.purity) + `</span>`;
}

/** A companion speaking: their face in a frame and a name plate beside the lines, like a handheld RPG's talk box. */
function talkBox(companion: string, lines: string[], act: MapActions, reply?: string): HTMLElement {
  const c = COMPANIONS[companion]!;
  const box = document.createElement("div"); box.className = "talk";
  const face = act.face?.(c.spec.look) ?? "";
  box.innerHTML = `<span class="face">${face ? `<img src="${face}" alt="">` : ""}</span>`;
  const words = document.createElement("div"); words.className = "lines";
  const who = document.createElement("b"); who.className = "who"; who.textContent = c.spec.name;
  words.append(who);
  for (const l of lines) { const p = document.createElement("p"); p.textContent = l; words.append(p); }
  if (reply) { const p = document.createElement("p"); p.className = "reply"; p.textContent = reply; words.append(p); }
  box.append(words);
  return box;
}

/** The run in numbers, as the journey ends (like a roguelike's run recap): how far, how strong, what it held, who
    came along. Tiles with pack icons; the face slot takes whatever portrait the hero has. */
function runSummary(run: RunState, lang: Lang): HTMLElement {
  const box = document.createElement("div"); box.className = "summary";
  const regions = REGIONS.length, reached = Math.min(regions, run.region + 1);
  const met = run.party.length, stayed = run.party.filter((m) => m.status === "with").length;
  const tile = (ic: string, value: string, label: string) => `<span class="tile">${ic}<b>${value}</b><small>${label}</small></span>`;
  box.innerHTML = `<p class="where">${html(regionOf(run).name[lang])} · ${html(t(lang, `diff.${run.difficulty}`))}</p>`
    + `<div class="tiles">`
    + tile(iconTile(pk(RUN_PACK.normal)), `${reached}/${regions}`, t(lang, "sumRegions"))
    + tile(iconTile(pk(RUN_PACK.job)), `${run.hero.level}`, t(lang, "sumLevel"))
    + tile(iconTile(pk(RUN_PACK.easy)), `${run.spared?.length ?? 0}`, t(lang, "sumSpared"))
    + tile(iconTile(pk(RUN_PACK.coins)), `${run.coins}`, t(lang, "sumCoins"))
    + tile(iconTile(pk(RUN_PACK.shards)), `${run.shards}`, t(lang, "sumShards"))
    + tile(iconTile(pk(RUN_PACK.charm)), `${stayed}/${met}`, t(lang, "sumParty"))
    + `</div>`;
  return box;
}

/** The first thing to answer (perk, reward or shop), or the gear panel when `gearOpen`. */
function renderPanel(panel: HTMLElement, run: RunState, lang: Lang, act: MapActions, gearOpen: boolean, closeGear: () => void) {
  const offer = run.offers[0];
  const epilogue = !!run.over && !gearOpen;
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
    + (sp.shards ? t(lang, "spoilsShards", { s: sp.shards }) : "") + (sp.levels ? t(lang, "levelUp", { n: run.hero.level }) : "")
    + (alignShiftText(sp.align, lang) ? ` · ${alignShiftText(sp.align, lang)}` : "");
  if (epilogue) {
    // The run is over: one short epilogue per companion ever recruited.
    title.textContent = t(lang, run.over === "won" ? "summaryWon" : "summaryLost");
    list.append(runSummary(run, lang));
    if (run.party.length || run.over === "won" || run.endedBy) { const h = document.createElement("h3"); h.textContent = t(lang, "epilogue"); list.append(h); }
    // The hero's own ending comes first, from where the two meters ended up.
    if (run.over === "won") {
      const a = alignOf(run), end = heroEnding(a);
      const p = document.createElement("p"); p.className = `say ending hero ${end.kind}`;
      p.innerHTML = `<b>${html(t(lang, "heroEnding", { name: ALIGNMENTS[end.alignment].name[lang] }))}</b><br>${html(end.text[lang])}`;
      const m = document.createElement("p"); m.className = "say"; m.innerHTML = metersHtml(run, lang);
      list.append(m, p);
    }
    for (const m of run.party) {
      const q = QUESTS[m.id];
      if (!q) continue;
      const end = endingOf(m);
      const p = document.createElement("p"); p.className = `say ending ${end}`;
      p.innerHTML = `<b>${html(COMPANIONS[m.id]!.spec.name)} · ${html(t(lang, `ending.${end}`))}</b><br>${html(q.endings[end][lang])}`;
      // What this ending carries into the next journey (run/legacy.ts bonds).
      const name = COMPANIONS[m.id]!.spec.name;
      const keep = Object.values(PERKS).find((k) => k.keepsake === m.id);
      const settledRival = run.rivals.some((r) => r.cause.kind === "betrayed" && r.id === m.id && r.settled);
      const carry = end === "good" && keep ? returnLine("keepsake", name, keep.name) : end === "bad" && !settledRival ? returnLine("carries", name) : null;
      if (carry) p.innerHTML += `<br><em>${html(carry[lang])}</em>`;
      list.append(p);
    }
    // The nemesis: who follows the hero into the next run, or the one settled at last.
    const ender = run.endedBy ? run.rivals.find((r) => r.id === run.endedBy) : undefined;
    if (ender && !ender.returned && ender.cause.kind !== "betrayed") {
      const p = document.createElement("p"); p.className = "say ending nemesis";
      p.innerHTML = `<b>★ ${html(t(lang, "nemesisTitle"))} · ${html(rivalName(ender, lang))}</b><br>${html(t(lang, "nemesisCarries", { n: Math.max(1, ender.level - NEMESIS.levelDrop) }))}`;
      list.append(p);
    }
    // A companion back as a rival and still unsettled keeps waiting for the next journey.
    const back = run.rivals.find((r) => r.returned && !r.settled);
    if (back) { const p = document.createElement("p"); p.className = "say ending bad"; p.textContent = returnLine("carries", back.base.name)[lang]; list.append(p); }
    if (act.newRun) foot.append(button(t(lang, "newRun"), act.newRun, "primary"));
  } else if (offer?.kind === "job") {
    title.textContent = t(lang, "pickJob");
    for (const [i, id] of offer.options.entries()) {
      const j = JOBS[id];
      list.append(button(withIcon(iconTile(pk(RUN_PACK.job)), `<b>${html(j.name[lang])}</b><span>${html(j.desc[lang])}</span><small>${j.abilities.map((a) => html(abilityName(lang, a))).join(" · ")}</small>`), () => act.choose(i), "card ico"));
    }
    if (offer.options.length === 1) { const p = document.createElement("p"); p.className = "spoils"; p.textContent = t(lang, "jobLocked"); list.append(p); }
  } else if (offer?.kind === "quest") {
    const view = questView(run, offer.companion);
    title.textContent = t(lang, "questOf", { name: COMPANIONS[offer.companion]!.spec.name });
    list.append(talkBox(offer.companion, view.lines.map((l) => l[lang]), act, offer.reply?.[lang]));
    if (offer.reply) {
      for (const l of run.remarks) { const r = document.createElement("p"); r.className = "spoils"; r.textContent = l[lang]; list.append(r); }
      foot.append(button(t(lang, "goOn"), () => act.choose(0), "primary"));
    } else {
      if (!view.ready) { const p = document.createElement("p"); p.className = "say down"; p.textContent = view.notReady[lang]; list.append(p); }
      view.choices.forEach((c, i) => list.append(button(`<span>${html(c.text[lang])}</span>`, () => act.choose(i), c.lesson === "alt" || c.lesson === "sacrifice" ? "card lesson" : "card")));
    }
  } else if (offer?.kind === "floodgate") {
    title.textContent = t(lang, "floodTitle");
    const p = document.createElement("p"); p.className = "say"; p.textContent = t(lang, "floodText"); list.append(p);
    const nodes = offer.paths.map((id) => run.map.nodes[id]!);
    const where = (n: RunNode) => `${t(lang, `side.${n.col === 0 ? "left" : n.col === 2 ? "right" : "middle"}`)} (${nodeLabel(run, n, lang, true)})`;
    if (nodes.length === 1) {
      list.append(button(`<b>💧 ${html(t(lang, "floodOpen"))}</b><span>${html(t(lang, "floodOpenHint"))}</span><small>${html(where(nodes[0]!))}</small>`, () => act.choose(0)));
      list.append(button(`<b>❄ ${html(t(lang, "floodShut"))}</b><span>${html(t(lang, "floodShutHint"))}</span><small>${html(where(nodes[0]!))}</small>`, () => act.choose(1)));
    } else nodes.forEach((n, i) => {
      const others = nodes.filter((x) => x !== n).map(where).join(", ");
      list.append(button(`<b>💧 ${html(t(lang, "floodPath", { side: t(lang, `side.${n.col === 0 ? "left" : n.col === 2 ? "right" : "middle"}`) }))}</b>`
        + `<span>${html(t(lang, "floodPathHint", { a: where(n), b: others }))}</span>`, () => act.choose(i)));
    });
  } else if (offer?.kind === "talk") {
    const talk = TALKS[offer.id]!;
    title.textContent = COMPANIONS[talk.companion]!.spec.name;
    list.append(talkBox(talk.companion, talk.lines.map((l) => l[lang]), act, offer.reply?.[lang]));
    if (offer.reply) {
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
    list.classList.add("pick");
    offer.options.forEach((id, i) => list.append(button(withIcon(iconTile(pk(PERK_PACK[id])), `<b>${html(PERKS[id]!.name[lang])}</b><span>${html(PERKS[id]!.desc[lang])}</span>`), () => act.choose(i), "card ico")));
  } else if (offer?.kind === "reward") {
    title.textContent = offer.gift ? t(lang, "giftFrom", { name: offer.gift }) : t(lang, "pickReward");
    list.classList.add("pick");
    offer.options.forEach((r, i) => list.append(button(rewardCard(r, lang), () => act.choose(i), "card ico")));
  } else if (offer?.kind === "shop") {
    title.textContent = offer.discount ? `${t(lang, "shopTitle")} · ${t(lang, "shopDiscount", { name: offer.discount })}` : t(lang, "shopTitle");
    list.classList.add("shop");
    const purse = document.createElement("p"); purse.className = "purse"; purse.textContent = `🪙 ${run.coins}   ◆ ${run.shards}`; list.append(purse);
    for (const m of fielded(run)) {
      const c = COMPANIONS[m.id]!;
      if (!m.known || !c.forbidden.includes("spendShards") || !offer.stock.some((id) => priceIn(run, id).currency === "shards")) continue;
      const w = document.createElement("p"); w.className = "say down"; w.textContent = `⚠ ${c.forbiddenWarning[lang]}`; list.append(w);
    }
    for (const id of offer.stock) {
      const p = priceIn(run, id);
      const cost = p.currency === "coins" ? `🪙 ${p.amount}` : `◆ ${p.amount}`;
      list.append(button(itemCard(id, lang, `<em class="price">${cost}</em>`), () => act.buy(id), "card ico", run[p.currency] < p.amount));
    }
    const heal = Math.round(heroMaxHp(run) * SHOP.heal);
    foot.append(button(t(lang, "shopHeal", { n: heal, p: SHOP.healPrice }), act.heal, "", run.coins < SHOP.healPrice || run.heroHp >= heroMaxHp(run)));
    foot.append(button(t(lang, "leave"), act.leave, "primary"));
  } else {
    title.textContent = t(lang, "gear");
    // The character sheet, like FFTA's status screen: the face, name, job and level with HP and XP bars; the stats as
    // a grid; the abilities as icons. Then the slots, the meters and the twin cards they open.
    const spec = heroSpec(heroBase(run), run.hero), maxHp = heroMaxHp(run), lv = run.hero.level;
    const sheet = document.createElement("div"); sheet.className = "sheet";
    const face = act.face?.(spec.look) ?? "";
    const bar = (cls: string, a: number, b: number, label: string) =>
      `<span class="statbar ${cls}"><small>${label}</small><span class="track"><b style="width:${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%"></b></span><em>${a}/${b}</em></span>`;
    sheet.innerHTML = `<span class="face big">${face ? `<img src="${face}" alt="">` : ""}</span>`
      + `<span class="who"><b>${html(spec.name)}</b><small>${icon(elIcon(spec.element))} ${html(run.hero.job ? JOBS[run.hero.job].name[lang] : ELEMENTS[spec.element][lang])} · ${t(lang, "level", { n: lv })}</small>`
      + bar("hp", run.heroHp, maxHp, t(lang, "hp")) + bar("xp", run.hero.xp, xpToNext(lv), "XP") + `</span>`;
    const stats = document.createElement("div"); stats.className = "stats";
    // Each stat as a row, like a League tooltip: the value, what it is made of (base, levels, perks, gear) and what
    // it does, so the player sees why a number grew and what it buys.
    const src = statSources(heroBase(run), run.hero);
    const row = (k: string, value: string, parts: string, what: string) =>
      `<div class="srow s-${k}"><b>${t(lang, k as "str")}</b><em>${value}</em><small>${parts}</small><p>${what}</p></div>`;
    stats.innerHTML = sheetStats().map((k) => {
      const c = src[k], value = c.base + c.lv + c.perk + c.gear;
      const parts = [`${c.base} ${t(lang, "src.base")}`, ...([["lv", c.lv], ["perk", c.perk], ["gear", c.gear]] as const).filter(([, n]) => n)
        .map(([w, n]) => `<i class="${n > 0 ? "up" : "dn"}">${n > 0 ? "+" : "−"}${Math.abs(n)} ${t(lang, `src.${w}`)}</i>`)].join(" ");
      return row(k, `${value}`, parts, t(lang, `sx.${k}`));
    }).join("")
      + (Object.values(spec.res).some((v) => v)
        ? row("res", "", Object.entries(spec.res).filter(([, v]) => v).map(([e, v]) => `<span>${icon(elIcon(e))}${v}%</span>`).join(" "), t(lang, "sx.res")) : "");
    const abils = document.createElement("div"); abils.className = "abils";
    abils.innerHTML = spec.abilities.map((a) => `<span>${icon(abilityIcon(a, ABILITY_ELEMENT(a)))}${html(abilityName(lang, a))}</span>`).join("");
    list.append(sheet, stats, abils);
    // The hero sheet: both meters, then the twin cards they open.
    const meters = document.createElement("p"); meters.className = "say"; meters.innerHTML = metersHtml(run, lang);
    list.append(meters);
    const warn = lockWarning(run);
    if (warn) { const w = document.createElement("p"); w.className = "say down"; w.textContent = `⚠ ${t(lang, "lockWarn", { side: t(lang, `side.${warn.side}`) })}`; list.append(w); }
    const own = heroSpec(heroBase(run), run.hero).abilities;
    const twins = TWINS.filter((tw) => own.includes(tw.base));
    if (twins.length) {
      const h = document.createElement("h3"); h.textContent = t(lang, "twins");
      const hint = document.createElement("p"); hint.className = "spoils"; hint.textContent = t(lang, "twinsHint");
      list.append(h, hint);
    }
    for (const tw of twins) {
      const bar = twinBar(run, tw, own), on = !!run.hero.twins?.includes(tw.base);
      const chip = tw.tag ? `<span class="tag ${tw.tag}">${html(t(lang, `side.${tw.tag}`))}${tw.tier === "signature" ? " ★" : ""}</span>` : "";
      const why = bar ? (bar.k === "level" ? t(lang, "twinBar.level", { n: bar.n }) : bar.k === "job" ? t(lang, "twinBar.job")
        : bar.k === "needs" ? t(lang, "twinBar.needs", { side: t(lang, `side.${bar.side}`), n: bar.n }) : t(lang, "twinBar.locked", { side: t(lang, `side.${bar.side}`) })) : "";
      const state = on && !bar ? t(lang, "twinOn") : bar ? `🔒 ${why}` : t(lang, "twinUse");
      const inner = `<b>${html(abilityName(lang, tw.base))} ⇄ ${html(abilityName(lang, tw.twin))} ${chip}</b>`
        + `<span>${html(abilityDesc(lang, tw.twin))}</span><em>${html(state)}</em>`;
      const b = button(inner, () => act.twin?.(tw.base, !on), `card twin${on && !bar ? " worn" : ""}${bar ? " locked" : ""}`, !!bar && !on);
      b.dataset.twin = tw.base;
      if (on) b.title = t(lang, "twinBase");
      list.append(b);
    }
    if (run.combos?.length) {
      const c = document.createElement("p"); c.className = "say";
      c.textContent = t(lang, "combosHave", { list: run.combos.map((id) => abilityName(lang, id)).join(" · ") });
      list.append(c);
    }
    const out = fielded(run);
    for (const m of run.party.filter((x) => x.status === "with" || x.status === "leaving")) {
      const p = document.createElement("p"); p.className = "say";
      p.textContent = `${COMPANIONS[m.id]!.spec.name} · ${t(lang, "hp")} ${m.hp}/${memberMaxHp(run, m)} · ${t(lang, "approval", { n: m.approval })} · ${moodOf(m, lang)}`
        + (out.includes(m) ? "" : ` · ${t(lang, "atCamp")}`);
      list.append(p);
    }
    // What the hero wears: three framed slots, like a console RPG's equip screen; an empty slot shows a faded picture.
    const slots = document.createElement("div"); slots.className = "slots";
    for (const slot of ["weapon", "armour", "charm"] as const) {
      const id = run.hero.gear[slot], it = id ? ITEMS[id] : undefined;
      const s = document.createElement("div"); s.className = `slot${it ? "" : " empty"}`;
      s.innerHTML = iconTile(it ? pk(ITEM_PACK[id!]) : pk(RUN_PACK[slot]), it?.rarity ?? "common")
        + `<small>${t(lang, `slot.${slot}`)}</small><b class="r-${it?.rarity ?? "common"}">${it ? html(it.name[lang]) : "—"}</b>${it ? `<span>${modsText(it.mods, lang)}</span>` : ""}`;
      slots.append(s);
    }
    abils.after(slots);
    for (const id of run.hero.bag) list.append(button(itemCard(id, lang, `<em>${t(lang, "wear")}</em>`), () => act.wear(id), "card ico"));
    if (!run.hero.bag.length) { const p = document.createElement("p"); p.textContent = t(lang, "bagEmpty"); list.append(p); }
    foot.append(button(t(lang, "close"), closeGear, "primary"));
  }
  panel.replaceChildren(title, ...(spoils.textContent ? [spoils] : []), list, foot);
}

/** The icon of each battle goal (emoji swapped for pixel icons, ui/icons.ts). */
export const GOAL_ICON: Record<GoalKind, string> = { protect: "🛡", survive: "⏳", catch: "◆" };

/** Node label: a rival's name and level, a companion's quest, or the kind of stop. `short` keeps it to a few words. */
export function nodeLabel(run: RunState, n: RunNode, lang: Lang, short = false): string {
  const rival = n.rival ? run.rivals.find((r) => r.id === n.rival && !r.settled) : undefined;
  if (rival) return short ? t(lang, "rival", { n: rival.level }) : `${rivalName(rival, lang)} · ${t(lang, "rival", { n: rival.level })}`;
  const flood = n.flood && !short ? ` · ${t(lang, `flood.${n.flood}`)}` : n.flood ? ` ${n.flood === "flooded" ? "💧" : "❄"}` : "";
  if (n.quest && COMPANIONS[n.quest]) return t(lang, "questOf", { name: COMPANIONS[n.quest]!.spec.name }) + flood;
  // A fight with a goal (engine/goals.ts) says so before the party picks the path.
  const goal = goalAt(run, n);
  if (goal) return short ? `${GOAL_ICON[goal]} ${t(lang, `goal.${goal}`)}` : `${t(lang, `node.${n.kind}`)} · ${GOAL_ICON[goal]} ${t(lang, `goal.${goal}`)}`;
  return t(lang, `node.${n.kind}`) + flood;
}

/** The text around the travel scene and the route map: the header (region, level, HP, purse, party) and the hint
    line (what companions said, rivals waiting ahead), and the panel of whatever has to be answered first. */
export function renderRunMap(root: HTMLElement, run: RunState, lang: Lang, act: MapActions, gearOpen = false, closeGear: () => void = () => {}) {
  renderPanel(root.querySelector<HTMLElement>("#runPanel")!, run, lang, act, gearOpen, closeGear);
  const lv = run.hero.level;
  root.querySelector("#runHead")!.innerHTML =
    `<b>${html(regionOf(run).name[lang])}</b> · ${t(lang, `diff.${run.difficulty ?? "normal"}`)}${run.tier ? ` ${html(SAP_TIERS[run.tier - 1]!.name[lang])}` : ""} · ${t(lang, "nodesDone", { n: run.path.length })}<br>`
    + `${t(lang, "level", { n: lv })} · ${t(lang, "xpBar", { a: run.hero.xp, b: xpToNext(lv) })} · ${t(lang, "hp")} ${run.heroHp}/${heroMaxHp(run)} · 🪙 ${run.coins} · ◆ ${run.shards}`
    + `<br>${metersHtml(run, lang)}`;
  const waiting = nextNodes(run).flatMap((n) => run.rivals.filter((r) => r.id === n.rival && !r.settled)).map((r) => rivalName(r, lang));
  const party = fielded(run).map((m) => `${COMPANIONS[m.id]!.spec.name} ${m.hp}/${memberMaxHp(run, m)} (${moodOf(m, lang)})`);
  if (party.length) root.querySelector("#runHead")!.innerHTML += `<br>${t(lang, "party")}: ${html(party.join(", "))}`;
  const said = run.remarks.map((l) => l[lang]).join("\n");
  const hint = run.over === "won" ? [t(lang, "runWon"), said].filter(Boolean).join("\n") : run.over === "lost" ? [t(lang, "runLost"), said].filter(Boolean).join("\n")
    : [said, waiting.length ? t(lang, "rivalsAhead", { names: waiting.join(", ") }) : ""].filter(Boolean).join("\n");
  root.querySelector("#runHint")!.textContent = hint;
  root.querySelector("#routeHint")!.textContent = hint || t(lang, "runHint");
}
