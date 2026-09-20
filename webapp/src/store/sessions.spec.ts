import { describe, expect, it } from "vitest";
import { sessionsReducer } from "./sessions";

describe("sessionsReducer", () => {
  it("stores items and total on SUCCESS", () => {
    const s = sessionsReducer(undefined as any, {
      type: "SESSIONS_LOAD_SUCCESS",
      payload: { data: { items: [{ id: "s1" }], total: 1 } },
    });
    expect(s.items).toHaveLength(1);
    expect(s.total).toBe(1);
    expect(s.loading).toBe(false);
  });

  it("clears the error on REQUESTED and stores filters", () => {
    const s = sessionsReducer(
      { ...(sessionsReducer(undefined as any, { type: "INIT" }) as any), error: "x" },
      {
        type: "SESSIONS_LOAD_REQUESTED",
        payload: { filters: { project: "gateway" } },
      },
    );
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
    expect(s.filters.project).toBe("gateway");
  });

  it("stores pagination info on SUCCESS", () => {
    const s = sessionsReducer(undefined as any, {
      type: "SESSIONS_LOAD_SUCCESS",
      payload: { data: { items: [], total: 120, page: 2, pageSize: 50 } },
    });
    expect(s.page).toBe(2);
    expect(s.pageSize).toBe(50);
    expect(s.total).toBe(120);
  });

  it("changes page on SESSIONS_PAGE_SET", () => {
    const s = sessionsReducer(undefined as any, {
      type: "SESSIONS_PAGE_SET",
      payload: { page: 3 },
    });
    expect(s.page).toBe(3);
  });

  it("stores the error on ERROR", () => {
    const s = sessionsReducer(undefined as any, {
      type: "SESSIONS_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(s.error).toContain("boom");
    expect(s.loading).toBe(false);
  });
});