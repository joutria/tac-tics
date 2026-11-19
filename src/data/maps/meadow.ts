/* Test map for M0 and M1: a meadow with a raised hill, a pond, rocks and trees.
   Two characters per tile: terrain (g grass, d dirt, w water, r rock, t tree) + height 0 to 3, then B for a barrel or C for a crate. */
import { parseMap } from "../../engine/grid";

export const MEADOW = parseMap("meadow", [
  "t0 g0 g0 g0 g0 g1 g1 g2 g2 t2",
  "g0 g0 d0 g0 g0 g1 g2 g3 g2 g2",
  "g0 g0 d0 g0 r0 g1 g2 g2B g2 g1",
  "g0 w0 d0 d0 d0 d0 g1 g1 g1 g1",
  "w0 w0 g0 g0 g0 d0 g0C r1 g1 g0",
  "w0 w0 g0 t0 g0 d0 g0 g0 g0B g0",
  "g0 g0 g0 g0 g0C d0 d0 d0 g0 g0",
  "g1 g1 g0 r0 g0 g0 g0 d0 g0 t0",
  "g2 g1 g0 g0 g0 g0 g0 d0 w0 w0",
  "t2 g2 g1 g0 g0 t0 g0 d0 w0 w0",
]);
