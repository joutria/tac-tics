/* The play log: what players do in a run, kept so the game can be tuned from real play later.

   Local first. Events are plain JSON kept on the device (main.ts stores them in localStorage); nothing is sent
   anywhere. A player can switch the log off, and export it as a file to share. The simulator writes the same
   events (`npm run simulate:run -- 100 normal --log sim.json`), so real runs and AI runs can be compared with one
   tool: `npm run analyze -- <files...>`.

   Every event is built from run states, battle setups and command logs, which are deterministic, so building
   an event never changes the game. The functions here are pure: they return events and the caller keeps them. */
import { ABILITIES } from "../data/abilities";
import { applyCommand, createBattle, roundOf, type BattleState } from "../engine/state";
import type { BattleSave } from "../engine/save";
import { readDeeds } from "./party";
import { heroMaxHp, priceOf, RUN_VERSION, type RewardOption, type RunState } from "./run";

export const LOG_VERSION = 1;
/** Oldest events are dropped past this many, so the log never grows without bound in storage. */
export const LOG_CAP = 5000;

type Base = { v: number; run: string; t: number; src: "player" | "sim" };
export type RunEnd = "won" | "lost" | "abandoned";

export type PlayEvent = Base & (
  | { ev: "runStart"; difficulty: string; save: number }
  | { ev: "node"; region: number; layer: number; kind: string; open: string[]; hp: number; maxHp: number; level: number; coins: number; shards: number }
  | {
    ev: "battle"; region: number; layer: number; kind: string; result: "won" | "lost";
    rounds: number; turns: number; commands: number; rewinds: number; ms?: number;
    hpStart: number; hpEnd: number; maxHp: number; party: string[]; foes: string[]; rivals: number;
    beaten: number; escaped: number; alliesDowned: number; alliesDead: number;
    deeds: Record<string, number>; abilities: Record<string, number>;
    dealt: number; taken: number; crits: number; healed: number;
    /** Who downed or killed the hero, if anyone did. */
    heroFelledBy?: string;
  }
  | { ev: "pick"; offer: "reward" | "perk" | "talk" | "altar" | "job" | "quest"; options: string[]; chose: number; region: number; layer: number }
  | { ev: "buy"; item: string; price: number; currency: string; coins: number; shards: number }
  | { ev: "shopHeal"; hp: number; coins: number }
  | { ev: "shopLeave"; stock: string[] }
  | { ev: "wear"; item: string }
  | { ev: "companion"; id: string; status: string; approval: number; was: number }
  | {
    ev: "runEnd"; result: RunEnd; difficulty: string; region: number; layer: number; nodes: number; level: number;
    coins: number; shards: number; rivals: number; party: string[]; perks: string[]; gear: string[];
  }
);

type Ev<K extends PlayEvent["ev"]> = Extract<PlayEvent, { ev: K }>;
type Payload<K extends PlayEvent["ev"]> = Omit<Ev<K>, keyof Base | "ev">;

export interface LogContext { src: "player" | "sim"; now: () => number }
export const PLAYER: LogContext = { src: "player", now: () => Date.now() };
/** The simulator's clock is the event count, so its logs are the same on every machine. */
export function simContext(): LogContext { let n = 0; return { src: "sim", now: () => n++ }; }

function make<K extends PlayEvent["ev"]>(ctx: LogContext, run: RunState, ev: K, data: Payload<K>): PlayEvent {
  return { v: LOG_VERSION, run: run.seed, t: ctx.now(), src: ctx.src, ev, ...data } as unknown as PlayEvent;
}

/** Where the run is: the layer of the last node finished (-1 before the first). */
const where = (run: RunState) => ({ region: run.region ?? 0, layer: run.at === null ? -1 : run.map.nodes[run.at]!.layer });

export const logRunStart = (ctx: LogContext, run: RunState) => make(ctx, run, "runStart", { difficulty: run.difficulty ?? "normal", save: RUN_VERSION });

/** Entering a node: what the player picked, what else was open, and the state they went in with. */
export function logNode(ctx: LogContext, before: RunState, nodeId: number, open: number[]): PlayEvent {
  const node = before.map.nodes[nodeId]!;
  return make(ctx, before, "node", {
    region: before.region ?? 0, layer: node.layer, kind: node.kind,
    open: open.filter((id) => id !== nodeId).map((id) => before.map.nodes[id]!.kind),
    hp: before.heroHp, maxHp: heroMaxHp(before), level: before.hero.level, coins: before.coins, shards: before.shards,
  });
}

/** A battle, read from its save and how it ended. `before` is the run as the battle was fought, `after` once
    finishBattle closed it; companion changes come as separate events. */
export function logBattle(ctx: LogContext, before: RunState, save: BattleSave & { node: number }, end: BattleState, after: RunState, ms?: number): PlayEvent[] {
  const { setup, commands } = save;
  const node = before.map.nodes[save.node]!;
  const heroId = setup.units.find((u) => u.team === "heroes")!.id;
  const team = new Map(setup.units.map((u) => [u.id, u.team]));
  const abilities: Record<string, number> = {};
  let dealt = 0, taken = 0, crits = 0, healed = 0, heroFelledBy: string | undefined;
  let s = createBattle(setup);
  for (const c of commands) {
    const r = applyCommand(s, c);
    if (!r.ok) break;
    s = r.state;
    for (const e of r.events) {
      if (e.e !== "cast") continue;
      const ours = team.get(e.unit) === "heroes";
      if (ours) abilities[e.ability] = (abilities[e.ability] ?? 0) + 1;
      for (const h of e.hits) {
        const toHeroes = team.get(h.unit) === "heroes";
        if (ours && !toHeroes) { dealt += h.damage; if (h.crit) crits++; }
        if (!ours && toHeroes) taken += h.damage;
        if (ours && toHeroes) healed += h.heal;
        if (h.unit === heroId && (h.downed || h.died) && !ours) heroFelledBy = foeLabel(setup.units.find((u) => u.id === e.unit));
      }
    }
  }
  const units = end.units;
  const allies = units.filter((u) => u.team === "heroes" && u.id !== heroId);
  const foes = units.filter((u) => u.team === "foes");
  const hero = units.find((u) => u.id === heroId)!;
  const events: PlayEvent[] = [make(ctx, before, "battle", {
    region: before.region ?? 0, layer: node.layer, kind: node.kind, result: end.winner === "heroes" && hero.life === "up" ? "won" : "lost",
    rounds: roundOf(end), turns: end.turns, commands: commands.length, rewinds: save.rewindsUsed ?? 0, ...(ms !== undefined ? { ms } : {}),
    hpStart: setup.units.find((u) => u.id === heroId)!.hpNow ?? hero.maxHp, hpEnd: Math.max(0, hero.hp), maxHp: hero.maxHp,
    party: allies.map((u) => u.id), foes: setup.units.filter((u) => u.team === "foes").map(foeLabel),
    rivals: foes.filter((u) => u.rival).length,
    beaten: foes.filter((u) => u.life === "dead" || u.life === "downed").length,
    escaped: foes.filter((u) => u.life === "escaped").length,
    alliesDowned: allies.filter((u) => u.life === "downed").length, alliesDead: allies.filter((u) => u.life === "dead").length,
    deeds: readDeeds(setup, commands), abilities, dealt, taken, crits, healed,
    ...(heroFelledBy ? { heroFelledBy } : {}),
  })];
  for (const m of after.party) {
    const was = before.party.find((x) => x.id === m.id);
    if (was && (was.status !== m.status || was.approval !== m.approval)) events.push(make(ctx, after, "companion", { id: m.id, status: m.status, approval: m.approval, was: was.approval }));
  }
  return events;
}

/** Foes by name (in the language played); rivals are all "rival", since their names are made up per run. */
const foeLabel = (u: { name: string; rival?: boolean } | undefined) => (!u ? "?" : u.rival ? "rival" : u.name);

const rewardKey = (r: RewardOption) => (r.t === "item" ? `item:${r.id}` : r.t);

/** Answering an offer (reward, perk, job, the shard fire, a conversation or a quest's lesson). The second answer
    of a conversation or quest only closes it. */
export function logChoice(ctx: LogContext, before: RunState, index: number): PlayEvent | null {
  const o = before.offers[0];
  if (!o || o.kind === "shop" || ((o.kind === "talk" || o.kind === "quest") && o.reply)) return null;
  const options = o.kind === "reward" ? o.options.map(rewardKey) : o.kind === "perk" || o.kind === "job" ? [...o.options]
    : o.kind === "altar" ? ["burn", "keep"] : o.kind === "quest" ? [`quest:${o.companion}`] : [`talk:${o.id}`];
  return make(ctx, before, "pick", { offer: o.kind, options, chose: index, ...where(before) });
}

export const logBuy = (ctx: LogContext, before: RunState, item: string) => {
  const p = priceOf(item);
  return make(ctx, before, "buy", { item, price: p.amount, currency: p.currency, coins: before.coins, shards: before.shards });
};
export const logShopHeal = (ctx: LogContext, before: RunState) => make(ctx, before, "shopHeal", { hp: before.heroHp, coins: before.coins });
export const logShopLeave = (ctx: LogContext, before: RunState) => {
  const o = before.offers[0];
  return make(ctx, before, "shopLeave", { stock: o?.kind === "shop" ? [...o.stock] : [] });
};
export const logWear = (ctx: LogContext, run: RunState, item: string) => make(ctx, run, "wear", { item });

export function logRunEnd(ctx: LogContext, run: RunState, result: RunEnd): PlayEvent {
  return make(ctx, run, "runEnd", {
    result, difficulty: run.difficulty ?? "normal", ...where(run), nodes: run.path.length, level: run.hero.level,
    coins: run.coins, shards: run.shards, rivals: run.rivals.length,
    party: run.party.map((m) => `${m.id}:${m.status}`), perks: [...run.hero.perks], gear: Object.values(run.hero.gear).filter(Boolean) as string[],
  });
}

/** Adds events to a log, dropping the oldest past the cap. */
export const appendCapped = (log: PlayEvent[], events: PlayEvent[], cap = LOG_CAP) => {
  const next = log.concat(events);
  return next.length > cap ? next.slice(next.length - cap) : next;
};

/* ---------- reading a log back ---------- */

export interface LogSummary {
  runs: number;
  byDifficulty: Record<string, { runs: number; won: number; lost: number; abandoned: number }>;
  /** Runs that ended in a loss, by "region:layer" of the battle that ended them ("other" when no logged battle did,
      such as a simulated stalemate). */
  lostAt: Record<string, number>;
  battles: number;
  battlesWon: number;
  avgRounds: number;
  avgTurns: number;
  /** Average real time per battle, player logs only. */
  avgBattleMs: number | null;
  rewindsUsed: number;
  /** Hero-side ability uses, most used first. */
  abilities: [string, number][];
  /** Who downs the hero most. */
  felledBy: [string, number][];
  /** What players pick when offered: option kind -> [picked, offered]. */
  rewards: Record<string, [number, number]>;
  perks: Record<string, [number, number]>;
  jobs: Record<string, [number, number]>;
  /** The shard fire at rests: burn or keep. */
  altar: Record<string, [number, number]>;
  /** Node kinds picked when other kinds were open: kind -> [picked, open]. */
  nodes: Record<string, [number, number]>;
  /** Mercy: foes finished while downed, fleeing foes killed, foes let go. */
  deeds: Record<string, number>;
  companions: Record<string, Record<string, number>>;
  bought: [string, number][];
  avgLevel: number;
}

const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };
const pair = (m: Record<string, [number, number]>, k: string, i: 0 | 1) => { (m[k] ??= [0, 0])[i]++; };
const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);

export function summarize(events: PlayEvent[]): LogSummary {
  const byDifficulty: LogSummary["byDifficulty"] = {};
  const lostAt: Record<string, number> = {}, abilities: Record<string, number> = {}, felledBy: Record<string, number> = {};
  const rewards: Record<string, [number, number]> = {}, perks: Record<string, [number, number]> = {}, jobs: Record<string, [number, number]> = {}, altar: Record<string, [number, number]> = {}, nodes: Record<string, [number, number]> = {};
  const deeds: Record<string, number> = {}, bought: Record<string, number> = {};
  const companions: Record<string, Record<string, number>> = {};
  let runs = 0, battles = 0, won = 0, rounds = 0, turns = 0, ms = 0, timed = 0, rewinds = 0, levels = 0;
  const lastBattle = new Map<string, Ev<"battle">>();
  for (const e of events) {
    if (e.ev === "battle") {
      battles++; rounds += e.rounds; turns += e.turns; rewinds += e.rewinds;
      if (e.result === "won") won++;
      if (e.ms !== undefined) { ms += e.ms; timed++; }
      for (const [k, n] of Object.entries(e.abilities)) bump(abilities, k, n);
      for (const [k, n] of Object.entries(e.deeds)) bump(deeds, k, n);
      if (e.heroFelledBy) bump(felledBy, e.heroFelledBy);
      lastBattle.set(e.run, e);
    } else if (e.ev === "node") {
      pair(nodes, e.kind, 0); pair(nodes, e.kind, 1);
      for (const k of new Set(e.open)) if (k !== e.kind) pair(nodes, k, 1);
    } else if (e.ev === "pick" && (e.offer === "reward" || e.offer === "perk" || e.offer === "job" || e.offer === "altar")) {
      const into = e.offer === "reward" ? rewards : e.offer === "perk" ? perks : e.offer === "job" ? jobs : altar;
      const key = (s: string) => (e.offer === "reward" ? s.split(":")[0]! : s);
      e.options.forEach((o, i) => { pair(into, key(o), 1); if (i === e.chose) pair(into, key(o), 0); });
    } else if (e.ev === "buy") bump(bought, e.item);
    else if (e.ev === "companion") bump(companions[e.id] ??= {}, e.status);
    else if (e.ev === "runEnd") {
      runs++; levels += e.level;
      const d = byDifficulty[e.difficulty] ??= { runs: 0, won: 0, lost: 0, abandoned: 0 };
      d.runs++; d[e.result]++;
      const b = lastBattle.get(e.run);
      if (e.result === "lost") bump(lostAt, b?.result === "lost" ? `${b.region}:${b.layer}` : "other");
    }
  }
  return {
    runs, byDifficulty, lostAt, battles, battlesWon: won,
    avgRounds: battles ? rounds / battles : 0, avgTurns: battles ? turns / battles : 0, avgBattleMs: timed ? ms / timed : null,
    rewindsUsed: rewinds, abilities: top(abilities), felledBy: top(felledBy), rewards, perks, jobs, altar, nodes, deeds, companions,
    bought: top(bought), avgLevel: runs ? levels / runs : 0,
  };
}

/** The summary as plain lines, for the terminal and the in-game stats panel. Ability ids are shown as is. */
export function summaryLines(s: LogSummary): string[] {
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  const rate = (m: Record<string, [number, number]>) => Object.entries(m).sort((a, b) => b[1][1] - a[1][1]).map(([k, [p, o]]) => `${k} ${p}/${o} (${pct(p, o)})`).join(", ") || "-";
  const lines = [`runs finished ${s.runs}, average hero level ${s.avgLevel.toFixed(1)}`];
  for (const [d, r] of Object.entries(s.byDifficulty)) lines.push(`  ${d}: ${r.runs} runs, won ${r.won} (${pct(r.won, r.runs)}), lost ${r.lost}, given up ${r.abandoned}`);
  lines.push(`runs lost at region:layer ${Object.entries(s.lostAt).sort().map(([k, n]) => `${k}=${n}`).join(" ") || "-"}`);
  lines.push(`battles ${s.battles}, won ${pct(s.battlesWon, s.battles)}, ~${s.avgRounds.toFixed(1)} rounds, ~${s.avgTurns.toFixed(0)} turns`
    + (s.avgBattleMs !== null ? `, ~${(s.avgBattleMs / 60000).toFixed(1)} min` : "") + `, rewinds ${s.rewindsUsed}`);
  lines.push(`abilities ${s.abilities.slice(0, 8).map(([k, n]) => `${ABILITIES[k] ? k : `?${k}`} ${n}`).join(", ") || "-"}`);
  lines.push(`hero felled by ${s.felledBy.slice(0, 5).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}`);
  lines.push(`node picks ${rate(s.nodes)}`);
  lines.push(`reward picks ${rate(s.rewards)}`);
  lines.push(`perk picks ${rate(s.perks)}`);
  if (Object.keys(s.jobs).length) lines.push(`job picks ${rate(s.jobs)}`);
  if (Object.keys(s.altar).length) lines.push(`shard fire ${rate(s.altar)}`);
  lines.push(`deeds ${Object.entries(s.deeds).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}`);
  for (const [id, st] of Object.entries(s.companions)) lines.push(`companion ${id}: ${Object.entries(st).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  if (s.bought.length) lines.push(`bought ${s.bought.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  return lines;
}
