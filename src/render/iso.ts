/* Draws the battle in an isometric (diagonal) view on a canvas, and turns a click back into a tile.
   Grid +x runs down-right on screen and +y down-left; each height level lifts a tile by 16 px. */
import { GridMap, Pos, tileAt } from "../engine/grid";
import type { BattleState, Unit } from "../engine/state";

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

export interface View { ox: number; oy: number; scale: number }

/** Map size in unscaled pixels, with room above for tall objects and raised tiles. */
export function mapPixelSize(m: GridMap) {
  return { w: (m.w + m.h) * (TW / 2), h: (m.w + m.h) * (TH / 2) + 4 * LEVEL + 48 };
}

/** Screen position (unscaled) of the centre of a tile's top. */
export function tileCenter(m: GridMap, p: Pos): { x: number; y: number } {
  const h = tileAt(m, p)?.h ?? 0;
  return { x: (p.x - p.y) * (TW / 2) + m.h * (TW / 2), y: (p.x + p.y) * (TH / 2) - h * LEVEL + 3 * LEVEL + 48 };
}

/** Which tile is under a point (unscaled map pixels); front tiles win, so raised ground is picked correctly. */
export function pickTile(m: GridMap, px: number, py: number): Pos | null {
  for (let d = m.w + m.h - 2; d >= 0; d--) {
    for (let x = Math.min(d, m.w - 1); x >= 0 && d - x < m.h; x--) {
      const p = { x, y: d - x };
      const c = tileCenter(m, p);
      if (Math.abs(px - c.x) / (TW / 2) + Math.abs(py - c.y) / (TH / 2) <= 1) return p;
    }
  }
  return null;
}

export interface DrawOptions {
  highlight: Set<string>;
  hover: Pos | null;
  active: string | null;
  time: number;
}

const FACING_FRAME = { S: { col: 0, flip: false }, N: { col: 2, flip: false }, E: { col: 4, flip: false }, W: { col: 4, flip: true } } as const;
const SHEET_ROW: Record<string, number> = { lumo: 1 };

export function drawBattle(ctx: CanvasRenderingContext2D, s: BattleState, img: Images, view: View, opt: DrawOptions) {
  const m = s.map;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  // Painter's order: back diagonals first; on each tile its ground, then what stands on it.
  for (let d = 0; d <= m.w + m.h - 2; d++) {
    for (let x = 0; x <= d; x++) {
      const p = { x, y: d - x };
      const tile = tileAt(m, p);
      if (!tile) continue;
      const c = tileCenter(m, p);
      for (let k = tile.h; k >= 0; k--) {
        ctx.drawImage(img["side-left"]!, c.x - TW / 2, c.y + k * LEVEL);
        ctx.drawImage(img["side-right"]!, c.x, c.y + k * LEVEL);
      }
      ctx.drawImage(img[`top-${tile.terrain}`]!, c.x - TW / 2, c.y - TH / 2);
      const key = `${p.x},${p.y}`;
      if (opt.highlight.has(key)) diamond(ctx, c.x, c.y, "rgba(120, 200, 255, 0.45)", "rgba(220, 245, 255, 0.9)");
      if (opt.hover && opt.hover.x === p.x && opt.hover.y === p.y) diamond(ctx, c.x, c.y, "rgba(255, 255, 255, 0.25)", "#fff");
      if (tile.terrain === "rock") ctx.drawImage(img["obj-rock"]!, c.x - 18, c.y - 30, 36, 36);
      if (tile.terrain === "tree") ctx.drawImage(img["obj-tree"]!, c.x - 32, c.y - 56, 64, 64);
      const u = s.units.find((v) => v.hp > 0 && v.pos.x === p.x && v.pos.y === p.y);
      if (u) drawUnit(ctx, u, img, c, u.id === opt.active, opt.time);
    }
  }
  ctx.restore();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, stroke: string) {
  ctx.beginPath();
  ctx.moveTo(x, y - TH / 2); ctx.lineTo(x + TW / 2, y); ctx.lineTo(x, y + TH / 2); ctx.lineTo(x - TW / 2, y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}

function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, img: Images, c: { x: number; y: number }, active: boolean, time: number) {
  const sheet = img[`unit-${u.look}`];
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (active) {
    ctx.strokeStyle = u.team === "heroes" ? "#ffe680" : "#ff8a7a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 20, 9, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (!sheet) return;
  const f = FACING_FRAME[u.facing];
  const frame = f.col + (Math.floor(time / 450) % 2);
  const row = Math.min(SHEET_ROW[u.look] ?? 0, sheet.height / 64 - 1);
  ctx.save();
  ctx.translate(c.x, c.y + 6);
  if (f.flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, frame * 64, row * 64, 64, 64, -32, -64, 64, 64);
  ctx.restore();
  // Health bar over the head.
  const w = 30, ratio = u.hp / u.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(c.x - w / 2 - 1, c.y - 62, w + 2, 5);
  ctx.fillStyle = u.team === "heroes" ? "#7ed957" : "#e85a4f"; ctx.fillRect(c.x - w / 2, c.y - 61, w * ratio, 3);
}
