import { describe, expect, it } from "vitest";
import { compareReducer } from "./compare";

describe("compareReducer", () => {
  it("stores the payload on SUCCESS", () => {
    const s = compareReducer(undefined as any, {
      type: "COMPARE_LOAD_SUCCESS",
      payload: { data: { a: { totals: { cost: 1 } }, b: { totals: { cost: 2 } }, delta: { cost: 1 } } },
    });
    expect(s.data?.delta.cost).toBe(1);
    expect(s.loading).toBe(false);
  });

  it("stores the error on ERROR", () => {
    const s = compareReducer(undefined as any, {
      type: "COMPARE_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(s.error).toContain("boom");
    expect(s.loading).toBe(false);
  });
});
