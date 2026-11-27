/* The words before a fight (data/parley.ts): who speaks, in what order, picked from the battle's seed so a reload
   says the same thing. Foes who can talk (people, goblins, ratfolk, brutes, rivals) open; a goal's survivor or
   courier may cry out; the hero answers; sometimes a companion adds a word. Mindless creatures stay silent, and a
   fight among only those has no talk at all. Pure: the screen (main.ts) shows the lines. */
import type { BattleSetup, UnitSpec } from "../engine/state";
import { rngInt, seedFrom } from "../engine/rng";
import { CHIMES, COMPANION_LINES, NEMESIS_OPENERS, OPENERS, REPLIES, RETURNED_OPENERS, VOICE_OF, type Reply, type Voice } from "../data/parley";
import type { Line } from "../data/rivals";
import { SURVIVORS } from "../data/goals";
import { rivalName, rivalTaunt, type Rival } from "./rivals";

/** One line of the talk: who says it (a unit on the field) and what. */
export interface Spoken { unit: string; name: string; look: string; side: "heroes" | "foes"; text: string }

export interface ParleyContext {
  lang: keyof Line;
  /** The run node's kind ("boss", "rival", ...). */
  kind?: string;
  /** The run's rivals; those on the field speak first. */
  rivals?: Rival[];
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A taunt is stored as `Name: «words»`; the talk box shows the name on its own plate. */
const words = (taunt: string) => taunt.replace(/^[^:«"]+:\s*/, "").replace(/^[«"](.*)[»"]\.?$/s, "$1");

/** Which voice a unit talks with, if any. */
export function voiceOf(u: Pick<UnitSpec, "look" | "runner" | "ward">): Voice | null {
  if (u.runner) return "courier";
  if (u.ward) return "survivor";
  return VOICE_OF[u.look] ?? null;
}

/** Talk order for leading a fight: the loudest speaks first. */
const RANK: Voice[] = ["mira", "brute", "troll", "looter", "shaman", "goblin", "ratfolk"];

export function parley(setup: BattleSetup, ctx: ParleyContext): Spoken[] {
  const { lang } = ctx;
  let rng = seedFrom(`${setup.seed}:parley`);
  const pick = <T>(list: readonly T[]): T => { let i: number; [i, rng] = rngInt(rng, 0, list.length - 1); return list[i]!; };
  const chance = (p: number) => { let v: number; [v, rng] = rngInt(rng, 0, 99); return v < p * 100; };
  const say = (u: UnitSpec, text: string, name = u.name): Spoken => ({ unit: u.id, name, look: u.look, side: u.team, text });

  const foes = setup.units.filter((u) => u.team === "foes" && !u.runner);
  const hero = setup.units.find((u) => u.team === "heroes" && !u.ward);
  if (!hero) return [];
  const out: Spoken[] = [];
  let reply: Reply = "plain", foeName = "";

  // A rival on the field speaks first, in its own words.
  const rival = (ctx.rivals ?? []).find((r) => !r.settled && foes.some((u) => u.id === r.id));
  const rivalUnit = rival ? foes.find((u) => u.id === rival.id) : undefined;
  if (rival && rivalUnit) {
    foeName = rivalName(rival, lang);
    const text = rival.nemesis ? pick(NEMESIS_OPENERS)[lang] : rival.returned ? pick(RETURNED_OPENERS)[lang] : words(rivalTaunt(rival, lang));
    out.push(say(rivalUnit, text, foeName));
    reply = rival.nemesis ? "nemesis" : "rival";
  }
  // Otherwise the talking foe that leads (the boss, a brute, then people before goblins and ratfolk).
  const talkers = foes.filter((u) => u.id !== rivalUnit?.id && voiceOf(u))
    .sort((a, b) => RANK.indexOf(voiceOf(a)!) - RANK.indexOf(voiceOf(b)!));
  const lead = talkers[0];
  if (lead && !out.length) {
    const v = voiceOf(lead)!;
    out.push(say(lead, pick(OPENERS[v])[lang]));
    foeName = lead.name;
    if (v === "mira") reply = "boss";
    else if (v === "brute" || v === "troll") reply = "brute";
  }
  // A second voice chimes in now and then.
  const second = talkers.find((u) => u !== lead && CHIMES[voiceOf(u)!]);
  if (second && out.length && chance(0.5)) out.push(say(second, pick(CHIMES[voiceOf(second)!]!)[lang]));

  // A goal: its survivor cries out, or its courier boasts, and the hero answers to the goal.
  const goal = setup.goal;
  const ward = goal?.kind === "protect" ? setup.units.find((u) => u.id === goal.ward) : undefined;
  const runner = goal?.kind === "catch" ? setup.units.find((u) => u.id === goal.runner) : undefined;
  if (ward) out.push(say(ward, pick(OPENERS.survivor)[lang]));
  if (runner) out.push(say(runner, pick(OPENERS.courier)[lang]));
  if (goal) reply = goal.kind;
  // Nobody who can talk: no talk (a survive goal against beasts has nobody to answer either).
  if (!out.length) return [];

  const the = ward ? SURVIVORS.find((v) => v.look === ward.look)?.the[lang] ?? ward.name.toLowerCase() : "";
  const text = fill(pick(REPLIES[reply])[lang], { foe: foeName, the, The: cap(the) });
  out.push(say(hero, text));
  const mate = setup.units.find((u) => u.team === "heroes" && COMPANION_LINES[u.id]);
  if (mate && chance(0.35)) out.push(say(mate, pick(COMPANION_LINES[mate.id]!)[lang]));
  return out;
}
