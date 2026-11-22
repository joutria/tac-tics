/* The hero's growth over a run: levels with fixed growth, a perk pick every second level, and worn items
   (plan doc gaps 12 and 14). Pure functions; the run keeps the progress in its save. */
import { GROWTH, ITEMS, LEVEL_CAP, PERKS, xpToNext, type Mods, type Slot } from "../data/gear";
import { rngInt, seedFrom } from "../engine/rng";
import type { UnitSpec } from "../engine/state";
import { JOBS, type Job } from "../data/jobs";
import { twinOf, type Twin } from "../data/twins";

export interface HeroProgress {
  level: number;
  xp: number;
  perks: string[];
  gear: Partial<Record<Slot, string>>;
  /** Items owned but not worn. */
  bag: string[];
  /** The job taken halfway through the first region. */
  job?: Job;
  /** Cards switched to their twin (data/twins.ts), by the original card's id. */
  twins?: string[];
}

export const newProgress = (): HeroProgress => ({ level: 1, xp: 0, perks: [], gear: {}, bag: [] });

function apply(spec: UnitSpec, m: Mods, times = 1) {
  spec.hp += (m.hp ?? 0) * times; spec.ap += (m.ap ?? 0) * times; spec.mp += (m.mp ?? 0) * times;
  spec.speed += (m.speed ?? 0) * times; spec.str += (m.str ?? 0) * times; spec.mag += (m.mag ?? 0) * times;
  spec.agi += (m.agi ?? 0) * times;
  for (const [e, v] of Object.entries(m.res ?? {})) spec.res[e as keyof UnitSpec["res"]] = (spec.res[e as keyof UnitSpec["res"]] ?? 0) + v! * times;
}

/** The hero as it fights: base spec, levels, perks and worn items (and the abilities they teach), and the twins
    picked, where `canWear` allows them (the run's meters; without it, no twin swaps in). */
export function heroSpec(base: UnitSpec, p: HeroProgress, canWear?: (tw: Twin, abilities: string[]) => boolean): UnitSpec {
  const spec = structuredClone(base);
  apply(spec, GROWTH, p.level - 1);
  for (const id of p.perks) apply(spec, PERKS[id]!.mods);
  for (const id of Object.values(p.gear)) {
    const item = ITEMS[id!]!;
    apply(spec, item.mods);
    if (item.teaches && !spec.abilities.includes(item.teaches)) spec.abilities.push(item.teaches);
  }
  if (p.job) {
    for (const a of JOBS[p.job].abilities) if (!spec.abilities.includes(a)) spec.abilities.push(a);
    spec.passive = JOBS[p.job].passive;
  }
  if (canWear && p.twins?.length) {
    const own = [...spec.abilities];
    spec.abilities = own.map((a) => { const tw = twinOf(a); return tw && p.twins!.includes(a) && canWear(tw, own) ? tw.twin : a; });
  }
  for (const e of Object.keys(spec.res) as (keyof UnitSpec["res"])[]) spec.res[e] = Math.min(75, spec.res[e]!);
  return spec;
}

export type SheetStat = "ap" | "mp" | "speed" | "str" | "mag" | "agi";
/** Where each of the hero's stats comes from, for the character sheet: the base, the levels, the perks and the
    worn items. They add up to what heroSpec gives. */
export function statSources(base: UnitSpec, p: HeroProgress): Record<SheetStat, { base: number; lv: number; perk: number; gear: number }> {
  const keys: SheetStat[] = ["ap", "mp", "speed", "str", "mag", "agi"];
  const sum = (mods: Mods[], k: SheetStat, times = 1) => mods.reduce((a, m) => a + (m[k] ?? 0) * times, 0);
  const perks = p.perks.map((id) => PERKS[id]!.mods), gear = Object.values(p.gear).map((id) => ITEMS[id!]!.mods);
  return Object.fromEntries(keys.map((k) => [k, { base: base[k], lv: sum([GROWTH], k, p.level - 1), perk: sum(perks, k), gear: sum(gear, k) }])) as
    Record<SheetStat, { base: number; lv: number; perk: number; gear: number }>;
}

/** Adds XP; returns the new progress and, for each second level reached, a pair of perks to pick from. */
export function gainXp(p: HeroProgress, xp: number, seed: string): { progress: HeroProgress; perkChoices: string[][]; levels: number } {
  const next = structuredClone(p);
  const perkChoices: string[][] = [];
  let levels = 0;
  next.xp += xp;
  while (next.level < LEVEL_CAP && next.xp >= xpToNext(next.level)) {
    next.xp -= xpToNext(next.level);
    next.level += 1; levels += 1;
    if (next.level % 2 === 0) perkChoices.push(perkPair(next, `${seed}:perk:${next.level}`, perkChoices.flat()));
  }
  if (next.level >= LEVEL_CAP) next.xp = 0;
  return { progress: next, perkChoices, levels };
}

/** Two perks the hero does not have yet (and not already offered in the same batch), picked with the seed. */
function perkPair(p: HeroProgress, seed: string, offered: string[]): string[] {
  const pool = Object.keys(PERKS).filter((id) => !PERKS[id]!.keepsake && !p.perks.includes(id) && !offered.includes(id));
  let rng = seedFrom(seed);
  const pair: string[] = [];
  while (pair.length < 2 && pool.length) {
    let i: number; [i, rng] = rngInt(rng, 0, pool.length - 1);
    pair.push(pool.splice(i, 1)[0]!);
  }
  return pair;
}

/** Wears an item from the bag; whatever was in that slot goes back to the bag. */
export function equip(p: HeroProgress, itemId: string): HeroProgress {
  if (!p.bag.includes(itemId)) throw new Error(`${itemId} is not in the bag`);
  const next = structuredClone(p);
  const slot = ITEMS[itemId]!.slot;
  next.bag.splice(next.bag.indexOf(itemId), 1);
  const old = next.gear[slot];
  if (old) next.bag.push(old);
  next.gear[slot] = itemId;
  return next;
}

/** Takes an item: worn at once if its slot is free, otherwise kept in the bag. */
export function take(p: HeroProgress, itemId: string): HeroProgress {
  const next = structuredClone(p);
  const slot = ITEMS[itemId]!.slot;
  if (!next.gear[slot]) next.gear[slot] = itemId; else next.bag.push(itemId);
  return next;
}
