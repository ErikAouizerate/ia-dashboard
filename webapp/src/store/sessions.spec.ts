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

  it("exposes the initial state shape", () => {
    expect(sessionsReducer(undefined as any, { type: "INIT" })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      filters: {},
      meta: { projects: [], models: [], sources: [], configs: [] },
      loading: false,
      error: null,
    });
  });

  it("keeps the current pageSize when a later SUCCESS omits it", () => {
    const first = sessionsReducer(undefined as any, {
      type: "SESSIONS_LOAD_SUCCESS",
      payload: { data: { items: [], total: 0, page: 1, pageSize: 25 } },
    });
    const second = sessionsReducer(first, {
      type: "SESSIONS_LOAD_SUCCESS",
      payload: { data: { items: [], total: 0, page: 2 } },
    });
    expect(second.pageSize).toBe(25);
    expect(second.page).toBe(2);
  });

  it("stores meta on META_LOAD_SUCCESS", () => {
    const meta = {
      projects: [{ id: "nominal:x", name: "x" }],
      models: ["m"],
      sources: ["host"],
      configs: [{ configId: "c", profile: "p" }],
    };
    const s = sessionsReducer(undefined as any, {
      type: "META_LOAD_SUCCESS",
      payload: { data: meta },
    });
    expect(s.meta).toEqual(meta);
  });
});