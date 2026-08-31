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
});