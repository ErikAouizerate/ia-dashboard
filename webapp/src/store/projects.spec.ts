import { describe, expect, it } from "vitest";
import { projectsReducer } from "./projects";

describe("projectsReducer", () => {
  it("sets loading and clears the error on PROJECTS_LOAD_REQUESTED", () => {
    const previous = {
      ...(projectsReducer(undefined as any, { type: "INIT" })),
      error: "stale",
    };
    const s = projectsReducer(previous, { type: "PROJECTS_LOAD_REQUESTED" });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it("sets loading and clears the error on PROJECT_LOAD_REQUESTED", () => {
    const previous = {
      ...(projectsReducer(undefined as any, { type: "INIT" })),
      error: "stale",
    };
    const s = projectsReducer(previous, { type: "PROJECT_LOAD_REQUESTED" });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it("stores items on PROJECTS_LOAD_SUCCESS", () => {
    const s = projectsReducer(undefined as any, {
      type: "PROJECTS_LOAD_SUCCESS",
      payload: { data: [{ id: "p1", name: "gateway" }] },
    });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].name).toBe("gateway");
    expect(s.loading).toBe(false);
  });

  it("stores current on PROJECT_LOAD_SUCCESS", () => {
    const s = projectsReducer(undefined as any, {
      type: "PROJECT_LOAD_SUCCESS",
      payload: { data: { id: "p1", name: "gateway" } },
    });
    expect(s.current?.id).toBe("p1");
    expect(s.loading).toBe(false);
  });

  it("stores the error on PROJECTS_LOAD_ERROR and PROJECT_LOAD_ERROR", () => {
    const list = projectsReducer(undefined as any, {
      type: "PROJECTS_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(list.error).toContain("boom");
    expect(list.loading).toBe(false);

    const detail = projectsReducer(undefined as any, {
      type: "PROJECT_LOAD_ERROR",
      payload: { error: new Error("bang") },
    });
    expect(detail.error).toContain("bang");
    expect(detail.loading).toBe(false);
  });
});
