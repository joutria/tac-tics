/* Animated ambience drawn from the CC0 sheets in public/art/fx (built by tools/ambience-art.py, credited in
   CREDITS.md): water that ripples, flames, smoke and steam columns, the camp fire, falling leaves and puffs.
   Every sheet is one row of equal frames at the packs' 1x pixel size; it is drawn at 2x like the tiles.
   If a sheet failed to load, each helper returns false so the caller can fall back to its hand-drawn look. */
import type { Images } from "./iso";

/** Frame size and frame time (ms) of each sheet. */
export const FX = {
  water: { w: 64, h: 32, n: 4, ms: 260 },
  flame: { w: 16, h: 32, n: 4, ms: 120 },
  campfire: { w: 48, h: 64, n: 4, ms: 140 },
  steam: { w: 16, h: 32, n: 4, ms: 170 },
  smoke: { w: 16, h: 32, n: 4, ms: 170 },
  puff: { w: 12, h: 12, n: 8, ms: 70 },
  leaf: { w: 12, h: 7, n: 6, ms: 110 },
} as const;
export type FxName = keyof typeof FX;

/** Image keys and URLs for loadImages. */
export function fxSources(base: string): Record<string, string> {
  return Object.fromEntries(Object.keys(FX).map((k) => [`fx-${k}`, `${base}art/fx/${k}.png`]));
}

/** Which looping frame to show at a time; seed staggers neighbours so a row of flames never moves in step. */
export const loopFrame = (name: FxName, time: number, seed = 0) => {
  const f = FX[name];
  return Math.floor(time / f.ms + seed * 1.37) % f.n;
};

/** Draws one frame of a sheet with its bottom centre at (x, y), scaled (2 = the tiles' pixel size). */
export function drawFx(ctx: CanvasRenderingContext2D, img: Images, name: FxName, frame: number, x: number, y: number, scale = 2, flip = false): boolean {
  const sheet = img[`fx-${name}`];
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return false;
  const f = FX[name], w = f.w * scale, h = f.h * scale;
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1);
    ctx.drawImage(sheet, (frame % f.n) * f.w, 0, f.w, f.h, Math.round(-w / 2), Math.round(y - h), w, h);
    ctx.restore();
  } else ctx.drawImage(sheet, (frame % f.n) * f.w, 0, f.w, f.h, Math.round(x - w / 2), Math.round(y - h), w, h);
  return true;
}

/** Water top: the whole lake ripples together so the tiles stay seamless. */
export function drawWater(ctx: CanvasRenderingContext2D, img: Images, cx: number, cy: number, time: number): boolean {
  return drawFx(ctx, img, "water", loopFrame("water", time), cx, cy + 16, 1);
}

/** A burning tile: three flames of different sizes, staggered, and a thin smoke column behind them. */
export function drawFireTile(ctx: CanvasRenderingContext2D, img: Images, cx: number, cy: number, time: number, seed: number): boolean {
  ctx.save();
  ctx.globalAlpha = 0.6;
  drawFx(ctx, img, "smoke", loopFrame("smoke", time, seed), cx + 2, cy - 6, 1.25);
  ctx.restore();
  const ok = drawFx(ctx, img, "flame", loopFrame("flame", time, seed), cx - 10, cy + 3, 1.25, seed % 2 === 0)
    && drawFx(ctx, img, "flame", loopFrame("flame", time, seed + 1), cx + 10, cy + 1, 1.15, seed % 2 === 1)
    && drawFx(ctx, img, "flame", loopFrame("flame", time, seed + 2), cx, cy + 7, 1.6);
  return ok;
}

/** The camp fire on travel scenes: Idylwild's stone ring, logs, flame and smoke, at the tiles' scale. */
export function drawCampfireFx(ctx: CanvasRenderingContext2D, img: Images, cx: number, cy: number, time: number, seed: number): boolean {
  // The ring's centre sits 12 px above the bottom of its 48 x 64 cell.
  return drawFx(ctx, img, "campfire", loopFrame("campfire", time, seed), cx, cy + 24, 2);
}

/** Steam over a tile: pale columns rising, and small puffs boiling off, thick enough to read as "can't see through". */
export function drawSteamTile(ctx: CanvasRenderingContext2D, img: Images, cx: number, cy: number, time: number, seed: number): boolean {
  ctx.save();
  let ok = true;
  for (const [dx, dy, s, k] of [[-12, 4, 1.6, 0], [11, 2, 1.5, 1], [0, 9, 1.9, 2]] as const) {
    ctx.globalAlpha = 0.85;
    ok = drawFx(ctx, img, "steam", loopFrame("steam", time, seed + k), cx + dx, cy + dy, s, k === 1) && ok;
  }
  for (let i = 0; i < 2; i++) {
    const life = (time / 900 + i * 0.5 + seed * 0.21) % 1;
    ctx.globalAlpha = 0.9;
    drawFx(ctx, img, "puff", Math.floor(life * FX.puff.n), cx + (i ? 9 : -8), cy - 6 - life * 26, 2);
  }
  ctx.restore();
  return ok;
}

/** A leaf now and then tumbling down from a tree's crown, swaying as it falls. Each tree has its own rhythm. */
export function drawFallingLeaf(ctx: CanvasRenderingContext2D, img: Images, cx: number, cy: number, time: number, seed: number) {
  const period = 5200 + (seed % 7) * 600, fall = 2600;
  const t = (time + seed * 977) % period;
  if (t > fall) return;
  const k = t / fall;
  const x = cx - 8 + (seed % 3) * 8 + Math.sin(k * Math.PI * 3 + seed) * 9;
  const y = cy - 40 + k * 44;
  ctx.save();
  ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
  drawFx(ctx, img, "leaf", Math.floor(t / FX.leaf.ms), x, y, 1.5, Math.sin(k * Math.PI * 3 + seed) < 0);
  ctx.restore();
}

/** A one-off puff of smoke or steam where a fire was put out, ice melted or a crate broke. */
export interface Burst { pos: { x: number; y: number }; born: number; kind: "smoke" | "steam" }
export const BURST_MS = FX.puff.n * FX.puff.ms;

export function drawBurst(ctx: CanvasRenderingContext2D, img: Images, b: Burst, cx: number, cy: number, time: number) {
  const age = time - b.born;
  if (age < 0 || age >= BURST_MS) return;
  const fr = Math.floor(age / FX.puff.ms);
  ctx.save();
  ctx.globalAlpha = b.kind === "smoke" ? 0.7 : 0.95;
  for (const [dx, dy, s] of [[-10, 0, 2.5], [9, -3, 2.2], [0, -10, 3]] as const) drawFx(ctx, img, "puff", fr, cx + dx, cy + dy - age / 40, s);
  ctx.restore();
}
