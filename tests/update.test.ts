/* M4 phone app: when the running build counts as out of date. */
import { describe, expect, it } from "vitest";
import { isNewer } from "../src/app/update";

describe("build updates", () => {
  it("a different published build is newer; the same one, a missing one or a dev build is not", () => {
    expect(isNewer("202611220440", "202611230900-abc1234")).toBe(true);
    expect(isNewer("202611220440", "202611220440")).toBe(false);
    expect(isNewer("202611220440", undefined)).toBe(false);
    expect(isNewer("dev", "202611220440")).toBe(false);
  });
});
