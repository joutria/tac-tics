/* Draws the battle in an isometric (diagonal) view on a canvas, and turns a click back into a tile.
   Grid +x runs down-right on screen and +y down-left; each height level lifts a tile by 16 px.
   The view can be turned in 90 degree steps so nothing stays hidden behind a hill or a tree. */
import { GridMap, Pos, tileAt } from "../engine/grid";
import type { BattleState, Facing, Unit } from "../engine/state";

export const TW = 64, TH = 32, LEVEL = 16;

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

/** Screen position (unscaled) of the centre of a tile's top, for a real grid position. */
export function tileCenter(m: GridMap, p: Pos, rot: number): { x: number; y: number } {
  const h = tileAt(m, p)?.h ?? 0;
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

/** What a tap or click at a point means. Units win over ground, because their sprites stand up over the tiles
    behind them; then the tile whose top face is under the point; then, for a finger landing on a cliff side or
    between tiles, the nearest tile top within `slack` tile-widths. */
export function pickAt(m: GridMap, units: readonly Unit[], px: number, py: number, rot: number, slack = 0): Pos | null {
  let best: { p: Pos; depth: number } | null = null;
  for (const u of units) {
    if (u.life === "dead") continue;
    const c = tileCenter(m, u.pos, rot);
    if (Math.abs(px - c.x) > 18 || py < c.y - 58 || py > c.y + 10) continue;
    const r = rotate(m, u.pos, rot), depth = r.x + r.y;
    if (!best || depth > best.depth) best = { p: u.pos, depth };
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

export type Mark = "move" | "range" | "target" | "area" | "chosen";
export interface Floater { pos: Pos; text: string; color: string; born: number }

/** A unit on its way somewhere. The rules already put it at the end; this only draws the trip.
    walk = step by step with a hop on height changes; slide = pushed in a straight line; blink = vanish and reappear. */
export interface Motion { points: Pos[]; born: number; stepMs: number; kind: "walk" | "slide" | "blink" }

export const motionMs = (mo: Motion) => (mo.points.length - 1) * mo.stepMs;

const facingOf = (a: Pos, b: Pos): Facing => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "E" : "W") : dy >= 0 ? "S" : "N";
};

/** Where to draw a unit right now: the screen point, the tile it is painted with (so it sorts in front of the
    tiles it passes) and the way it faces. */
function placeOf(m: GridMap, u: Unit, mo: Motion | undefined, time: number, rot: number) {
  const still = { c: tileCenter(m, u.pos, rot), slot: u.pos, facing: u.facing, alpha: 1 };
  if (!mo || mo.points.length < 2) return still;
  const e = (time - mo.born) / mo.stepMs, last = mo.points.length - 1;
  if (e >= last) return still;
  if (e < 0) return { ...still, c: tileCenter(m, mo.points[0]!, rot), slot: mo.points[0]! };
  if (mo.kind === "blink") {
    const at = e < 0.5 ? mo.points[0]! : mo.points[last]!;
    return { c: tileCenter(m, at, rot), slot: at, facing: u.facing, alpha: Math.abs(1 - 2 * e) };
  }
  const i = Math.floor(e), f = e - i, a = mo.points[i]!, b = mo.points[i + 1]!;
  const ca = tileCenter(m, a, rot), cb = tileCenter(m, b, rot);
  const dh = Math.abs((tileAt(m, a)?.h ?? 0) - (tileAt(m, b)?.h ?? 0));
  const lift = mo.kind === "walk" ? Math.sin(Math.PI * f) * (dh ? 10 + 6 * dh : 3) : 0;
  const ra = rotate(m, a, rot), rb = rotate(m, b, rot);
  const slot = rb.x + rb.y >= ra.x + ra.y ? b : a;
  return {
    c: { x: ca.x + (cb.x - ca.x) * f, y: ca.y + (cb.y - ca.y) * f - lift },
    slot, facing: mo.kind === "walk" ? facingOf(a, b) : u.facing, alpha: 1,
  };
}

export interface DrawOptions {
  marks: Map<string, Mark>;
  hover: Pos | null;
  active: string | null;
  time: number;
  floaters: Floater[];
  motions?: Map<string, Motion>;
}

const FACING_FRAME = { S: { col: 0, flip: false }, N: { col: 2, flip: false }, E: { col: 4, flip: false }, W: { col: 4, flip: true } } as const;
const SHEET_ROW: Record<string, number> = { lumo: 1 };
const MARK_STYLE: Record<Mark, [string, string]> = {
  move: ["rgba(70, 150, 255, 0.5)", "rgba(200, 230, 255, 1)"],
  range: ["rgba(255, 120, 100, 0.24)", "rgba(255, 170, 150, 0.6)"],
  target: ["rgba(255, 90, 70, 0.45)", "rgba(255, 210, 200, 0.95)"],
  area: ["rgba(255, 170, 60, 0.5)", "rgba(255, 230, 160, 1)"],
  chosen: ["rgba(255, 216, 107, 0.6)", "rgba(255, 255, 255, 1)"],
};

export function drawBattle(ctx: CanvasRenderingContext2D, s: BattleState, img: Images, view: View, opt: DrawOptions) {
  const m = s.map, d = dims(m, view.rot);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  const places = s.units.filter((v) => v.life !== "dead").map((v) => ({ u: v, ...placeOf(m, v, opt.motions?.get(v.id), opt.time, view.rot) }));
  // Painter's order: back diagonals first; on each tile its ground, then what stands on it.
  for (let k = 0; k <= d.w + d.h - 2; k++) {
    for (let x = 0; x <= k; x++) {
      if (x >= d.w || k - x >= d.h) continue;
      const p = unrotate(m, { x, y: k - x }, view.rot);
      const tile = tileAt(m, p);
      if (!tile) continue;
      const c = tileCenter(m, p, view.rot);
      for (let lvl = tile.h; lvl >= 0; lvl--) {
        ctx.drawImage(img["side-left"]!, c.x - TW / 2, c.y + lvl * LEVEL);
        ctx.drawImage(img["side-right"]!, c.x, c.y + lvl * LEVEL);
      }
      ctx.drawImage(img[`top-${tile.terrain}`]!, c.x - TW / 2, c.y - TH / 2);
      const mark = opt.marks.get(`${p.x},${p.y}`);
      if (mark) diamond(ctx, c.x, c.y, ...MARK_STYLE[mark], mark === "chosen" ? 2.5 : 1);
      if (opt.hover && opt.hover.x === p.x && opt.hover.y === p.y) diamond(ctx, c.x, c.y, "rgba(255, 255, 255, 0.2)", "#fff");
      if (tile.terrain === "rock") ctx.drawImage(img["obj-rock"]!, c.x - 18, c.y - 30, 36, 36);
      if (tile.terrain === "tree") {
        // See-through when someone stands right behind it, so trees never hide a unit.
        const behind = [[-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => {
          const q = unrotate(m, { x: x + dx!, y: k - x + dy! }, view.rot);
          return places.some((v) => v.slot.x === q.x && v.slot.y === q.y);
        });
        ctx.globalAlpha = behind ? 0.45 : 1;
        ctx.drawImage(img["obj-tree"]!, c.x - 32, c.y - 56, 64, 64);
        ctx.globalAlpha = 1;
      }
      for (const pl of places) {
        if (pl.slot.x !== p.x || pl.slot.y !== p.y) continue;
        ctx.globalAlpha = pl.alpha;
        drawUnit(ctx, { ...pl.u, facing: pl.facing }, img, pl.c, pl.u.id === opt.active, opt.time, view.rot);
        ctx.globalAlpha = 1;
      }
    }
  }
  for (const f of opt.floaters) {
    const age = (opt.time - f.born) / 1000;
    if (age < 0 || age > 1.4) continue;
    const c = tileCenter(m, f.pos, view.rot);
    ctx.globalAlpha = Math.max(0, 1 - age / 1.4);
    ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(f.text, c.x, c.y - 70 - age * 24);
    ctx.fillStyle = f.color; ctx.fillText(f.text, c.x, c.y - 70 - age * 24);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, stroke: string, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y - TH / 2); ctx.lineTo(x + TW / 2, y); ctx.lineTo(x, y + TH / 2); ctx.lineTo(x - TW / 2, y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, img: Images, c: { x: number; y: number }, active: boolean, time: number, rot: number) {
  const sheet = img[`unit-${u.look}`];
  const team = u.team === "heroes" ? "#ffe680" : "#ff8a7a";
  const base = ctx.globalAlpha; // lets a blinking unit fade as a whole
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = team; ctx.lineWidth = active ? 2.5 : 1;
  ctx.globalAlpha = base * (active ? 1 : 0.6);
  ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 20, 9, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = base;
  if (!sheet) return;
  const downed = u.life === "downed";
  const f = FACING_FRAME[rotFacing(u.facing, rot)];
  const frame = downed ? 9 : f.col + (Math.floor(time / 450) % 2); // column 9 is the asleep pose
  const row = Math.min(SHEET_ROW[u.look] ?? 0, sheet.height / 64 - 1);
  ctx.save();
  ctx.translate(c.x, c.y + 6);
  if (f.flip && !downed) ctx.scale(-1, 1);
  if (downed) ctx.globalAlpha = base * 0.6;
  ctx.drawImage(sheet, frame * 64, row * 64, 64, 64, -32, -64, 64, 64);
  ctx.restore();
  // Health bar over the head; downed units show the turns they have left.
  const w = 30, ratio = u.hp / u.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(c.x - w / 2 - 1, c.y - 62, w + 2, 5);
  ctx.fillStyle = u.team === "heroes" ? "#7ed957" : "#e85a4f"; ctx.fillRect(c.x - w / 2, c.y - 61, w * ratio, 3);
  if (downed) {
    ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    ctx.strokeText(`✚ ${u.downedTurns}`, c.x, c.y - 66); ctx.fillText(`✚ ${u.downedTurns}`, c.x, c.y - 66);
  }
  if (u.rooted) {
    ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("🌿", c.x + 20, c.y - 56);
  }
}
