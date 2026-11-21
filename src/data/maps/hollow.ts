/* The Sap Hollow: the sunken cellar under the town's old mill, where the region's boss has swollen into a giant.
   Same format as meadow.ts. The giant (2x2) starts on the dirt floor at the top; a line of crates stands in its way
   (it crushes them), tall grass it will trample, raised ledges along both sides to fight from, and a barrel and oil
   by its side to turn against it. */
import { parseMap } from "../../engine/grid";

export const HOLLOW = parseMap("hollow", [
  "r1 d1 d1 t1 d1 d1 t1 d1 d1 r1",
  "d1 d1B d0 d0 d0 d0 d0 d0 d1C d1",
  "d1 d1 d0o d0 d0 d0 d0 d0o d1 d1",
  "g1 g1 g0 g0C g0 g0 g0C g0 g1 g1",
  "g1 h1 g0 g0 g0 g0 g0 g0 h1 g1",
  "g0 g0 h0 g0 g0C g0 g0 h0 g0 g0",
  "g0 g0 g0 g0 h0 h0 g0 g0 g0 g0",
  "g0 t0 g0 g0 g0 g0 g0 g0 t0 g0",
  "g0 g0 g0 g0 g0 g0 g0 g0 g0 g0",
  "g0 g0 r0 g0 g0 g0 g0 g0 r0 g0",
]);
