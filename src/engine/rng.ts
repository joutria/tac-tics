/* Seeded random numbers. The state is a single 32-bit integer stored in the game state, so a save
   (seed + commands) replays to exactly the same game on every device, which co-op will rely on. */

/** One step of mulberry32: returns a float in [0, 1) and the next state. */
export function rngNext(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Integer in [min, max], both included. */
export function rngInt(state: number, min: number, max: number): [number, number] {
  const [v, s] = rngNext(state);
  return [min + Math.floor(v * (max - min + 1)), s];
}

/** Turns any text or number into a starting state. */
export function seedFrom(seed: string | number): number {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}
