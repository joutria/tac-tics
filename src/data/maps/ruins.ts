/* The ruined square of the first region's town: dirt streets, rubble (rock), raised floors of broken houses
   and an old fountain. Same format as meadow.ts. */
import { parseMap } from "../../engine/grid";

export const RUINS = parseMap("ruins", [
  "g1 g1 d0 d0 d0 g0o g0 r1 g2 g2",
  "g1 r1 d0 g0 d0 d0o g0B g1 g2 g2",
  "d0 d0 d0 g0 g0 d0 d0 g1 g1 r2",
  "d0 g0 g0 w0 w0 g0 d0s d0 d0 d0",
  "r0 g0 g0 w0 w0 g0C g0S r0 g0 d0",
  "d0 d0 g0C g0 g0 g0 g0 g0 g0 d0",
  "g1 d0 d0 d0 r0 d0 d0C d0 g0 g0",
  "g2 g1 g0 d0 h0 h0 t0 d0 g1B g1",
  "g2 r2 g0 d0 g0 g0 g0 d0 g1 g2",
  "t1 g2 g1 d0 d0 d0 d0 d0 g1 g2",
]);
