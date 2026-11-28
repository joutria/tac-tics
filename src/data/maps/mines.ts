/* The Sap Mines' maps (region 3). Same format as meadow.ts. Mostly bare rock floor (d), Sap crystals where the
   other regions have trees (t), flooded shafts (w) and plank bridges (b). The miners left their machinery behind:
   gates and drawbridges worked by levers (see grid.ts parseMap: L lever, G/O gate, D/U drawbridge). */
import { parseMap } from "../../engine/grid";

/** The mine mouth: a gallery cut in two by a flooded shaft. One plank bridge stays down; the drawbridge to the
    east is raised, and its lever is on the party's side. */
export const MINESHAFT = parseMap("mineshaft", [
  "d2 d2 r2 d2 d1 d1 d1 d2 t2 d2",
  "d2 t2 d2 d2 d1 d1 d1C d2 d2 d2",
  "d1 d1 d1 d1 d1 d1 d1 d1B d1 d1",
  "d0 d0 d0 r0 d0 d0 d0 d0 d0 d0",
  "w0 w0 b0 w0 w0 w0 w0 w0D1 w0 w0",
  "w0 w0 b0 w0 w0 w0 w0 w0D1 w0 w0",
  "d0 d0 d0 d0 d0 r0 d0 d0 d0 d0",
  "d0 d0C d0 d0 d0 d0 d0 d0L1 d0 t0",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "t0 d0 d0 r0 d0 d0 d0 d0 d0 t0",
]);

/** The old smelter: a rock wall splits the hall, with two iron gates through it (one shut, one open; the lever
    swaps them) and a long way round over the low end of the wall. Oil from the furnaces pools at the back. */
export const FORGE = parseMap("forge", [
  "d1 d1 d1o d1o d1 d1 d1o d1o d1 d1",
  "d1 d1B d1 d1 d1 d1 d1 d1 d1C d1",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "d0 r0 d0 d0 d0B d0 d0 d0 r0 d0",
  "d1 d3 d3 d0G1 d3 d3 d0O1 d3 d3 d3",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "d0 d0C d0 d0 d0 d0 d0 t0 d0 d0",
  "d0 d0 d0 d0 d0 t0 d0 d0 d0 d0",
  "d1 d0 d0 d0 d0 d0 d0 d0L1 d0 d1",
  "d1 d1 d0 d0 d0 d0 d0 d0 d1 d1",
]);

/** The Sap's source, deep under the mountain: Sap wells up round a dais where the forge's guardian burns. Two
    drawbridges cross the flooded channel; the lever by the party can raise them both. */
export const HEART = parseMap("heart", [
  "t2 d2 d2 d2 d2 d2 d2 d2 d2 t2",
  "d2 d2 d2 d2 d2 d2 d2 d2 d2 d2",
  "d1 d1 d1o d1 d1 d1 d1 d1o d1 d1",
  "d1 t1 d1 d1 d1s d1s d1 d1 t1 d1",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "d0 d0B d0 d0s d0S d0s d0 d0 d0C d0",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "w0 w0 b0U1 w0 w0 w0 w0 b0U1 w0 w0",
  "d0 d0 d0 d0 d0 d0 d0 d0 d0L1 d0",
  "t0 d0 d0 d0 d0 d0 d0 d0 d0 t0",
]);
