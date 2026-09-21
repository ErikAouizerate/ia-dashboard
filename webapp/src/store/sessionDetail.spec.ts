import { describe, expect, it } from "vitest";
import { sessionDetailReducer } from "./sessionDetail";

describe("sessionDetailReducer", () => {
  it("clears data and sets loading on SESSION_DETAIL_LOAD_REQUESTED", () => {
    const previous = {
      data: { session: { id: "s1" } } as any,
      loading: false,
      error: "stale",
    };
    const s = sessionDetailReducer(previous, { type: "SESSION_DETAIL_LOAD_REQUESTED" });
    expect(s.data).toBeNull();
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it("stores data on SESSION_DETAIL_LOAD_SUCCESS", () => {
    const s = sessionDetailReducer(undefined as any, {
      type: "SESSION_DETAIL_LOAD_SUCCESS",
      payload: { data: { session: { id: "s1" }, totals: { cost: 2 } } },
    });
    expect(s.data?.session.id).toBe("s1");
    expect(s.loading).toBe(false);
  });

  it("stores the error on SESSION_DETAIL_LOAD_ERROR", () => {
    const s = sessionDetailReducer(undefined as any, {
      type: "SESSION_DETAIL_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(s.error).toContain("boom");
    expect(s.loading).toBe(false);
  });
});
