/* Which sound each battle event makes (M4 audio). Pure: a list of events in, a list of cues out, each with how long
   after the event it plays, so the sound lands with the animation (a hit sounds when the number pops up). The sound
   files are CC0, built by tools/audio-assets.py into public/audio/. */
import { ABILITIES } from "../data/abilities";
import type { BattleEvent } from "../engine/state";

export const SFX = ["select", "move", "error", "coin", "buy", "page", "equip", "levelUp", "victory", "defeat", "rest", "door",
  "step", "slash", "hurt", "crit", "down", "heal", "shine", "fire", "zap", "splash", "earth", "boom", "break", "guard", "spare", "escape"] as const;
export type SfxId = (typeof SFX)[number];
export const MUSIC = ["map", "battle", "boss", "camp"] as const;
export type MusicId = (typeof MUSIC)[number];

export interface Cue { id: SfxId; delay: number }

/** How long after a cast its hits land (the flash and floating numbers in main.ts showEvents). */
export const HIT_DELAY = 140;

/** The sound of an ability as it is cast: healing, then the element of what it hurts with, then a swing. */
export function castSound(abilityId: string): SfxId | null {
  const ab = ABILITIES[abilityId];
  if (!ab) return null;
  if (ab.heal || ab.revive) return "heal";
  if (!ab.damage) return ab.push ? "earth" : null;
  switch (ab.element) {
    case "fire": return "fire";
    case "bolt": return "zap";
    case "light": case "star": return "shine";
    case "water": case "ice": return "splash";
    case "stone": case "plant": case "mush": return "earth";
    default: return ab.range[1] <= 1 ? "slash" : "zap";
  }
}

export function cuesFor(events: BattleEvent[]): Cue[] {
  const cues: Cue[] = [];
  const add = (id: SfxId | null, delay = 0) => { if (id && !cues.some((c) => c.id === id && c.delay === delay)) cues.push({ id, delay }); };
  for (const ev of events) {
    if (ev.e === "moved" && ev.path.length) add("step");
    else if (ev.e === "guardHit") add("guard");
    else if (ev.e === "spared") add("spare");
    else if (ev.e === "escaped") add("escape");
    else if (ev.e === "shocked" || ev.e === "stunned") add("zap");
    else if (ev.e === "caughtFire") add("fire");
    else if (ev.e === "trampled" && ev.crushed.length) add("break");
    else if (ev.e === "tick") { if (ev.damage) add("hurt"); if (ev.downed || ev.died) add("down", 200); }
    else if (ev.e === "cast") {
      add(castSound(ev.ability));
      for (const f of ev.fx) {
        if (f.fx === "explode" || f.fx === "flare") add("boom", 60);
        else if (f.fx === "break") add("break", 60);
        else if (f.fx === "ignite") add("fire", 60);
        else if (f.fx === "gateOpen" || f.fx === "gateShut" || f.fx === "bridgeUp" || f.fx === "bridgeDown") add("break", 120);
      }
      if (ev.hits.some((h) => h.crit)) add("crit", HIT_DELAY);
      else if (ev.hits.some((h) => h.damage > 0)) add("hurt", HIT_DELAY);
      if (ev.hits.some((h) => h.downed || h.died)) add("down", HIT_DELAY + 260);
    }
  }
  return cues;
}
