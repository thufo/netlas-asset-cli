import { describe, expect, it } from "vitest";
import { compareVersions } from "../src/desktop/update-service";

describe("compareVersions", () => {
  it("compares release versions", () => {
    expect(compareVersions("0.3.1", "0.3.0")).toBe(1);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.2.9", "0.3.0")).toBe(-1);
  });
});
