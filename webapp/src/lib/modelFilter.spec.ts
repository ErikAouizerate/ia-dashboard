import { describe, expect, it } from "vitest";
import { filterHiddenModels } from "./modelFilter";
import type { DashboardSummary } from "../store/dashboard";

const summary: DashboardSummary = {
  periodDays: 7,
  totalCost: 30,
  tokensInput: 1500,
  tokensOutput: 1500,
  sessionCount: 3,
  byProject: [
    {
      id: "p1",
      name: "gateway",
      totalCost: 30,
      sessions: 3,
      tokensInput: 1500,
      tokensOutput: 1500,
      models: [
        { model: "a", totalCost: 20, tokensInput: 1000, tokensOutput: 1000, sessions: 2, share: 0.66 },
        { model: "b", totalCost: 10, tokensInput: 500, tokensOutput: 500, sessions: 1, share: 0.33 },
      ],
    },
  ],
  byModel: [
    { model: "a", totalCost: 20, sessions: 2, tokensInput: 1000, tokensOutput: 1000 },
    { model: "b", totalCost: 10, sessions: 1, tokensInput: 500, tokensOutput: 500 },
  ],
  byConfig: [
    {
      configId: "c1",
      configIds: ["c1"],
      profile: null,
      plugins: [],
      skills: [],
      sessions: 3,
      totalCost: 30,
      tokensInput: 1500,
      tokensOutput: 1500,
      stats: {
        cost: { count: 3, median: 10, p25: 10, p75: 20, min: 0, max: 20, mean: 10 },
        tokensOutput: { count: 3, median: 500, p25: 500, p75: 1000, min: 0, max: 1000, mean: 500 },
        durationMs: { count: 3, median: 1000, p25: 1000, p75: 1000, min: 1000, max: 1000, mean: 1000 },
      },
      models: [
        { model: "a", sessions: 2, totalCost: 20, tokensInput: 1000, tokensOutput: 1000 },
        { model: "b", sessions: 1, totalCost: 10, tokensInput: 500, tokensOutput: 500 },
      ],
    },
  ],
  byDay: [{ day: "2026-08-27", totalCost: 30, sessions: 3 }],
  timeByProject: [{ directory: "/p/gateway", name: "gateway", durationMs: 1000, id: "p1" }],
};

describe("filterHiddenModels", () => {
  it("returns the summary untouched when nothing is hidden", () => {
    expect(filterHiddenModels(summary, new Set())).toBe(summary);
  });

  it("removes the hidden model from models, projects, configs and recalcs totals", () => {
    const out = filterHiddenModels(summary, new Set(["b"]));
    expect(out.byModel.map((m) => m.model)).toEqual(["a"]);
    expect(out.byProject[0].models.map((m) => m.model)).toEqual(["a"]);
    expect(out.byProject[0].totalCost).toBe(20);
    expect(out.byProject[0].sessions).toBe(2);
    expect(out.byConfig[0].models.map((m) => m.model)).toEqual(["a"]);
    expect(out.byConfig[0].totalCost).toBe(20);
    expect(out.totalCost).toBe(20);
    expect(out.tokensInput).toBe(1000);
    expect(out.sessionCount).toBe(2);
  });

  it("drops projects and configs left with no visible model", () => {
    const out = filterHiddenModels(summary, new Set(["a", "b"]));
    expect(out.byProject).toEqual([]);
    expect(out.byConfig).toEqual([]);
    expect(out.byModel).toEqual([]);
    expect(out.totalCost).toBe(0);
    expect(out.sessionCount).toBe(0);
  });
});
