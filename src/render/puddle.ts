// Puddles of oil and sap as pixel art, drawn at 2x like the rest of the board.
//
// The shape is the autotiled puddle from the oil fire work: in each tile a rounded blob, joined to the edge
// towards every neighbour with the same liquid on the same level, and the corner filled where all three tiles
// round it have it (like marching squares). The shape lives in the tile's own grid square, so neighbours meet
// seamlessly at every camera angle. Here it is sampled at the art's real pixels (32 x 16 per tile at 1x, every
// pixel centre belongs to exactly one tile), which gives hard pixel edges, a one pixel rim and flat shading.

export type Liquid = "oil" | "sap";

/** `has(du, dv)`: does the tile du, dv steps along the (rotated) grid hold the same liquid on the same level? */
export type Neighbours = (du: number, dv: number) => boolean;

const W = 32, H = 16; // one tile's diamond at 1x
const M = 1;          // margin round the box for the edge ring

type Palette = { rim: string; body: string; deep: string; shine: string };
const PALETTE: Record<Liquid, Palette[]> = {
  // Oil: black and glossy, a violet rim catching the light.
  oil: [{ rim: "#8f78c4", body: "#1a1524", deep: "#0e0b15", shine: "#352a4c" }],
  // Sap: a sickly green ooze; two palettes so it slowly pulses.
  sap: [
    { rim: "#c6f070", body: "#6ea82c", deep: "#4a7c1e", shine: "#94cc48" },
    { rim: "#d6f88a", body: "#78b434", deep: "#548a22", shine: "#a2d856" },
  ],
};

/** Where a grid point (u, v) falls inside the puddle piece of the tile at grid offset (i, j), in that tile's own
    0..1 square. Mirrors the vector version: a rounded square, bridges to same-liquid neighbours, filled corners. */
function inPiece(has: Neighbours, i: number, j: number, u: number, v: number): boolean {
  if (!has(i, j)) return false;
  const E = has(i + 1, j), Wt = has(i - 1, j), S = has(i, j + 1), N = has(i, j - 1);
  const a = 0.17, b = 0.83, mid = 0.5, r = 0.3;
  const dx = Math.max(a + r - u, 0, u - (b - r)), dy = Math.max(a + r - v, 0, v - (b - r));
  if (u >= a && u <= b && v >= a && v <= b && dx * dx + dy * dy <= r * r) return true;
  const across = (t: number) => t >= a && t <= b;
  if (E && u >= mid && across(v)) return true;
  if (Wt && u <= mid && across(v)) return true;
  if (S && v >= mid && across(u)) return true;
  if (N && v <= mid && across(u)) return true;
  if (E && S && has(i + 1, j + 1) && u >= mid && v >= mid) return true;
  if (E && N && has(i + 1, j - 1) && u >= mid && v <= mid) return true;
  if (Wt && S && has(i - 1, j + 1) && u <= mid && v >= mid) return true;
  if (Wt && N && has(i - 1, j - 1) && u <= mid && v <= mid) return true;
  return false;
}

/** Inside the whole puddle, at a pixel of this tile's 32 x 16 box (it may fall in a neighbouring tile). */
function insideAt(has: Neighbours, px: number, py: number): boolean {
  const X = px + 0.5 - W / 2, Y = py + 0.5;
  const U = (Y / (H / 2) + X / (W / 2)) / 2, V = (Y / (H / 2) - X / (W / 2)) / 2;
  const i = Math.floor(U), j = Math.floor(V);
  return inPiece(has, i, j, U - i, V - j);
}

/** Whether the pixel's centre lies in this tile's own diamond, or in a one pixel ring round it: the neighbour's
    ground art spills a pixel over the edge, so each tile repaints the shared edge (both sides compute the same
    colours, so the overlap is invisible). */
function ownPixel(px: number, py: number): boolean {
  const X = px + 0.5 - W / 2, Y = py + 0.5;
  const U = (Y / (H / 2) + X / (W / 2)) / 2, V = (Y / (H / 2) - X / (W / 2)) / 2;
  const ring = 1.5 / W;
  return U >= -ring && U < 1 + ring && V >= -ring && V < 1 + ring;
}

type Piece = { canvas: HTMLCanvasElement; body: Uint8Array }; // body: 1 where a pixel is liquid inside the rim
const cache = new Map<string, Piece>();

function piece(kind: Liquid, has: Neighbours, pal: number): Piece {
  let key = `${kind}${pal}:`;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) key += has(i, j) ? "1" : "0";
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = W + 2 * M; canvas.height = H + 2 * M;
  const ctx = canvas.getContext("2d")!;
  const body = new Uint8Array(W * H);
  const p = PALETTE[kind][pal]!;
  const inside = (x: number, y: number) => insideAt(has, x, y);
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    if (!ownPixel(x, y) || !inside(x, y)) continue;
    const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
    let c = p.body;
    if (edge) c = p.rim;
    else if (!inside(x, y - 2) || !inside(x - 2, y)) c = p.deep;   // the bank shades the far edge
    else if (!inside(x, y + 2)) c = p.shine;                        // the near edge catches the light
    else if (x >= 0 && y >= 0 && x < W && y < H) body[y * W + x] = 1;
    ctx.fillStyle = c; ctx.fillRect(x + M, y + M, 1, 1);
  }
  const out = { canvas, body };
  cache.set(key, out);
  return out;
}

/** Draws one tile's part of a puddle, centred on the tile at `c` (screen px, the board is drawn at 2x). */
export function drawPuddle(ctx: CanvasRenderingContext2D, kind: Liquid, c: { x: number; y: number }, time: number, seed: number, has: Neighbours) {
  const pals = PALETTE[kind].length;
  const pal = pals > 1 ? Math.floor(time / 700) % pals : 0; // the whole puddle pulses together, so no seams
  const pc = piece(kind, has, pal);
  const x0 = Math.round(c.x - W), y0 = Math.round(c.y - H);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pc.canvas, x0 - 2 * M, y0 - 2 * M, (W + 2 * M) * 2, (H + 2 * M) * 2);
  // Animated details, one art pixel (2 screen px) at a time and only on open liquid.
  const dot = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !pc.body[y * W + x]) return;
    ctx.fillStyle = col; ctx.fillRect(x0 + x * 2, y0 + y * 2, 2, 2);
  };
  let r = (seed * 9301 + 49297) % 233280;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  if (kind === "oil") {
    // Rainbow sheen: a short streak or two that slide a pixel back and forth, and now and then a white glint.
    const cols = ["#4f78b0", "#8a58b0", "#a88c4c"];
    const streaks = 1 + (seed % 2);
    for (let s = 0; s < streaks; s++) {
      const sx = 9 + Math.floor(rnd() * 12), sy = 5 + Math.floor(rnd() * 6), len = 2 + Math.floor(rnd() * 2);
      const shift = Math.round(Math.sin(time / 650 + seed + s * 2.1) * 1.5);
      for (let k = 0; k < len; k++) dot(sx + shift + k, sy, cols[(s + seed) % 3]!);
    }
    if ((Math.floor(time / 1600) + seed) % 5 === 0) dot(12 + (seed % 6), 6 + (seed % 3), "#e8e4f4");
  } else {
    // Bubbles that swell and pop, each on its own clock.
    for (let s = 0; s < 2; s++) {
      const bx = 10 + Math.floor(rnd() * 11), by = 5 + Math.floor(rnd() * 6);
      const phase = Math.floor(time / 260 + rnd() * 12) % 12;
      if (phase === 0 || phase === 1) dot(bx, by, "#dcff96");
      else if (phase === 2 || phase === 3) { dot(bx, by - 1, "#dcff96"); dot(bx - 1, by, "#dcff96"); dot(bx + 1, by, "#dcff96"); dot(bx, by + 1, "#4a7c1e"); }
      else if (phase === 4) { dot(bx - 1, by - 1, "#f0ffc8"); dot(bx + 1, by - 1, "#f0ffc8"); dot(bx - 1, by + 1, "#f0ffc8"); dot(bx + 1, by + 1, "#f0ffc8"); }
    }
  }
  ctx.restore();
}
