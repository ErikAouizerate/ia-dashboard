import { describe, expect, it } from "vitest";
import { EXCLUDED_PROJECT_NAMES, isExcludedProject } from "./excludedProjects";

describe("excludedProjects", () => {
  it("contains the initial exclusion list", () => {
    expect(EXCLUDED_PROJECT_NAMES).toEqual([
      "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
      "vps-setup",
      "test-oral",
      "tmp",
    ]);
  });

  it("isExcludedProject matches listed names and rejects others", () => {
    expect(isExcludedProject("vps-setup")).toBe(true);
    expect(isExcludedProject("test-oral")).toBe(true);
    expect(isExcludedProject("tmp")).toBe(true);
    expect(
      isExcludedProject(
        "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
      ),
    ).toBe(true);
    expect(isExcludedProject("gateway")).toBe(false);
    expect(isExcludedProject("infrastructure_v2")).toBe(false);
  });
});