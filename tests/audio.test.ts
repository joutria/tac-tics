/* M4 audio: which sounds battle events make, the saved settings, and that every sound has its file. */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { castSound, cuesFor, HIT_DELAY, MUSIC, SFX } from "../src/audio/cues";
import { DEFAULT_AUDIO, readAudioSettings } from "../src/audio/sound";
import { ABILITIES } from "../src/data/abilities";
import type { BattleEvent } from "../src/engine/state";

const hit = (o: object = {}) => ({ unit: "f", damage: 5, heal: 0, crit: false, downed: false, died: false, ...o }) as never;

describe("battle sounds", () => {
  it("a cast sounds its element, then the hit lands a moment later", () => {
    const ev: BattleEvent = { e: "cast", unit: "h", ability: "ray", target: { x: 1, y: 1 }, hits: [hit()], fx: [] };
    const cues = cuesFor([ev]);
    expect(cues[0]).toEqual({ id: castSound("ray"), delay: 0 });
    expect(cues).toContainEqual({ id: "hurt", delay: HIT_DELAY });
  });

  it("crits, downs, explosions and guards have their own sounds, each once", () => {
    const cues = cuesFor([
      { e: "guardHit", unit: "g", target: "f" },
      { e: "cast", unit: "h", ability: "ray", target: { x: 1, y: 1 }, hits: [hit({ crit: true, downed: true }), hit({ crit: true })], fx: [{ fx: "explode", at: { x: 0, y: 0 } } as never] },
    ]);
    const ids = cues.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["guard", "crit", "down", "boom"]));
    expect(ids.filter((i) => i === "crit")).toHaveLength(1);
    expect(ids).not.toContain("hurt");
  });

  it("walking steps, healing chimes, and quiet events stay quiet", () => {
    expect(cuesFor([{ e: "moved", unit: "h", path: [{ x: 1, y: 0 }] }]).map((c) => c.id)).toEqual(["step"]);
    expect(cuesFor([{ e: "waited", unit: "h" }, { e: "turnStarted", unit: "h", round: 1 }])).toEqual([]);
    const healer = Object.values(ABILITIES).find((a) => a.heal)!;
    expect(castSound(healer.id)).toBe("heal");
  });

  it("every ability that hurts or heals makes a sound", () => {
    for (const a of Object.values(ABILITIES)) if (a.damage || a.heal) expect(castSound(a.id), a.id).not.toBeNull();
  });
});

describe("audio settings and files", () => {
  it("bad or missing settings fall back to the defaults", () => {
    expect(readAudioSettings(null)).toEqual(DEFAULT_AUDIO);
    expect(readAudioSettings("{oops")).toEqual(DEFAULT_AUDIO);
    expect(readAudioSettings(JSON.stringify({ music: 2, sfx: 0.3, muted: true }))).toEqual({ music: DEFAULT_AUDIO.music, sfx: 0.3, muted: true });
  });

  it("every sound and music track has its file in public/audio", () => {
    for (const id of SFX) expect(existsSync(`public/audio/${id}.mp3`), id).toBe(true);
    for (const id of MUSIC) expect(existsSync(`public/audio/music/${id}.mp3`), id).toBe(true);
  });
});
