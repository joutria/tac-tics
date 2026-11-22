/* Sound for the browser (M4 audio): effects through Web Audio, one looping music track at a time, and the player's
   volume settings kept on the device. Nothing plays until the player first taps or presses a key (browsers block
   sound before that), and every call is safe without audio support: the game just stays silent.
   Files: public/audio/<id>.mp3 and public/audio/music/<id>.mp3 (tools/audio-assets.py, CC0). */
import { cuesFor, type Cue, type MusicId, type SfxId } from "./cues";
import type { BattleEvent } from "../engine/state";

export interface AudioSettings { music: number; sfx: number; muted: boolean }
export const AUDIO_KEY = "tac-tics.audio.v1";
export const DEFAULT_AUDIO: AudioSettings = { music: 0.5, sfx: 0.8, muted: false };
/** Music fades this long when the track changes. */
const FADE_MS = 600;

let base = "./";
let settings: AudioSettings = { ...DEFAULT_AUDIO };
let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
const buffers = new Map<SfxId, Promise<AudioBuffer | null>>();
let wanted: MusicId | null = null;
let track: { id: MusicId; el: HTMLAudioElement } | null = null;

export function readAudioSettings(raw: string | null): AudioSettings {
  try {
    const s = JSON.parse(raw ?? "null") as Partial<AudioSettings> | null;
    const vol = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    return { music: vol(s?.music, DEFAULT_AUDIO.music), sfx: vol(s?.sfx, DEFAULT_AUDIO.sfx), muted: s?.muted === true };
  } catch { return { ...DEFAULT_AUDIO }; }
}

/** Call once at start with the asset base and the saved settings. */
export function initAudio(assetBase: string, saved: AudioSettings) {
  base = assetBase; settings = { ...saved };
  // The first gesture unlocks sound; until then music only remembers what it should play.
  const unlock = () => { ensureContext(); void ctx?.resume(); if (wanted && !track) playMusic(wanted); };
  for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true });
}

export const audioSettings = (): AudioSettings => ({ ...settings });

export function setAudio(next: Partial<AudioSettings>) {
  settings = { ...settings, ...next };
  if (sfxGain) sfxGain.gain.value = settings.muted ? 0 : settings.sfx;
  if (track) track.el.volume = musicVolume();
}

const musicVolume = () => (settings.muted ? 0 : settings.music * 0.6);

function ensureContext() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.muted ? 0 : settings.sfx;
  sfxGain.connect(ctx.destination);
}

function load(id: SfxId): Promise<AudioBuffer | null> {
  let p = buffers.get(id);
  if (!p) {
    p = fetch(`${base}audio/${id}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).catch(() => null);
    buffers.set(id, p);
  }
  return p;
}

/** Plays a sound effect `delay` ms from now (silently does nothing before the first gesture or when muted). */
export function sfx(id: SfxId, delay = 0, volume = 1) {
  if (!ctx || !sfxGain || settings.muted || settings.sfx === 0) return;
  const at = ctx.currentTime + delay / 1000;
  void load(id).then((buf) => {
    if (!buf || !ctx || !sfxGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = volume;
    src.connect(g).connect(sfxGain);
    src.start(Math.max(at, ctx.currentTime));
  });
}

export const playCues = (cues: Cue[]) => { for (const c of cues) sfx(c.id, c.delay); };
export const battleSounds = (events: BattleEvent[]) => playCues(cuesFor(events));

/** Fades to `id` (or to silence with null), looping. Asking for the track already playing does nothing. */
export function playMusic(id: MusicId | null) {
  wanted = id;
  if (track?.id === id) return;
  const old = track;
  track = null;
  if (old) fade(old.el, old.el.volume, 0, () => old.el.pause());
  if (!id || !ctx) return;
  const el = new Audio(`${base}audio/music/${id}.mp3`);
  el.loop = true; el.volume = 0;
  track = { id, el };
  void el.play().then(() => fade(el, 0, musicVolume())).catch(() => { if (track?.el === el) track = null; });
}

function fade(el: HTMLAudioElement, from: number, to: number, done?: () => void) {
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / FADE_MS);
    // A track still playing follows the volume slider while it fades in.
    el.volume = Math.max(0, Math.min(1, from + ((track?.el === el ? musicVolume() : to) - from) * k));
    if (k < 1) requestAnimationFrame(step); else done?.();
  };
  requestAnimationFrame(step);
}
