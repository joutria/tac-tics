/* What carries from one run to the next (M4). For now: the nemesis. The rival who ended a run follows the hero into
   the next one, a level weaker but holding everything it remembered (its counters and memory), until the party
   settles it (plan doc, "Rivals", "Across runs"). Settling it ends the chase and pays out shards.
   Companion endings carry over too (bonds): a good ending leaves a keepsake perk picked at the camp; a bad one (they
   fell, left or turned) brings them back as a Sap-marked rival, until it is spared (they rejoin) or finished.

   The legacy is kept on the player's device next to the run save. It is plain data, and a run takes its nemesis
   when it starts, so a run is still a pure function of its seed and what it was handed. */
import type { Line } from "../data/rivals";
import { NEMESIS_LINES, RETURN_LINES } from "../data/rivals";
import { rivalFromCompanion, rivalName, type Rival } from "./rivals";
import type { RunState } from "./run";
import { DEPTH_HP, DEPTH_STAT, HERO, SAP_TIERS } from "../data/region";
import { PERKS } from "../data/gear";
import { KITS, type Kit, type Milestone } from "../data/camp";
import { endingOf, memberSpec, newMember } from "./party";

export interface Legacy {
  version: 1;
  /** Runs finished (won or lost) and won. */
  runs: number;
  wins: number;
  /** The rival waiting for the next run. */
  nemesis?: Rival;
  /** Nemeses settled, newest last: the rival's name parts and how. */
  settled: { name: string; epithet: number; how: "finished" | "spared"; run: number }[];
  /** Seed of the last run folded in, so a run is never counted twice (the end screen can be reloaded). */
  lastRun?: string;
  /** What the player has done in any run (data/camp.ts): opens kits and lore pages at the camp. */
  milestones?: Milestone[];
  /** Milestones the last run reached for the first time (shown as new at the camp). */
  fresh?: Milestone[];
  /** The starting kit picked at the camp. */
  kit?: string;
  /** How each companion's story stands across runs, by companion id: a good ending leaves a keepsake perk, a bad one
      brings them back as a rival until they are spared ("mended") or finished. The run is the legacy's run count. */
  bonds?: Record<string, { state: "good" | "bad" | "mended" | "finished"; run: number }>;
  /** The keepsake perk picked at the camp (data/gear.ts PERKS with `keepsake`). */
  keepsake?: string;
  /** Sap tiers open on top of Hard (data/region.ts SAP_TIERS): winning Hard at the highest open tier opens the next. */
  tiers?: number;
}

/** A companion back as a rival: the first map layer they can wait on, the companion level their spec is built at,
    and the rival id they take (one at a time, so it never clashes with the companion recruited as a party member). */
export const RETURN = { layer: 3, specLevel: 1, id: "returned" };

/** Levels a nemesis loses when it carries over; shards the party gets for settling it; the first map layer it can
    wait on, and the depth its stats are brought back to (it ended a run deep in, but meets a hero starting over). */
export const NEMESIS = { levelDrop: 1, shards: 2, id: "nemesis", layer: 2, depth: 2 };

export const newLegacy = (): Legacy => ({ version: 1, runs: 0, wins: 0, settled: [] });

/** The nemesis as a new run gets it: a level weaker, its id fixed so it can't clash with a battle's foe ids. */
export function carriedNemesis(legacy: Legacy | undefined): Rival | undefined {
  const n = legacy?.nemesis;
  if (!n) return undefined;
  const r = structuredClone(n);
  r.id = NEMESIS.id; r.base.id = NEMESIS.id;
  r.level = Math.max(1, r.level - NEMESIS.levelDrop);
  // Back to the depth it will be met at: the extra HP and Str/Mag from deeper nodes fall away.
  const d = r.depth ?? NEMESIS.depth;
  if (d > NEMESIS.depth) {
    r.base.hp = Math.round(r.base.hp * (1 + DEPTH_HP * NEMESIS.depth) / (1 + DEPTH_HP * d));
    r.base.str = Math.max(0, r.base.str - DEPTH_STAT * (d - NEMESIS.depth));
    r.base.mag = Math.max(0, r.base.mag - DEPTH_STAT * (d - NEMESIS.depth));
    r.depth = NEMESIS.depth;
  }
  r.nemesis = (r.nemesis ?? 0) + 1;
  delete r.settled;
  return r;
}

/** Folds a finished run into the legacy: counts it, clears a nemesis the run settled, and keeps the rival that ended
    it (or the old nemesis, still unsettled, as the run left it). */
export function closeRun(legacy: Legacy, run: RunState): Legacy {
  if (!run.over || legacy.lastRun === run.seed) return legacy;
  const next: Legacy = structuredClone(legacy);
  next.lastRun = run.seed;
  next.runs += 1;
  if (run.over === "won") next.wins += 1;
  if (run.over === "won" && run.difficulty === "hard" && (run.tier ?? 0) >= (next.tiers ?? 0)) next.tiers = Math.min(SAP_TIERS.length, (run.tier ?? 0) + 1);
  const carried = run.rivals.find((r) => r.nemesis);
  if (carried?.settled) {
    next.settled.push({ name: carried.base.name, epithet: carried.epithet, how: carried.settled, run: next.runs });
    delete next.nemesis;
  } else if (carried) next.nemesis = structuredClone(carried);
  const ender = run.endedBy ? run.rivals.find((r) => r.id === run.endedBy) : undefined;
  // A companion who ended the run comes back through their bond instead (below), not as a nemesis too.
  const companionEnder = ender && (ender.returned || ender.cause.kind === "betrayed");
  if (ender && !ender.settled && !companionEnder) next.nemesis = structuredClone(ender);
  // Bonds: a returned companion settled, then every companion's ending in this run (a newer ending wins).
  const bonds = next.bonds ??= {};
  for (const r of run.rivals) {
    const id = r.returned ?? (r.cause.kind === "betrayed" ? r.id : undefined);
    if (id && r.settled) bonds[id] = { state: r.settled === "spared" ? "mended" : "finished", run: next.runs };
  }
  for (const m of run.party) {
    const e = endingOf(m);
    const rival = run.rivals.find((r) => r.cause.kind === "betrayed" && r.id === m.id);
    if (e === "good") bonds[m.id] = { state: "good", run: next.runs };
    else if (e === "bad" && !rival?.settled) bonds[m.id] = { state: "bad", run: next.runs };
  }
  // Milestones: what this run did that opens something at the camp.
  const reached: Milestone[] = ["firstRun"];
  if ((run.region ?? 0) > 0 || run.over === "won") reached.push("region1");
  if (run.over === "won") reached.push("runWon");
  if (carried?.settled || run.rivals.some((r) => r.nemesis && r.settled)) reached.push("nemesisSettled");
  if (run.spared?.length) reached.push("spared");
  for (const m of run.party) if (endingOf(m) === "good") reached.push("anyGood", `good:${m.id}` as Milestone);
  const had = new Set(next.milestones ?? []);
  next.fresh = [...new Set(reached.filter((m) => !had.has(m)))];
  next.milestones = [...had, ...next.fresh];
  return next;
}

export const hasMilestone = (legacy: Legacy | undefined, m: Milestone | null) => m === null || !!legacy?.milestones?.includes(m);
/** The kit a new run starts with: the one picked at the camp, if it is open, else the plain one. */
export function kitOf(legacy: Legacy | undefined): Kit {
  const k = KITS.find((x) => x.id === legacy?.kit);
  return k && hasMilestone(legacy, k.needs) ? k : KITS[0]!;
}

/** The keepsake a new run starts with: the one picked at the camp while its companion's bond is good, else the
    newest good bond's, else none. */
export function keepsakeOf(legacy: Legacy | undefined): string | undefined {
  const good = Object.entries(legacy?.bonds ?? {}).filter(([, b]) => b.state === "good").sort((a, b) => b[1].run - a[1].run).map(([id]) => id);
  const perkOf = (companion: string) => Object.values(PERKS).find((p) => p.keepsake === companion)?.id;
  const picked = legacy?.keepsake && PERKS[legacy.keepsake];
  if (picked && good.includes(picked.keepsake!)) return picked.id;
  return good.length ? perkOf(good[0]!) : undefined;
}
export const keepsakesOpen = (legacy: Legacy | undefined) =>
  Object.values(PERKS).filter((p) => p.keepsake && legacy?.bonds?.[p.keepsake]?.state === "good");

/** The companion who comes back as a rival in the next run: the newest bad bond (one at a time). */
export function carriedReturn(legacy: Legacy | undefined): Rival | undefined {
  const bad = Object.entries(legacy?.bonds ?? {}).filter(([, b]) => b.state === "bad").sort((a, b) => b[1].run - a[1].run);
  if (!bad.length) return undefined;
  const id = bad[0]![0];
  const spec = memberSpec(newMember(id, 0, true), RETURN.specLevel, { x: 0, y: 0 });
  const r = rivalFromCompanion(spec, HERO.name, { element: null, range: null, opener: null, protects: false }, `return:${id}:${bad[0]![1].run}`);
  r.id = RETURN.id; r.base.id = RETURN.id; r.returned = id;
  return r;
}

/** Fills a return line with the companion's name (and a keepsake's perk name). */
export const returnLine = (key: keyof typeof RETURN_LINES, name: string, perk?: { es: string; en: string }): Line => ({
  es: RETURN_LINES[key].es.replace("{name}", name).replace("{perk}", perk?.es ?? ""),
  en: RETURN_LINES[key].en.replace("{name}", name).replace("{perk}", perk?.en ?? ""),
});

/** Fills a nemesis line with the rival's name. */
export const nemesisLine = (key: keyof typeof NEMESIS_LINES, r: Rival): Line => ({
  es: NEMESIS_LINES[key].es.replace("{name}", rivalName(r, "es")),
  en: NEMESIS_LINES[key].en.replace("{name}", rivalName(r, "en")),
});
