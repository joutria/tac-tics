/* Draws the battle in an isometric (diagonal) view on a canvas, and turns a click back into a tile.
   Grid +x runs down-right on screen and +y down-left; each height level lifts a tile by 16 px.
   The view can be turned in 90 degree steps so nothing stays hidden behind a hill or a tree. */
import { STATUS } from "../engine/status";
import { cellsOf, GridMap, Pos, PROP_HP, tileAt, type Prop, type Tile } from "../engine/grid";
import { MAX_REVIVES } from "../engine/combat";
import { wavering, yielding } from "../engine/escape";
import { roundOf, type BattleState, type Facing, type Unit } from "../engine/state";
import { iconCanvas, splitIcons, type IconId } from "../ui/icons";
import { drawPuddle } from "./puddle";
import { drawBurst, drawFallingLeaf, drawFireTile, drawFx, drawSteamTile, drawWater, loopFrame, type Burst } from "./fx";
import { biomeOf, sceneryFor } from "./scenery";

/** Fire that never goes out (camp fires on travel scenes) is drawn as a camp fire: stones, logs and a live flame. */
const CAMPFIRE_AT = 1e11;
const PX_FONT = '"Pixelify Sans", system-ui, sans-serif';

/** Draws a text in which emoji stand for pixel icons (see src/ui/icons.ts), centred on x, with a dark outline. */
export function drawRich(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, outline = true) {
  const parts = splitIcons(text);
  ctx.save();
  ctx.font = `600 ${size}px ${PX_FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const isz = Math.round(size * 1.15), gap = 2;
  const widths = parts.map((p) => (typeof p === "string" ? ctx.measureText(p).width : isz + gap));
  let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
  ctx.imageSmoothingEnabled = false;
  parts.forEach((p, i) => {
    if (typeof p === "string") {
      if (outline) { ctx.lineWidth = 3; ctx.strokeStyle = "rgba(11,16,51,0.95)"; ctx.lineJoin = "round"; ctx.strokeText(p, cx, y); }
      ctx.fillStyle = color; ctx.fillText(p, cx, y);
    } else ctx.drawImage(iconCanvas(p.icon), Math.round(cx), Math.round(y - isz / 2), isz, isz);
    cx += widths[i]!;
  });
  ctx.restore();
}

/** A pixel flame that flickers: the icon and its mirror take turns, and it stretches a little. */
function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed: number) {
  const t = time / 110 + seed * 1.7;
  const ic: IconId = Math.floor(t) % 2 ? "fire" : "flameB";
  const stretch = 1 + 0.12 * Math.sin(t * 2.3);
  const w = size, h = Math.round(size * stretch);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(iconCanvas(ic), Math.round(x - w / 2), Math.round(y - h), w, h);
}

/** A camp fire: warm light on the ground, a ring of stones, crossed logs, a tall flame and sparks rising. */
function drawCampfire(ctx: CanvasRenderingContext2D, img: Images, c: { x: number; y: number }, time: number, seed: number) {
  if (!flat) { isoCampfire(ctx, img, c, time, seed); return; }
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, sx = Math.round(c.x + Math.cos(a) * 16), sy = Math.round(c.y + 2 + Math.sin(a) * 8);
    ctx.fillStyle = "#1b1626"; ctx.fillRect(sx - 2, sy - 1, 5, 4);
    ctx.fillStyle = i % 2 ? "#8d8aa0" : "#c9c6d6"; ctx.fillRect(sx - 1, sy - 1, 3, 2);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(iconCanvas("logs"), c.x - 15, c.y - 23, 30, 30);
  drawFlame(ctx, c.x, c.y + 1, 28, time, seed);
  for (let i = 0; i < 4; i++) {
    const life = ((time / 900 + i * 0.27 + seed * 0.13) % 1);
    const sx = Math.round(c.x + Math.sin(time / 300 + i * 2) * 7), sy = Math.round(c.y - 26 - life * 40);
    ctx.globalAlpha = 1 - life;
    ctx.fillStyle = i % 2 ? "#ffe06b" : "#ff9a3a"; ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();
}

/** The warm light of a camp fire, laid over the ground and whoever sits around it (drawn after the tiles). */
function campfireGlow(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, time: number, seed: number) {
  const pulse = 0.85 + 0.15 * Math.sin(time / 170 + seed);
  const g = ctx.createRadialGradient(c.x, c.y - 6, 4, c.x, c.y - 6, 96);
  g.addColorStop(0, `rgba(255, 170, 70, ${0.38 * pulse})`); g.addColorStop(0.45, `rgba(255, 120, 40, ${0.14 * pulse})`); g.addColorStop(1, "rgba(255, 120, 40, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y - 6, 96, 60, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A small canvas tent on a camp, its open flap facing the viewer, with a pole and a pennant. */
function drawTent(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, seed: number) {
  ctx.save();
  const cloth = seed % 2 ? ["#d9c9a0", "#b8a274", "#8e7a52"] : ["#c9604a", "#a8473a", "#7a3026"];
  const L = { x: c.x - 24, y: c.y }, R = { x: c.x + 24, y: c.y }, B = { x: c.x, y: c.y + 12 }, T = { x: c.x, y: c.y - 12 };
  const top = { x: c.x - 6, y: c.y - 30 }, top2 = { x: c.x + 10, y: c.y - 38 };
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(B.x, B.y); ctx.lineTo(R.x, R.y); ctx.lineTo(T.x, T.y); ctx.closePath(); ctx.fill();
  const poly = (pts: { x: number; y: number }[], fill: string) => {
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "#1b1626"; ctx.lineWidth = 1.5; ctx.stroke();
  };
  // Back roof slope, front roof slope (lit), then the front gable with a dark doorway.
  poly([top, top2, { x: R.x, y: R.y - 6 }, { x: c.x + 8, y: c.y + 4 }], cloth[2]!);
  poly([{ x: L.x + 4, y: L.y + 2 }, top, { x: c.x + 8, y: c.y + 4 }, { x: c.x - 2, y: c.y + 10 }], cloth[0]!);
  poly([{ x: c.x - 2, y: c.y + 10 }, top, { x: c.x + 8, y: c.y + 4 }], cloth[1]!);
  ctx.fillStyle = "#2a1c14"; ctx.beginPath(); ctx.moveTo(c.x + 1, c.y + 8); ctx.lineTo(top.x + 2, top.y + 14); ctx.lineTo(c.x + 6, c.y + 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x, top.y - 8); ctx.stroke();
  ctx.fillStyle = "#ffe06b"; ctx.beginPath(); ctx.moveTo(top.x, top.y - 8); ctx.lineTo(top.x + 7, top.y - 6); ctx.lineTo(top.x, top.y - 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** A bedroll laid on the ground by the fire. */
function drawBedroll(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, seed: number) {
  ctx.save();
  const [body, edge] = seed % 2 ? ["#4f74d6", "#2b479f"] : ["#5bc46a", "#2a7d38"];
  const q = (u: number, v: number) => ({ x: c.x + (u - v) * 32, y: c.y - 16 + (u + v) * 16 }); // u, v: 0..1 across the tile
  const pts = [q(0.15, 0.35), q(0.85, 0.35), q(0.85, 0.7), q(0.15, 0.7)];
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = "#1b1626"; ctx.lineWidth = 1.2; ctx.stroke();
  const fold = [q(0.15, 0.35), q(0.36, 0.35), q(0.36, 0.7), q(0.15, 0.7)];
  ctx.beginPath(); fold.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = edge; ctx.fill(); ctx.stroke();
  const pil = q(0.74, 0.52);
  ctx.fillStyle = "#f7f3e8"; ctx.beginPath(); ctx.ellipse(pil.x, pil.y, 7, 3.5, 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** Fire on the ground: a flickering orange wash, animated flames and a thin smoke column (hand-drawn flames if the
    sheet is missing, and in the flat tactical view). */
function groundFire(ctx: CanvasRenderingContext2D, img: Images, c: { x: number; y: number }, time: number, p: Pos) {
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time / 90 + p.x * 3 + p.y);
  diamond(ctx, c.x, c.y, "#ff7a2a", "rgba(255,200,80,0.8)");
  ctx.globalAlpha = 1;
  if (flat || !drawFireTile(ctx, img, c.x, c.y, time, p.x * 3 + p.y)) {
    drawFlame(ctx, c.x - 7, c.y + 4, 14, time, p.x + p.y * 3);
    drawFlame(ctx, c.x + 7, c.y + 2, 12, time + 170, p.x * 3 + p.y);
  }
}

/** Flames licking over an object that stands on the tile (a crate, a tree's crown), `lift` px above the ground. */
function burningObject(ctx: CanvasRenderingContext2D, img: Images, c: { x: number; y: number }, time: number, seed: number, lift: number) {
  if (flat) { drawFlame(ctx, c.x, c.y + lift + 6, 16, time, seed); return; }
  if (!drawFireTile(ctx, img, c.x, c.y + lift, time, seed + 5)) drawFlame(ctx, c.x, c.y + lift + 6, 18, time, seed);
}

/** Burnt ground: darker, with grey ash flecks and a few dying embers. Seeded, so it does not shimmer. */
function drawScorch(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, seed: number) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(c.x, c.y - TH / 2); ctx.lineTo(c.x + TW / 2, c.y); ctx.lineTo(c.x, c.y + TH / 2); ctx.lineTo(c.x - TW / 2, c.y); ctx.closePath();
  ctx.fillStyle = "rgba(28, 18, 14, 0.42)"; ctx.fill();
  ctx.clip();
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < 14; i++) {
    const u = rnd(), v = rnd(), x = Math.round(c.x + (u - v) * 30), y = Math.round(c.y - 15 + (u + v) * 15);
    ctx.fillStyle = i % 5 === 0 ? "#1a1210" : i % 3 === 0 ? "#9a948c" : "#5d5650";
    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, 1);
  }
  ctx.restore();
}

/** What a burnt tree leaves: a short charred stump with a glowing crack. */
function drawStump(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, seed: number) {
  ctx.save();
  const x = c.x + (seed % 3) - 1, y = c.y - 2;
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + 3, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1b1626"; ctx.fillRect(x - 8, y - 11, 16, 13);
  ctx.fillStyle = "#3a2a22"; ctx.fillRect(x - 7, y - 10, 14, 12);
  ctx.fillStyle = "#24181a"; ctx.fillRect(x + 2, y - 10, 5, 12);
  ctx.fillStyle = "#1b1626"; ctx.beginPath(); ctx.ellipse(x, y - 11, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5b4636"; ctx.beginPath(); ctx.ellipse(x, y - 11, 6.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a1c18"; ctx.beginPath(); ctx.ellipse(x, y - 11, 3.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff8a3a"; ctx.fillRect(x - 4, y - 5, 1, 3); ctx.fillRect(x - 3, y - 3, 2, 1);
  ctx.restore();
}

/** A camp fire seen from the battle's angle: an oval ring of stones (the back half behind the fire, the front half
    in front), embers, two logs laid along the grid, then the pack's animated flame and smoke. */
function isoCampfire(ctx: CanvasRenderingContext2D, img: Images, c: { x: number; y: number }, time: number, seed: number) {
  ctx.save();
  const cx = c.x, cy = c.y + 2, rx = 17, ry = 8.5;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(cx, cy + 2, rx + 3, ry + 2, 0, 0, Math.PI * 2); ctx.fill();
  const stone = (a: number) => {
    const sx = Math.round(cx + Math.cos(a) * rx), sy = Math.round(cy + Math.sin(a) * ry);
    ctx.fillStyle = "#1b1626"; ctx.fillRect(sx - 4, sy - 4, 8, 6);
    ctx.fillStyle = "#8d8aa0"; ctx.fillRect(sx - 3, sy - 3, 6, 4);
    ctx.fillStyle = "#c9c6d6"; ctx.fillRect(sx - 3, sy - 3, 4, 2);
  };
  const N = 11, angles = Array.from({ length: N }, (_, i) => (i / N) * Math.PI * 2 + 0.2);
  for (const a of angles) if (Math.sin(a) < 0) stone(a);
  // Ash and embers inside the ring.
  ctx.fillStyle = "#2a1f1c"; ctx.beginPath(); ctx.ellipse(cx, cy, rx - 4, ry - 2, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7 + seed, glow = 0.5 + 0.5 * Math.sin(time / 160 + i * 2);
    ctx.fillStyle = `rgba(255, ${120 + Math.round(80 * glow)}, 60, ${0.5 + 0.5 * glow})`;
    ctx.fillRect(Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 3.5), 2, 1);
  }
  // Two logs crossed along the grid's two directions (slopes of +-1/2 on screen).
  const log = (dir: 1 | -1) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1b1626"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 11, cy - dir * 5.5); ctx.lineTo(cx + 11, cy + dir * 5.5); ctx.stroke();
    ctx.strokeStyle = "#6b4426"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 11, cy - dir * 5.5); ctx.lineTo(cx + 11, cy + dir * 5.5); ctx.stroke();
    ctx.strokeStyle = "#8f6236"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 10, cy - dir * 5.5 - 1); ctx.lineTo(cx + 10, cy + dir * 5.5 - 1); ctx.stroke();
  };
  log(1); log(-1);
  ctx.globalAlpha = 0.7;
  drawFx(ctx, img, "smoke", loopFrame("smoke", time, seed), cx + 1, cy - 30, 2);
  ctx.globalAlpha = 1;
  if (!drawFx(ctx, img, "flame", loopFrame("flame", time, seed), cx, cy + 4, 2)) drawFlame(ctx, cx, cy + 1, 28, time, seed);
  for (const a of angles) if (Math.sin(a) >= 0) stone(a);
  ctx.restore();
}

export const TW = 64, TH = 32, LEVEL = 16;
/** Characters are drawn at this size (Jose: smaller characters). A giant is twice this. */
export const UNIT_SCALE = 0.8;
/** How far a swimmer sits in the water: its sprite drops this much and is cut at the waterline. */
export const SWIM_SINK = 11;

export type Images = Record<string, HTMLImageElement>;

export function loadImages(srcs: Record<string, string>): Promise<Images> {
  return Promise.all(Object.entries(srcs).map(([k, src]) => new Promise<[string, HTMLImageElement]>((ok, bad) => {
    const im = new Image();
    im.onload = () => ok([k, im]);
    im.onerror = () => bad(new Error(`could not load ${src}`));
    im.src = src;
  }))).then((list) => Object.fromEntries(list));
}

export interface View { ox: number; oy: number; scale: number; rot: number }

/** Grid position as seen after turning the view `rot` quarter turns. */
export function rotate(m: GridMap, p: Pos, rot: number): Pos {
  switch (((rot % 4) + 4) % 4) {
    case 1: return { x: m.h - 1 - p.y, y: p.x };
    case 2: return { x: m.w - 1 - p.x, y: m.h - 1 - p.y };
    case 3: return { x: p.y, y: m.w - 1 - p.x };
    default: return { ...p };
  }
}
export function unrotate(m: GridMap, p: Pos, rot: number): Pos {
  switch (((rot % 4) + 4) % 4) {
    case 1: return { x: p.y, y: m.h - 1 - p.x };
    case 2: return { x: m.w - 1 - p.x, y: m.h - 1 - p.y };
    case 3: return { x: m.w - 1 - p.y, y: p.x };
    default: return { ...p };
  }
}
const dims = (m: GridMap, rot: number) => (rot % 2 ? { w: m.h, h: m.w } : { w: m.w, h: m.h });
const FACINGS: Facing[] = ["N", "E", "S", "W"];
const rotFacing = (f: Facing, rot: number) => FACINGS[(FACINGS.indexOf(f) + rot) % 4]!;

/** Map size in unscaled pixels, with room above for tall objects and raised tiles. */
export function mapPixelSize(m: GridMap) {
  const n = m.w + m.h;
  return { w: n * (TW / 2), h: n * (TH / 2) + 4 * LEVEL + 64 };
}

/** Tactical view: every tile drawn flat at ground level in plain colours, with heights written as numbers,
    so nothing hides behind hills or trees. Picking follows the same flat layout. */
let flat = false;
export const setFlat = (on: boolean) => { flat = on; };
export const isFlat = () => flat;

/** Screen position (unscaled) of the centre of a tile's top, for a real grid position. */
export function tileCenter(m: GridMap, p: Pos, rot: number): { x: number; y: number } {
  const h = flat ? 0 : tileAt(m, p)?.h ?? 0;
  const r = rotate(m, p, rot), d = dims(m, rot);
  return { x: (r.x - r.y) * (TW / 2) + d.h * (TW / 2), y: (r.x + r.y) * (TH / 2) - h * LEVEL + 3 * LEVEL + 64 };
}

/** Which tile is under a point (unscaled map pixels); front tiles win, so raised ground is picked correctly. */
export function pickTile(m: GridMap, px: number, py: number, rot: number): Pos | null {
  const d = dims(m, rot);
  for (let k = d.w + d.h - 2; k >= 0; k--) {
    for (let x = Math.min(k, d.w - 1); x >= 0 && k - x < d.h; x--) {
      const p = unrotate(m, { x, y: k - x }, rot);
      const c = tileCenter(m, p, rot);
      if (Math.abs(px - c.x) / (TW / 2) + Math.abs(py - c.y) / (TH / 2) <= 1) return p;
    }
  }
  return null;
}

/** Where each unit's sprite frame was last drawn (map pixels), so a click counts as on a unit only where the
    sprite actually has paint: a tile peeking out beside or behind a character can still be picked. */
interface DrawnSprite { map: GridMap; sheet: HTMLImageElement; sx: number; sy: number; x: number; y: number; flip: boolean; scale?: number; waterline?: number }
const drawnSprites = new Map<string, DrawnSprite>();
/** The map of the battle being drawn, so sprites recorded for a travel scene never answer clicks in a fight. */
let spriteMap: GridMap | null = null;
/** Each sheet's alpha channel, read once. */
const sheetAlpha = new WeakMap<HTMLImageElement, { w: number; a: Uint8ClampedArray } | null>();

function alphaOf(sheet: HTMLImageElement) {
  if (sheetAlpha.has(sheet)) return sheetAlpha.get(sheet)!;
  let out: { w: number; a: Uint8ClampedArray } | null = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = sheet.naturalWidth || sheet.width; cv.height = sheet.naturalHeight || sheet.height;
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(sheet, 0, 0);
    out = { w: cv.width, a: g.getImageData(0, 0, cv.width, cv.height).data };
  } catch { out = null; } // no canvas, or a tainted image: fall back to the box
  sheetAlpha.set(sheet, out);
  return out;
}

/** Is there paint under a point (map pixels), allowing one sprite pixel of slack so edges are not fiddly? */
function spriteHit(d: DrawnSprite, px: number, py: number) {
  // Sprite drawn at (-32, -64) .. (32, 0) around its feet, times its scale; a swimmer is hidden under its waterline.
  if (d.waterline !== undefined && py > d.waterline + 1) return false;
  let lx = (px - d.x) / (d.scale ?? 1), ly = (py - d.y) / (d.scale ?? 1);
  if (d.flip) lx = -lx;
  const fx = Math.floor(lx + 32), fy = Math.floor(ly + 64);
  if (fx < -1 || fx > 64 || fy < -1 || fy > 64) return false;
  const al = alphaOf(d.sheet);
  if (!al) return Math.abs(lx) <= 18 && ly >= -64 && ly <= 4;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const x = fx + ox, y = fy + oy;
    if (x < 0 || x >= 64 || y < 0 || y >= 64) continue;
    if (al.a[((d.sy + y) * al.w + d.sx + x) * 4 + 3]! > 40) return true;
  }
  return false;
}

/** What a tap or click at a point means. Units win over ground where their sprite is painted, because they
    stand up over the tiles behind them; then the tile whose top face is under the point; then, for a finger landing on a cliff side or
    between tiles, the nearest tile top within `slack` tile-widths. */
export function pickAt(m: GridMap, units: readonly Unit[], px: number, py: number, rot: number, slack = 0): Pos | null {
  let best: { p: Pos; depth: number } | null = null;
  for (const u of units) {
    if (u.life === "dead" || u.life === "escaped" || u.life === "spared") continue;
    const k = u.size ?? 1, front = frontCell(m, u.pos, k, rot);
    const drawn = drawnSprites.get(u.id);
    if (drawn && drawn.map === m) { if (!spriteHit(drawn, px, py)) continue; }
    else {
      const c = bodyCenter(m, u.pos, k, rot), z = k * UNIT_SCALE;
      if (Math.abs(px - c.x) > 18 * z || py < c.y - 58 * z || py > c.y + 10 * z) continue;
    }
    const r = rotate(m, front, rot), depth = r.x + r.y;
    // A giant is picked on the tile of its body under the pointer when there is one, else its front tile.
    const under = k > 1 ? pickTile(m, px, py, rot) : null;
    const p = under && under.x >= u.pos.x && under.y >= u.pos.y && under.x < u.pos.x + k && under.y < u.pos.y + k ? under : k > 1 ? front : u.pos;
    if (!best || depth > best.depth) best = { p, depth };
  }
  if (best) return best.p;
  const exact = pickTile(m, px, py, rot);
  if (exact || slack <= 0) return exact;
  let near: { p: Pos; d: number } | null = null;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = tileCenter(m, { x, y }, rot);
    const d = Math.abs(px - c.x) / (TW / 2) + Math.abs(py - c.y) / (TH / 2);
    if (d <= 1 + slack && (!near || d < near.d)) near = { p: { x, y }, d };
  }
  return near?.p ?? null;
}

export type Mark = "move" | "range" | "blocked" | "target" | "area" | "chosen" | "short" | "deploy";
/** Small notes on reach: up = reached only thanks to height, down = lost to lower ground. */
export type ReachBadge = "up" | "down";
/** A line of sight cut by `blocker`, drawn over the board while aiming at a blocked tile. */
export interface SightLine { from: Pos; to: Pos; blocker: Pos }
export interface Floater { pos: Pos; text: string; color: string; born: number }

/** A unit on its way somewhere. The rules already put it at the end; this only draws the trip.
    walk = step by step with a hop on height changes; slide = pushed in a straight line; blink = vanish and reappear. */
export interface Motion { points: Pos[]; born: number; stepMs: number; kind: "walk" | "slide" | "blink" }

export const motionMs = (mo: Motion) => (mo.points.length - 1) * mo.stepMs;

const facingOf = (a: Pos, b: Pos): Facing => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "E" : "W") : dy >= 0 ? "S" : "N";
};

/** Where a body of `size` with its corner at `p` stands on screen: the middle of its tiles (one tile: its centre).
    Its slot is its front tile in this rotation, so it is painted after every tile it covers. */
export function bodyCenter(m: GridMap, p: Pos, size: number, rot: number): { x: number; y: number } {
  if (size <= 1) return tileCenter(m, p, rot);
  const cs = cellsOf(p, size).filter((c) => tileAt(m, c)).map((c) => tileCenter(m, c, rot));
  if (!cs.length) return tileCenter(m, p, rot);
  return { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length };
}
function frontCell(m: GridMap, p: Pos, size: number, rot: number): Pos {
  if (size <= 1) return p;
  let best = p, bd = -Infinity;
  for (const c of cellsOf(p, size)) { const r = rotate(m, c, rot), d = r.x + r.y; if (d > bd) { bd = d; best = c; } }
  return best;
}

/** Where to draw a unit right now: the screen point, the tile it is painted with (so it sorts in front of the
    tiles it passes) and the way it faces. */
function placeOf(m: GridMap, u: Unit, mo: Motion | undefined, time: number, rot: number) {
  const size = u.size ?? 1;
  const at = (p: Pos) => bodyCenter(m, p, size, rot), slotOf = (p: Pos) => frontCell(m, p, size, rot);
  const still = { c: at(u.pos), slot: slotOf(u.pos), facing: u.facing, alpha: 1 };
  if (!mo || mo.points.length < 2) return still;
  const e = (time - mo.born) / mo.stepMs, last = mo.points.length - 1;
  if (e >= last) return still;
  if (e < 0) return { ...still, c: at(mo.points[0]!), slot: slotOf(mo.points[0]!) };
  if (mo.kind === "blink") {
    const p = e < 0.5 ? mo.points[0]! : mo.points[last]!;
    return { c: at(p), slot: slotOf(p), facing: u.facing, alpha: Math.abs(1 - 2 * e) };
  }
  const i = Math.floor(e), f = e - i, a = mo.points[i]!, b = mo.points[i + 1]!;
  const ca = at(a), cb = at(b);
  const dh = Math.abs((tileAt(m, a)?.h ?? 0) - (tileAt(m, b)?.h ?? 0));
  const lift = mo.kind === "walk" ? Math.sin(Math.PI * f) * (dh ? 10 + 6 * dh : 3) : 0;
  const fa = slotOf(a), fb = slotOf(b);
  const ra = rotate(m, fa, rot), rb = rotate(m, fb, rot);
  const slot = rb.x + rb.y >= ra.x + ra.y ? fb : fa;
  return {
    c: { x: ca.x + (cb.x - ca.x) * f, y: ca.y + (cb.y - ca.y) * f - lift },
    slot, facing: mo.kind === "walk" ? facingOf(a, b) : u.facing, alpha: 1,
  };
}

export interface DrawOptions {
  marks: Map<string, Mark>;
  /** Per tile: how far it has dropped and how faded it is (the battle intro). */
  sink?: (p: Pos) => { dy: number; alpha: number } | null;
  hover: Pos | null;
  active: string | null;
  time: number;
  floaters: Floater[];
  /** One-off puffs of smoke or steam (a fire put out, ice melting, a crate breaking). */
  bursts?: Burst[];
  motions?: Map<string, Motion>;
  /** Tiles some foe could hit next turn (the danger zone). */
  danger?: Set<string>;
  /** The selected attack's predicted damage on a unit, shown as a flashing chunk of its health bar. */
  preview?: { unit: string; min: number; max: number };
  /** A unit to point out (tapped in the turn bar). */
  focus?: string | null;
  /** Units just hit, and when: they flash bright for a moment. */
  flashes?: Map<string, number>;
  /** Escape routes of retreating or fleeing foes, drawn as dotted lines to the edge. */
  escapePaths?: Pos[][];
  /** What the chosen ability would move or set off: where pushed units and crates end up, and barrel blasts. */
  effects?: { moves: { from: Pos; to: Pos; bump: number; fall?: number }[]; blasts: Pos[]; splashes?: { unit: string; damage: number }[] };
  /** Reach notes drawn on tiles while aiming (see ReachBadge). */
  badges?: Map<string, ReachBadge>;
  /** The cut line of sight to the tile being aimed at. */
  sightLine?: SightLine;
  /** Trace the border of the ability's reach, so its shape reads at a glance. */
  outline?: boolean;
  /** Scenery mode (travel scenes, the route map): units without health bars, rings or badges. */
  bare?: boolean;
  /** Choosing which way a unit faces as its turn ends: it turns to `face`, with four arrows round it. */
  facing?: { unit: string; face: Facing };
}

const STEP: Record<Facing, Pos> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };
/** Which way on screen (unscaled pixels per tile) a step toward `f` goes, in this turn of the view. */
export function faceVector(m: GridMap, f: Facing, rot: number): { x: number; y: number } {
  const a = rotate(m, { x: 0, y: 0 }, rot), b = rotate(m, STEP[f], rot);
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: (dx - dy) * (TW / 2), y: (dx + dy) * (TH / 2) };
}

/** The facing a point (unscaled map pixels) picks round a unit: the arrow whose direction is closest.
    Null on the unit itself, where a tap keeps the facing already chosen. */
export function faceAt(m: GridMap, u: Unit, px: number, py: number, rot: number): Facing | null {
  const c = bodyCenter(m, u.pos, u.size ?? 1, rot);
  // The sprite stands above its tile: a press on its body counts as on the unit.
  const dx = px - c.x, dy = py - c.y;
  if (Math.abs(dx) < 14 * (u.size ?? 1) && dy > -48 * (u.size ?? 1) && dy < 10) return null;
  let best: Facing = u.facing, bd = -Infinity;
  for (const f of ["N", "E", "S", "W"] as const) {
    const v = faceVector(m, f, rot);
    // Measured on the flattened diamond, so all four arrows get an equal share of the screen.
    const d = (dx * v.x) / (TW * TW) + (dy * v.y) / (TH * TH);
    if (d > bd) { bd = d; best = f; }
  }
  return best;
}

/** Four arrows on the ground round a unit choosing its facing; the chosen one is gold and pulses. */
function drawFacingArrows(ctx: CanvasRenderingContext2D, m: GridMap, u: Unit, face: Facing, rot: number, time: number) {
  const size = u.size ?? 1, c = bodyCenter(m, u.pos, size, rot);
  const pulse = 0.5 + 0.5 * Math.sin(time / 160);
  for (const f of ["N", "E", "S", "W"] as const) {
    const v = faceVector(m, f, rot), on = f === face;
    // Along the tile's edge direction, so the arrow lies flat on the ground like the diamond does.
    const reach = (size - 1) * 0.5 + 0.5 + (on ? 0.1 * pulse : 0);
    const bx = c.x + v.x * reach, by = c.y + v.y * reach;
    const tip = on ? 0.85 : 0.7, wing = on ? 0.75 : 0.6;
    const tx = bx + v.x * tip, ty = by + v.y * tip;
    // Wings: across the arrow, along the other tile axis (flat on the ground).
    const w = faceVector(m, f === "N" || f === "S" ? "E" : "N", rot), px = w.x * wing / 2, py = w.y * wing / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx + px, by + py);
    ctx.lineTo(bx + v.x * 0.12, by + v.y * 0.12);
    ctx.lineTo(bx - px, by - py);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = on ? 3.5 : 2.5;
    ctx.strokeStyle = "rgba(20, 12, 4, 0.9)";
    ctx.fillStyle = on ? `rgba(255, ${200 + Math.round(30 * pulse)}, 80, 1)` : "rgba(240, 240, 255, 0.75)";
    if (on) { ctx.shadowColor = "rgba(255, 210, 90, 0.9)"; ctx.shadowBlur = 8 + 6 * pulse; }
    ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.restore();
  }
}

const FLAT_COLOUR: Record<string, string> = { grass: "#7fb24a", tallgrass: "#5f9a3a", dirt: "#c08a58", water: "#4fb8e0", tree: "#3f6b32", ice: "#cdeaf5", bridge: "#9a6b3f" };

const FACING_FRAME = { S: { col: 0, flip: false }, N: { col: 2, flip: false }, E: { col: 4, flip: false }, W: { col: 4, flip: true } } as const;
/** Which row of a multi-row sheet a look uses (all current sheets use their first row). */
const SHEET_ROW: Record<string, number> = {};

/** A small face for the turn bar: the unit's front frame, as an image URL. Cached per look. */
const portraits = new Map<string, string>();
export function portrait(img: Images, look: string): string {
  const hit = portraits.get(look);
  if (hit) return hit;
  // A look with a drawn face portrait (the party's, public/art/heroes/<look>-face.png) shows it, cut square.
  const face = img[`face-${look}`];
  if (face) {
    const c = document.createElement("canvas"); c.width = c.height = face.width;
    const g = c.getContext("2d")!; g.imageSmoothingEnabled = false;
    g.drawImage(face, 0, 0);
    const url = c.toDataURL();
    portraits.set(look, url);
    return url;
  }
  const sheet = img[`unit-${look}`];
  if (!sheet) return "";
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d")!; g.imageSmoothingEnabled = false;
  const row = Math.min(SHEET_ROW[look] ?? 0, sheet.height / 64 - 1);
  g.drawImage(sheet, 0, row * 64 + 4, 64, 44, 0, 4, 32, 22);
  const url = c.toDataURL();
  portraits.set(look, url);
  return url;
}
const MARK_STYLE: Record<Mark, [string, string]> = {
  move: ["rgba(70, 150, 255, 0.5)", "rgba(200, 230, 255, 1)"],
  range: ["rgba(255, 120, 100, 0.24)", "rgba(255, 170, 150, 0.6)"],
  target: ["rgba(255, 90, 70, 0.45)", "rgba(255, 210, 200, 0.95)"],
  blocked: ["rgba(40, 40, 52, 0.55)", "rgba(150, 150, 165, 0.7)"], // in range, but something stands in the way
  area: ["rgba(255, 170, 60, 0.5)", "rgba(255, 230, 160, 1)"],
  chosen: ["rgba(255, 216, 107, 0.6)", "rgba(255, 255, 255, 1)"],
  short: ["rgba(20, 16, 30, 0.22)", "rgba(255, 170, 150, 0.28)"], // inside the card's reach, but too close or too low
  deploy: ["rgba(255, 216, 107, 0.42)", "rgba(255, 240, 180, 1)"], // where a party member may start (before a fight)
};
/** Marks inside an ability's reach: the outline runs around them. */
const IN_REACH = new Set<Mark>(["range", "target", "blocked", "area", "chosen"]);

export function drawBattle(ctx: CanvasRenderingContext2D, s: BattleState, img: Images, view: View, opt: DrawOptions) {
  const m = s.map, d = dims(m, view.rot);
  spriteMap = m;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  const places = s.units.filter((v) => v.life === "up" || v.life === "downed").map((v) => {
    const mo = opt.motions?.get(v.id);
    const moving = !!mo && opt.time < mo.born + motionMs(mo);
    return { u: v, moving, big: (v.size ?? 1) > 1, ...placeOf(m, v, mo, opt.time, view.rot) };
  });
  const round = roundOf(s);
  const depth = (p: Pos) => { const r = rotate(m, p, view.rot); return r.x + r.y; };
  const drawPlace = (pl: (typeof places)[number]) => {
    ctx.globalAlpha = pl.alpha;
    const pv = opt.preview && opt.preview.unit === pl.u.id ? opt.preview : undefined;
    const hitAt = opt.flashes?.get(pl.u.id);
    const flash = hitAt !== undefined && opt.time >= hitAt && opt.time - hitAt < 180;
    const swim = !pl.big && tileAt(m, pl.slot)?.terrain === "water";
    const facing = opt.facing?.unit === pl.u.id ? opt.facing.face : pl.facing;
    drawUnit(ctx, { ...pl.u, facing }, img, pl.c, pl.u.id === opt.active, opt.time, view.rot, pv, opt.focus === pl.u.id, wavering(pl.u, round), opt.bare, flash, swim);
    ctx.globalAlpha = 1;
  };
  // Painter's order: back diagonals first; on each tile its ground, then what stands on it.
  for (let k = 0; k <= d.w + d.h - 2; k++) {
    for (let x = 0; x <= k; x++) {
      if (x >= d.w || k - x >= d.h) continue;
      const p = unrotate(m, { x, y: k - x }, view.rot);
      const tile = tileAt(m, p);
      if (!tile || tile.offMap) continue;
      // The battle intro: ground outside the arena drops away, with whatever stands on it.
      const sunk = opt.sink?.(p);
      if (sunk && sunk.alpha <= 0) continue;
      if (sunk) { ctx.save(); ctx.translate(0, sunk.dy); ctx.globalAlpha = sunk.alpha; }
      const c = tileCenter(m, p, view.rot);
      const k2 = `${p.x},${p.y}`;
      if (flat) {
        // Plain colours, a little lighter per level, with the level written on raised ground.
        diamond(ctx, c.x, c.y, FLAT_COLOUR[tile.terrain] ?? "#888", "rgba(0,0,0,0.35)");
        if (tile.h) diamond(ctx, c.x, c.y, `rgba(255,255,255,${0.12 * tile.h})`, "rgba(0,0,0,0)");
        if (tile.prop === "rock" || tile.terrain === "tree") {
          ctx.save(); ctx.translate(c.x, c.y); ctx.scale(0.55, 0.55);
          diamond(ctx, 0, 0, tile.terrain === "tree" ? "#24401c" : "#3c3e45", "rgba(255,255,255,0.4)", 2);
          ctx.restore();
        }
      } else {
        for (let lvl = tile.h; lvl >= 0; lvl--) {
          ctx.drawImage(img["side-left"]!, c.x - TW / 2, c.y + lvl * LEVEL);
          ctx.drawImage(img["side-right"]!, c.x, c.y + lvl * LEVEL);
        }
        // In the mines a Sap crystal grows out of bare rock, not grass.
        const top = img[tile.terrain === "tree" && biomeOf(m.id) === "mine" ? "top-dirt" : `top-${tile.terrain}`];
        if (tile.terrain === "water" && drawWater(ctx, img, c.x, c.y, opt.time)) { /* rippling water from the fx sheet */ }
        else if (top) ctx.drawImage(top, c.x - TW / 2, c.y - TH / 2);
        else {
          // Terrain with no tile art yet (ice, bridge): a plain diamond, with planks drawn on a bridge.
          diamond(ctx, c.x, c.y, FLAT_COLOUR[tile.terrain] ?? "#888", "rgba(0,0,0,0.3)");
          if (tile.terrain === "bridge") {
            ctx.strokeStyle = "rgba(60,35,15,0.6)"; ctx.lineWidth = 1;
            for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(c.x - TW / 4 + i * 7, c.y - TH / 4 + i * 3.5); ctx.lineTo(c.x + TW / 4 + i * 7, c.y + TH / 4 + i * 3.5 - TH / 2); ctx.stroke(); }
          }
        }
        // Height cues, part 1: raised tops are lit a little warmer per level, and ground at the foot of a
        // higher neighbour behind it gets a soft shadow, so plateaus read at every rotation.
        if (tile.h > 0) diamond(ctx, c.x, c.y, `rgba(255, 238, 190, ${Math.min(0.32, 0.1 * tile.h)})`, "rgba(0,0,0,0)");
        footShadows(ctx, m, x, k - x, view.rot, tile.h, c);
      }
      if (tile.scorchedAt !== undefined && !flat) drawScorch(ctx, c, p.x * 13 + p.y * 7);
      if (tile.surface) {
        // Oil and sap puddles join up with the same liquid on the same level, whatever the view's rotation.
        const rx = x, ry = k - x, kind = tile.surface;
        drawPuddle(ctx, kind, c, opt.time, p.x * 5 + p.y * 3, (du, dv) => {
          const q = unrotate(m, { x: rx + du, y: ry + dv }, view.rot), n = tileAt(m, q);
          return rx + du >= 0 && ry + dv >= 0 && rx + du < d.w && ry + dv < d.h && n?.surface === kind && n.h === tile.h;
        });
      }
      drawSurface(ctx, tile, c, s.clock, opt.time, p);
      const mark = opt.marks.get(k2);
      if (mark) diamond(ctx, c.x, c.y, ...MARK_STYLE[mark], mark === "chosen" ? 2.5 : 1);
      if (mark && opt.outline && IN_REACH.has(mark)) reachRim(ctx, m, x, k - x, view.rot, c, opt.marks);
      // Danger zone: a dull purple wash (bright colours over many tiles tire the eye), on top of other marks.
      if (opt.danger?.has(k2)) diamond(ctx, c.x, c.y, "rgba(120, 70, 170, 0.38)", "rgba(200, 160, 255, 0.55)");
      if (opt.hover && opt.hover.x === p.x && opt.hover.y === p.y) diamond(ctx, c.x, c.y, "rgba(255, 255, 255, 0.2)", "#fff");
      const badge = opt.badges?.get(k2);
      if (badge) reachBadge(ctx, badge, c);
      // Height cues, part 2: a dark-and-light rim on every edge that drops to lower ground (drawn over marks, so
      // the shape of the ground stays readable while aiming).
      if (!flat) ledges(ctx, m, x, k - x, view.rot, tile.h, c);
      if (flat && tile.h) {
        ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(String(tile.h), c.x + 1, c.y + 9);
        ctx.fillStyle = "#fff"; ctx.fillText(String(tile.h), c.x, c.y + 8);
        ctx.textBaseline = "alphabetic";
      }
      const onFire = (tile.fireUntil ?? 0) > s.clock && (tile.fireUntil ?? 0) < CAMPFIRE_AT;
      if ((tile.fireUntil ?? 0) >= CAMPFIRE_AT) drawCampfire(ctx, img, c, opt.time, p.x * 7 + p.y);
      else if (onFire && !tile.prop && tile.terrain !== "tree") groundFire(ctx, img, c, opt.time, p);
      if (tile.prop && !(flat && tile.prop === "rock")) drawProp(ctx, img, tile, c, m.id, p);
      else if (tile.link?.kind === "gate") drawGate(ctx, c, true);
      // A burning crate: the flames and smoke go over the crate.
      if (onFire && tile.prop) { burningObject(ctx, img, c, opt.time, p.x * 3 + p.y, -14); }
      if (tile.steamUntil !== undefined) {
        // Steam: pale puffs drifting up, thick enough to read as "can't see through".
        ctx.globalAlpha = 0.5;
        diamond(ctx, c.x, c.y, "#e6eef4", "rgba(255,255,255,0.8)");
        ctx.globalAlpha = 1;
        if (!flat && drawSteamTile(ctx, img, c.x, c.y, opt.time, p.x * 5 + p.y)) { /* animated steam columns */ }
        else for (let i = 0; i < 4; i++) {
          const rise = (opt.time / 30 + i * 10 + p.x * 7) % 40;
          ctx.globalAlpha = 0.85 * (1 - rise / 48);
          ctx.fillStyle = "#f4f8fb";
          ctx.beginPath(); ctx.arc(c.x + (i - 1.5) * 8, c.y - 4 - rise, 11 - i, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!flat && tile.deco === "bedroll") drawBedroll(ctx, c, p.x + p.y);
      if (!flat && tile.deco === "stump") drawStump(ctx, c, p.x * 5 + p.y);
      if (!flat && tile.deco === "tent") drawTent(ctx, c, p.x * 3 + p.y);
      else if (!flat && tile.terrain === "tree") {
        // See-through when someone stands right behind it, so trees never hide a unit.
        const behind = [[-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => {
          const q = unrotate(m, { x: x + dx!, y: k - x + dy! }, view.rot);
          return places.some((v) => v.slot.x === q.x && v.slot.y === q.y);
        });
        ctx.globalAlpha = behind ? 0.45 : 1;
        drawScenery(ctx, img, sceneryFor("tree", m.id, tile, p), c);
        ctx.globalAlpha = 1;
        // A burning tree: flames all through the crown and smoke above it.
        if (onFire) { groundFire(ctx, img, c, opt.time, p); burningObject(ctx, img, c, opt.time, p.x * 3 + p.y, -30); }
        if (!onFire && biomeOf(m.id) !== "mine") drawFallingLeaf(ctx, img, c.x, c.y, opt.time, p.x * 11 + p.y * 5);
      }
      const here = places.some((pl) => !pl.moving && pl.slot.x === p.x && pl.slot.y === p.y);
      if (tile.terrain === "tallgrass") tallGrass(ctx, c, p.x * 7 + p.y * 3, opt.time, false, flat);
      for (const pl of places) if (!pl.moving && !pl.big && pl.slot.x === p.x && pl.slot.y === p.y) drawPlace(pl);
      // A front fringe over whoever stands in it, so they read as hidden in the grass.
      if (tile.terrain === "tallgrass" && here) tallGrass(ctx, c, p.x * 5 + p.y * 11, opt.time, true, flat);
      if (sunk) ctx.restore();
    }
    // A unit between two tiles goes after the whole diagonal it is entering, so nothing on that row covers it; so
    // does a giant, whose body spills over the tiles beside its front one.
    for (const pl of places) if ((pl.moving || pl.big) && depth(pl.slot) === k) drawPlace(pl);
  }
  // Camp fires light up what is around them.
  for (let i = 0; i < m.tiles.length; i++) {
    if ((m.tiles[i]!.fireUntil ?? 0) < CAMPFIRE_AT) continue;
    const p = { x: i % m.w, y: Math.floor(i / m.w) };
    campfireGlow(ctx, tileCenter(m, p, view.rot), opt.time, p.x * 7 + p.y);
  }
  // Effect preview: a blast's 3x3 in orange; each push as an arrow to a ghost tile, with the bump damage if it hits something.
  for (const b of opt.effects?.blasts ?? []) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = { x: b.x + dx, y: b.y + dy };
      if (!tileAt(m, q)) continue;
      const c = tileCenter(m, q, view.rot);
      diamond(ctx, c.x, c.y, "rgba(255, 140, 40, 0.3)", "rgba(255, 190, 90, 0.8)");
    }
  }
  for (const mv of opt.effects?.moves ?? []) {
    const a = tileCenter(m, mv.from, view.rot), b = tileCenter(m, mv.to, view.rot);
    const pulse = 0.6 + 0.4 * Math.sin(opt.time / 160);
    ctx.save();
    if (mv.from.x !== mv.to.x || mv.from.y !== mv.to.y) {
      diamond(ctx, b.x, b.y, `rgba(120, 220, 255, ${0.35 * pulse})`, "rgba(170, 235, 255, 0.95)", 2);
      ctx.strokeStyle = "rgba(170, 235, 255, 0.95)"; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 8); ctx.lineTo(b.x, b.y - 8); ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.fillStyle = "rgba(170, 235, 255, 0.95)";
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 8);
      ctx.lineTo(b.x - 9 * Math.cos(ang - 0.5), b.y - 8 - 9 * Math.sin(ang - 0.5));
      ctx.lineTo(b.x - 9 * Math.cos(ang + 0.5), b.y - 8 - 9 * Math.sin(ang + 0.5)); ctx.fill();
    }
    const label = [mv.fall ? `⤓ -${mv.fall}` : "", mv.bump ? `💥 -${mv.bump}` : ""].filter(Boolean).join(" ");
    if (label) {
      ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.fillStyle = mv.fall ? "#ff7a6b" : "#ffb347";
      ctx.strokeText(label, b.x, b.y + 16); ctx.fillText(label, b.x, b.y + 16);
    }
    ctx.restore();
  }
  // Units hurt by having someone slammed into them or fallen on them.
  for (const sp of opt.effects?.splashes ?? []) {
    const v = s.units.find((x) => x.id === sp.unit);
    if (!v || !sp.damage) continue;
    const c = tileCenter(m, v.pos, view.rot);
    ctx.save();
    ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.fillStyle = "#ff7a6b";
    ctx.strokeText(`💢 -${sp.damage}`, c.x, c.y + 32); ctx.fillText(`💢 -${sp.damage}`, c.x, c.y + 32);
    ctx.restore();
  }
  for (const path of opt.escapePaths ?? []) {
    // Dotted line from the foe to the edge it is heading for, ending in an arrow.
    if (path.length < 2) continue;
    const pts = path.map((p) => tileCenter(m, p, view.rot));
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -opt.time / 60;
    ctx.strokeStyle = "rgba(255, 200, 90, 0.95)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
    const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.setLineDash([]); ctx.fillStyle = "rgba(255, 200, 90, 0.95)";
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - 9 * Math.cos(ang - 0.5), b.y - 9 * Math.sin(ang - 0.5));
    ctx.lineTo(b.x - 9 * Math.cos(ang + 0.5), b.y - 9 * Math.sin(ang + 0.5)); ctx.fill();
    ctx.restore();
  }
  if (opt.facing) { const fu = s.units.find((x) => x.id === opt.facing!.unit); if (fu) drawFacingArrows(ctx, m, fu, opt.facing.face, view.rot, opt.time); }
  if (opt.sightLine) drawSightLine(ctx, m, view.rot, opt.sightLine, opt.time);
  for (const b of opt.bursts ?? []) { const c = tileCenter(m, b.pos, view.rot); drawBurst(ctx, img, b, c.x, c.y, opt.time); }
  for (const f of opt.floaters) {
    const age = (opt.time - f.born) / 1000;
    if (age < 0 || age > 1.4) continue;
    const c = tileCenter(m, f.pos, view.rot);
    ctx.globalAlpha = Math.max(0, 1 - age / 1.4);
    // A little pop as it appears, then it drifts up and fades.
    const pop = age < 0.12 ? 1 + (0.12 - age) * 3 : 1;
    drawRich(ctx, f.text, c.x, c.y - 74 - age * 24, Math.round(14 * pop), f.color);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* Edges of a tile's top diamond, in screen order, with the rotated-grid step to the neighbour across each one.
   back = the edge faces away from the viewer (its drop is hidden behind the tile). */
const EDGES = [
  { dx: 0, dy: -1, a: [0, -1], b: [1, 0], back: true }, // top -> right
  { dx: 1, dy: 0, a: [1, 0], b: [0, 1], back: false }, // right -> bottom
  { dx: 0, dy: 1, a: [0, 1], b: [-1, 0], back: false }, // bottom -> left
  { dx: -1, dy: 0, a: [-1, 0], b: [0, -1], back: true }, // left -> top
] as const;

/** The border of an ability's reach: a bright line on every edge whose neighbour is out of reach. */
function reachRim(ctx: CanvasRenderingContext2D, m: GridMap, rx: number, ry: number, rot: number, c: { x: number; y: number }, marks: Map<string, Mark>) {
  const d = dims(m, rot);
  ctx.save();
  ctx.lineCap = "round";
  for (const e of EDGES) {
    const nx = rx + e.dx, ny = ry + e.dy;
    const off = nx < 0 || ny < 0 || nx >= d.w || ny >= d.h;
    if (!off) { const q = unrotate(m, { x: nx, y: ny }, rot), nm = marks.get(`${q.x},${q.y}`); if (nm && IN_REACH.has(nm)) continue; }
    // Pulled in a little, so neighbouring rims at another height never merge.
    const ax = c.x + e.a[0] * TW / 2 * 0.94, ay = c.y + e.a[1] * TH / 2 * 0.94, bx = c.x + e.b[0] * TW / 2 * 0.94, by = c.y + e.b[1] * TH / 2 * 0.94;
    ctx.strokeStyle = "rgba(40, 8, 4, 0.7)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = "rgba(255, 196, 170, 1)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.restore();
}

/** A small note in the corner of a tile: ▲ height adds the reach to it, ▼ lower ground takes it away. */
function reachBadge(ctx: CanvasRenderingContext2D, b: ReachBadge, c: { x: number; y: number }) {
  const x = c.x + 14, y = c.y + 2, up = b === "up";
  ctx.save();
  ctx.fillStyle = up ? "#ffd86b" : "#ff8a7a"; ctx.strokeStyle = "#1a1208"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (up) { ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 3); ctx.lineTo(x - 5, y + 3); }
  else { ctx.moveTo(x, y + 5); ctx.lineTo(x + 5, y - 3); ctx.lineTo(x - 5, y - 3); }
  ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

/** The line of sight to a blocked tile: clear up to what blocks it, a red X there, and a dashed red line after. */
function drawSightLine(ctx: CanvasRenderingContext2D, m: GridMap, rot: number, l: SightLine, time: number) {
  const eye = (p: Pos) => { const c = tileCenter(m, p, rot); return { x: c.x, y: c.y - 22 }; };
  const a = eye(l.from), b = eye(l.to), k = eye(l.blocker);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(k.x, k.y); ctx.stroke();
  ctx.strokeStyle = "rgba(255, 240, 200, 0.95)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(k.x, k.y); ctx.stroke();
  ctx.setLineDash([5, 5]); ctx.lineDashOffset = -time / 60;
  ctx.strokeStyle = "rgba(255, 107, 91, 0.9)";
  ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
  for (const [col, w] of [["#1a0d0d", 5], ["#ff6b5b", 2.5]] as const) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(k.x - 6, k.y - 6); ctx.lineTo(k.x + 6, k.y + 6); ctx.moveTo(k.x + 6, k.y - 6); ctx.lineTo(k.x - 6, k.y + 6); ctx.stroke();
  }
  ctx.restore();
}

/** Height of the neighbour across an edge, in rotated grid steps; off the map counts as no neighbour. */
function neighbourH(m: GridMap, rx: number, ry: number, rot: number): number | null {
  const d = dims(m, rot);
  if (rx < 0 || ry < 0 || rx >= d.w || ry >= d.h) return null;
  return tileAt(m, unrotate(m, { x: rx, y: ry }, rot))?.h ?? null;
}

/** Rims along every edge that drops to lower ground: a dark outer line and a bright inner one, thicker for
    bigger drops. Lighting is fixed to the screen, so it reads the same after a turn of the view. */
function ledges(ctx: CanvasRenderingContext2D, m: GridMap, rx: number, ry: number, rot: number, h: number, c: { x: number; y: number }) {
  if (h <= 0) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const e of EDGES) {
    const nh = neighbourH(m, rx + e.dx, ry + e.dy, rot);
    const drop = nh === null ? 0 : h - nh;
    if (drop <= 0) continue;
    const ax = c.x + e.a[0] * TW / 2, ay = c.y + e.a[1] * TH / 2, bx = c.x + e.b[0] * TW / 2, by = c.y + e.b[1] * TH / 2;
    const w = Math.min(3.5, 1.5 + drop);
    ctx.strokeStyle = "rgba(20, 14, 8, 0.75)"; ctx.lineWidth = w + 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // The bright line sits just inside the top, so it belongs to the high tile, not the ground below.
    const ix = (c.x - (ax + bx) / 2) * 0.12, iy = (c.y - (ay + by) / 2) * 0.12;
    ctx.strokeStyle = e.back ? "rgba(255, 246, 210, 0.9)" : "rgba(255, 236, 170, 0.95)"; ctx.lineWidth = Math.max(1, w - 1.5);
    ctx.beginPath(); ctx.moveTo(ax + ix, ay + iy); ctx.lineTo(bx + ix, by + iy); ctx.stroke();
  }
  ctx.restore();
}

/** A soft shadow on the strip of a tile's top next to a higher neighbour behind it (where that cliff stands). */
function footShadows(ctx: CanvasRenderingContext2D, m: GridMap, rx: number, ry: number, rot: number, h: number, c: { x: number; y: number }) {
  for (const e of EDGES) {
    if (!e.back) continue;
    const nh = neighbourH(m, rx + e.dx, ry + e.dy, rot);
    const rise = nh === null ? 0 : nh - h;
    if (rise <= 0) continue;
    const ax = c.x + e.a[0] * TW / 2, ay = c.y + e.a[1] * TH / 2, bx = c.x + e.b[0] * TW / 2, by = c.y + e.b[1] * TH / 2;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, f = 0.55; // shadow reaches a bit past the middle of the tile
    const ox = (c.x - mx) * 2 * f, oy = (c.y - my) * 2 * f;
    const g = ctx.createLinearGradient(mx, my, mx + ox, my + oy);
    g.addColorStop(0, `rgba(10, 8, 20, ${Math.min(0.5, 0.28 + 0.08 * rise)})`); g.addColorStop(1, "rgba(10, 8, 20, 0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx + ox, by + oy); ctx.lineTo(ax + ox, ay + oy); ctx.closePath(); ctx.fill();
  }
}

/** Tall grass: swaying blades over the tile; `front` draws a shorter fringe in front of a unit standing in it. */
function tallGrass(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, seed: number, time: number, front: boolean, flat: boolean) {
  if (flat) { if (!front) diamond(ctx, c.x, c.y, "rgba(40, 110, 40, 0.55)", "rgba(150, 230, 110, 0.7)"); return; }
  const blades = front ? 14 : 22;
  for (let i = 0; i < blades; i++) {
    const r = ((seed * 9301 + i * 49297) % 233280) / 233280;
    const r2 = ((seed * 4271 + i * 7919) % 1000) / 1000;
    const bx = c.x + (r - 0.5) * (TW * 0.7), by = c.y + (front ? 4 + r2 * 8 : (r2 - 0.5) * TH * 0.6);
    const h = front ? 14 + r2 * 10 : 20 + r2 * 16;
    const sway = Math.sin(time / 500 + seed + i) * 2.5;
    ctx.globalAlpha = front ? 0.9 : 1;
    // A dark outline under each blade keeps it readable on any ground, in the game's pixel style.
    for (const [col, w] of [["#1f4a18", 4], [i % 3 === 0 ? "#a6e060" : i % 3 === 1 ? "#6cbc40" : "#479a30", 2.2]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway, by - h / 2, bx + sway * 2, by - h); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Sap sources and charged water on top of the ground (src/engine/terrain.ts); the puddles are drawPuddle. */
function drawSurface(ctx: CanvasRenderingContext2D, tile: Tile, c: { x: number; y: number }, clock: number, time: number, p: Pos) {
  if (tile.surface === "sap" && tile.sapSource) {
    // The ooze itself is a pixel puddle (drawPuddle); a source has a glowing shard in the middle.
    const pulse = 0.5 + 0.5 * Math.sin(time / 300 + p.x * 2 + p.y);
    {
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.75 + 0.25 * pulse;
      ctx.drawImage(iconCanvas("shard"), c.x - 8, Math.round(c.y - 12 - 2 * pulse), 16, 16); ctx.globalAlpha = 1;
    }
  }
  if (tile.terrain === "water" && (tile.chargedUntil ?? 0) > clock) {
    // Charged water: a crackling yellow-white wash and a bolt.
    ctx.globalAlpha = 0.3 + 0.25 * Math.abs(Math.sin(time / 70 + p.x * 5 + p.y * 3));
    diamond(ctx, c.x, c.y, "#fff3a0", "rgba(255, 250, 200, 0.9)");
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(iconCanvas("bolt"), c.x - 6, c.y - 8, 12, 12);
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, stroke: string, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y - TH / 2); ctx.lineTo(x + TW / 2, y); ctx.lineTo(x, y + TH / 2); ctx.lineTo(x - TW / 2, y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function drawUnit(
  ctx: CanvasRenderingContext2D, u: Unit, img: Images, c: { x: number; y: number }, active: boolean, time: number, rot: number,
  preview?: { min: number; max: number }, focus = false, shaky = false, bare = false, flash = false, swim = false,
) {
  const sheet = img[`unit-${u.look}`];
  const team = u.team === "heroes" ? "#ffe680" : "#ff8a7a";
  const base = ctx.globalAlpha; // lets a blinking unit fade as a whole
  // A giant (size 2) is drawn twice as big, centred on its four tiles, with its shadow and ring over all of them.
  const k = u.size ?? 1, ring = k > 1 ? 1.9 * k / 2 : 1, z = k * UNIT_SCALE;
  if (!swim) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 13 * ring * (k > 1 ? 1.6 : 1), 6 * ring * (k > 1 ? 1.6 : 1), 0, 0, Math.PI * 2); ctx.fill();
  }
  if (!bare) {
    ctx.strokeStyle = team; ctx.lineWidth = active ? 2.5 : 1;
    ctx.globalAlpha = base * (active ? 1 : 0.6);
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 20 * ring * (k > 1 ? 1.6 : 1), 9 * ring * (k > 1 ? 1.6 : 1), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = base;
  }
  if (!sheet) return;
  const downed = u.life === "downed";
  const f = FACING_FRAME[rotFacing(u.facing, rot)];
  const frame = downed ? 9 : f.col + (Math.floor(time / 450) % 2); // column 9 is the asleep pose
  const row = Math.min(SHEET_ROW[u.look] ?? 0, sheet.height / 64 - 1);
  // A swimmer bobs a little, sunk to its chest, and the water cuts it at the waterline.
  const sink = swim ? SWIM_SINK + Math.round(Math.sin(time / 380 + c.x) * 1.5) : 0, waterline = c.y + 3;
  const feet = Math.round(c.y + 5 * z + sink);
  ctx.save();
  if (swim) { ctx.beginPath(); ctx.rect(c.x - 40 * z, waterline - 80 * z, 80 * z, 80 * z); ctx.clip(); }
  ctx.translate(c.x, feet);
  if (f.flip && !downed) ctx.scale(-1, 1);
  if (downed) ctx.globalAlpha = base * 0.6;
  // Just hit: a white flash (browsers without canvas filters simply skip it), and a small knock back.
  if (flash) { ctx.filter = "brightness(2.6) saturate(0.3)"; ctx.translate(Math.round(Math.sin(time / 18) * 2), 0); }
  ctx.drawImage(sheet, frame * 64, row * 64, 64, 64, -32 * z, -64 * z, 64 * z, 64 * z);
  drawnSprites.set(u.id, { map: spriteMap!, sheet, sx: frame * 64, sy: row * 64, x: c.x, y: feet, flip: f.flip && !downed, scale: z, ...(swim ? { waterline } : {}) });
  ctx.filter = "none";
  ctx.restore();
  if (swim) drawRipples(ctx, c.x, waterline, time);
  if (bare) return;
  // Everything over the head follows the sprite's size: higher on a giant, lower on a swimmer.
  const foot = c.y;
  c = { x: c.x, y: c.y + Math.round(64 - 64 * z + 20 * (k - 1) * UNIT_SCALE) + sink };
  // Health bar over the head; downed units show the turns they have left.
  const w = 30 + 14 * (k - 1), ratio = u.hp / u.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(c.x - w / 2 - 1, c.y - 62, w + 2, 5);
  ctx.fillStyle = u.team === "heroes" ? "#7ed957" : "#e85a4f"; ctx.fillRect(c.x - w / 2, c.y - 61, w * ratio, 3);
  // Revives left, as small pips under the bar: bright = can still be helped up, dark = used.
  for (let i = 0; i < MAX_REVIVES; i++) {
    ctx.fillStyle = i < MAX_REVIVES - u.revives ? "#f2efe6" : "rgba(0,0,0,0.6)";
    ctx.fillRect(c.x - w / 2 + i * 5, c.y - 56, 3, 2);
  }
  if (preview) {
    // Sure loss in solid white, the possible extra flashing, so the player sees what is left after the hit.
    const after = (d: number) => Math.max(0, u.hp - d) / u.maxHp;
    const sure = after(preview.min), worst = after(preview.max);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(c.x - w / 2 + w * sure, c.y - 61, w * (ratio - sure), 3);
    ctx.globalAlpha = (Math.sin(time / 120) + 1) / 2;
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(c.x - w / 2 + w * worst, c.y - 61, w * (sure - worst), 3);
    ctx.globalAlpha = base;
  }
  if (focus) {
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.globalAlpha = base * ((Math.sin(time / 150) + 1) / 2);
    ctx.beginPath(); ctx.ellipse(c.x, foot + 2, (24 + 3 * Math.sin(time / 150)) * ring * (k > 1 ? 1.6 : 1), 11 * ring * (k > 1 ? 1.6 : 1), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = base;
  }
  if (downed) drawRich(ctx, `✚ ${u.downedTurns}`, c.x, c.y - 70, 12, "#fff");
  // Rooted and status effects: small pixel icons in a row on the right of the health bar.
  const icons: IconId[] = [...(u.guard ? ["shield" as const] : []), ...(u.rooted ? ["plant" as const] : []), ...u.statuses.map((x) => x.id)];
  ctx.imageSmoothingEnabled = false;
  icons.forEach((ic, i) => ctx.drawImage(iconCanvas(ic), Math.round(c.x + 16 + i * 10), Math.round(c.y - 64), 10, 10));
  if (u.rival) {
    // A rival from an earlier battle: a purple star over its head.
    ctx.drawImage(iconCanvas("rival"), Math.round(c.x - 6), Math.round(c.y - 82), 12, 12);
  }
  // Battle goals (engine/goals.ts): a shield over the survivor to protect, a shard over the courier's satchel.
  if ((u.ward || u.runner) && u.life === "up") {
    ctx.globalAlpha = base * (0.75 + 0.25 * Math.sin(time / 300));
    ctx.drawImage(iconCanvas(u.ward ? "shield" : "shard"), Math.round(c.x - 7), Math.round(c.y - (yielding(u) ? 98 : 84)), 14, 14);
    ctx.globalAlpha = base;
  }
  if (active) {
    // Whose turn it is: a bouncing arrow over the head, gold for the party, red for foes.
    const bob = Math.round(Math.abs(Math.sin(time / 260)) * -5);
    const ay = c.y - (u.rival || yielding(u) ? 104 : 90) + bob;
    ctx.drawImage(iconCanvas(u.team === "heroes" ? "turn" : "turnFoe"), Math.round(c.x - 10), Math.round(ay), 20, 20);
  }
  // Yielding: a white flag over its head (it can be spared).
  if (yielding(u)) {
    const fx = c.x + (u.rival ? 12 : 0), fy = c.y - 70;
    ctx.globalAlpha = base * (0.8 + 0.2 * Math.sin(time / 260));
    ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx - 5, fy + 9); ctx.lineTo(fx - 5, fy - 9); ctx.stroke();
    const wave = Math.sin(time / 180) * 1.5;
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fx - 4, fy - 9); ctx.quadraticCurveTo(fx + 1, fy - 11 + wave, fx + 7, fy - 8);
    ctx.lineTo(fx + 7, fy - 1); ctx.quadraticCurveTo(fx + 1, fy - 4 + wave, fx - 4, fy - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = base;
  }
  // Escape states: a running figure while retreating (steady) or fleeing (pulsing), "!" while wavering.
  const badge = u.escape !== "none" ? "🏃" : shaky ? "!" : "";
  if (badge) {
    const pulse = u.escape === "flee" || shaky ? 0.6 + 0.4 * Math.sin(time / 140) : 1;
    ctx.globalAlpha = base * pulse;
    ctx.beginPath(); ctx.arc(c.x - 22, c.y - 59, 7, 0, Math.PI * 2);
    ctx.fillStyle = u.escape === "flee" ? "#b8322a" : u.escape === "retreat" ? "#2d5a8c" : "#a07a10"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff"; ctx.fillText(badge, c.x - 22, c.y - 58.5);
    ctx.textBaseline = "alphabetic"; ctx.globalAlpha = base;
  }
}

/** Rings on the water round a swimmer: a pale line at the waterline and a wider one spreading out and fading. */
function drawRipples(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(225, 245, 255, 0.85)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y, 12, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
  const t = (time % 1400) / 1400;
  ctx.globalAlpha = 0.6 * (1 - t); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y + 1, 13 + 9 * t, 5 + 3.5 * t, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** A rock or a tree: its pixel picture at 2x, with its foot on the tile's centre. */
function drawScenery(ctx: CanvasRenderingContext2D, img: Images, look: { key: string; ax: number; ay: number }, c: { x: number; y: number }) {
  const sprite = img[look.key] ?? img[look.key.startsWith("rock") ? "obj-rock" : "obj-tree"];
  if (!sprite) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(c.x - look.ax * 2), Math.round(c.y - look.ay * 2), sprite.width * 2, sprite.height * 2);
  ctx.restore();
}

/** Rocks, barrels and crates: pixel sprites drawn at 2x like the trees (tools/scenery-art.py, tools/prop-art.py). The
    crate is an isometric cube whose edges follow the tile diamond, so it looks the same at every camera angle; a
    damaged crate is cracked. Each sprite is placed so its base sits on the tile's centre. */
function drawProp(ctx: CanvasRenderingContext2D, img: Images, tile: Tile, c: { x: number; y: number }, mapId: string, p: Pos) {
  const prop = tile.prop!, hp = tile.propHp ?? 0;
  if (prop === "rock") { drawScenery(ctx, img, sceneryFor("rock", mapId, tile, p), c); return; }
  if (prop === "gate") { drawGate(ctx, c, false); return; }
  if (prop === "lever") {
    // CC0 lever (tools/lever-art.py): its mound's foot at sprite (7, 11), drawn at 3x so it reads at a glance.
    // Pulled, the stick leans the other way.
    const sprite = img[tile.link?.open ? "obj-lever-on" : "obj-lever"];
    if (!sprite) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(c.x - 7 * 3), Math.round(c.y + 4 - 11 * 3), sprite.width * 3, sprite.height * 3);
    ctx.restore();
    return;
  }
  const sprite = prop === "barrel" ? img["obj-barrel"] : img[hp < PROP_HP.crate ? "obj-crate-hurt" : "obj-crate"];
  if (!sprite) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Crate: base diamond centre at sprite (12, 16); barrel: base at (9, 15). Sprites are 1x, drawn at 2x.
  const [ax, ay] = prop === "barrel" ? [9, 15] : [12, 16];
  ctx.drawImage(sprite, Math.round(c.x - ax * 2), Math.round(c.y + 1 - ay * 2), sprite.width * 2, sprite.height * 2);
  ctx.restore();
}

/** A portcullis across the tile: two stone posts and iron bars between them. Open, only the posts stand, with the bars
    drawn up into a stub at the top, so the player can still see a gate is there and can close again. */
function drawGate(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, open: boolean) {
  const left = c.x - 22, right = c.x + 22, foot = c.y + 4, top = c.y - 34;
  ctx.save();
  // Posts.
  for (const x of [left, right]) {
    ctx.fillStyle = "#6f6a62"; ctx.fillRect(x - 4, top - 4, 8, foot - top + 4);
    ctx.fillStyle = "#9a948a"; ctx.fillRect(x - 4, top - 4, 3, foot - top + 4);
    ctx.fillStyle = "#3f3b36"; ctx.fillRect(x + 3, top - 4, 1, foot - top + 4);
  }
  // Lintel.
  ctx.fillStyle = "#5c5750"; ctx.fillRect(left - 4, top - 8, right - left + 8, 5);
  ctx.fillStyle = "#8a847a"; ctx.fillRect(left - 4, top - 8, right - left + 8, 2);
  const bottom = open ? top + 6 : foot;
  // Bars, then the cross bands.
  for (let x = left + 7; x <= right - 6; x += 6) {
    ctx.fillStyle = "#2e3036"; ctx.fillRect(x - 1, top - 3, 3, bottom - top + 3);
    ctx.fillStyle = "#8d939e"; ctx.fillRect(x - 1, top - 3, 1, bottom - top + 3);
    if (!open) { ctx.fillStyle = "#2e3036"; ctx.fillRect(x - 2, foot - 3, 5, 3); }
  }
  ctx.fillStyle = "#3a3d44";
  if (open) ctx.fillRect(left + 4, bottom - 2, right - left - 8, 3);
  else for (const y of [top + 8, top + 22]) { ctx.fillRect(left + 4, y, right - left - 8, 3); ctx.fillStyle = "#5d626c"; ctx.fillRect(left + 4, y, right - left - 8, 1); ctx.fillStyle = "#3a3d44"; }
  ctx.restore();
}
