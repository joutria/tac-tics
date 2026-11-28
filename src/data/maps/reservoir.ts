/* The Broken Reservoir's maps (region 2). Same format as meadow.ts: terrain + height, then B barrel or C crate.
   i is ice (frozen water, walkable until it thaws), b a wooden bridge over the water (it burns). */
import { parseMap } from "../../engine/grid";

/** The frozen shore: a channel of water and ice crossed by a long bridge, the dam's concrete to the north-east. */
export const SHORE = parseMap("shore", [
  "g0 g0 g1 g1 d1 d1 d1 r1 d1 d1",
  "g0 t0 g0 g1 d1 d1 d1 d1 d1C d1o",
  "g0 g0 g0 g0 g0 g0 g0 d1 d1o d1B",
  "d0 g0 w0 w0 i0 w0 w0 g0 d0 d0",
  "d0 g0 w0 b0 b0 b0 w0 g0 g0 d0",
  "g0 g0 w0 w0 i0 w0 w0 g0 d0 d0",
  "g0 g0 h0 h0 g0 g0 g0 g0 g0 r0",
  "g0 g0C g0 g0 g0 g0 g0 g0B g0 g0",
  "g1 g0 g0 r0 g0 g0 t0 g0 g0 g1",
  "g1 g1 g0 g0 g0 g0 g0 g0 g1 g1",
]);

/** Below the cracked dam: a spillway pond with two bridges up to the dam's ledge. The east one is a drawbridge,
    lowered, worked by a lever on the bank: raise it to cut the way, lower it to open it again. */
export const SPILLWAY = parseMap("spillway", [
  "d1 d1 d1 d1 r1 d1 d1 d1 d1 d1",
  "d1 d1B d1o d1 d1 d1 d1C d1 d1 d1",
  "d0o d0 d0 d0 d0 d0 d0 d0 d0 d0",
  "g0 w0 w0 d0 w0 w0 d0 w0 w0 g0",
  "g0 i0 w0 b0 w0 w0 b0U1 w0 i0 g0",
  "g0 w0 w0 b0 w0 w0 b0U1 w0 w0 g0",
  "g0 g0 w0 b0 i0 i0 b0U1 w0 g0 g0",
  "g0 g0 g0 g0 g0C g0 g0 g0L1 g0B g0",
  "g1 t0 h0 h0 h0 g0 r0 g0 g0 g1",
  "g1 g0 g0 g0 g0 g0 g0 g0 t0 g1",
]);
