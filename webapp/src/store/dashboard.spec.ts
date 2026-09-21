import { describe, expect, it } from "vitest";
import { dashboardReducer } from "./dashboard";

describe("dashboard reducer", () => {
  it("stores summary on success", () => {
    const state = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_SUCCESS",
      payload: { data: { totalCost: 10 } },
    });
    expect(state.summary?.totalCost).toBe(10);
    expect(state.loading).toBe(false);
  });

  it("sets loading on request", () => {
    const state = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_REQUESTED",
      payload: { periodDays: 30 },
    });
    expect(state.loading).toBe(true);
    expect(state.periodDays).toBe(30);
  });

  it("stores the error and stops loading on ERROR", () => {
    const state = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(state.error).toContain("boom");
    expect(state.loading).toBe(false);
  });

  it("defaults to the all-time period", () => {
    const state = dashboardReducer(undefined as any, { type: "@@INIT" });
    expect(state.periodDays).toBe(0);
  });

  it("updates periodDays when switching back to the all-time period", () => {
    const requested = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_REQUESTED",
      payload: { periodDays: 30 },
    });
    expect(requested.periodDays).toBe(30);
    const allTime = dashboardReducer(requested, {
      type: "DASHBOARD_LOAD_REQUESTED",
      payload: { periodDays: 0 },
    });
    expect(allTime.periodDays).toBe(0);
    expect(allTime.loading).toBe(true);
  });
});