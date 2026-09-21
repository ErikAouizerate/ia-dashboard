import { describe, expect, it } from "vitest";
import { filterModels } from "./modelFilter";

const summary: any = {
  periodDays: 7,
  totalCost: 30,
  tokensInput: 300,
  tokensOutput: 600,
  sessionCount: 5,
  byProject: [
    {
      id: "p1",
      name: "gateway",
      totalCost: 30,
      sessions: 2,
      tokensInput: 300,
      tokensOutput: 600,
      models: [
        { model: "a", totalCost: 20, tokensInput: 200, tokensOutput: 400, sessions: 1, share: 0.66 },
        { model: "b", totalCost: 10, tokensInput: 100, tokensOutput: 200, sessions: 1, share: 0.33 },
      ],
    },
  ],
  byModel: [
    { model: "a", totalCost: 20, sessions: 3, tokensInput: 200, tokensOutput: 400 },
    { model: "b", totalCost: 10, sessions: 2, tokensInput: 100, tokensOutput: 200 },
  ],
  byConfig: [
    {
      configId: "c1",
      profile: null,
      sessions: 2,
      totalCost: 30,
      tokensInput: 300,
      tokensOutput: 600,
      models: [
        { model: "a", sessions: 1, totalCost: 20, tokensInput: 200, tokensOutput: 400 },
        { model: "b", sessions: 1, totalCost: 10, tokensInput: 100, tokensOutput: 200 },
      ],
    },
  ],
  byDay: [{ day: "2026-08-27", totalCost: 30, sessions: 5 }],
  timeByProject: [],
};

describe("filterModels", () => {
  it("returns everything when nothing is hidden", () => {
    const v = filterModels(summary, new Set());
    expect(v.totalCost).toBe(30);
    expect(v.byModel).toHaveLength(2);
    expect(v.byProject[0].totalCost).toBe(30);
  });

  it("recomputes totals and drops hidden models everywhere", () => {
    const v = filterModels(summary, new Set(["b"]));
    expect(v.totalCost).toBe(20);
    expect(v.tokensInput).toBe(200);
    expect(v.byModel.map((m) => m.model)).toEqual(["a"]);
    expect(v.byProject[0].totalCost).toBe(20);
    expect(v.byProject[0].models.map((m) => m.model)).toEqual(["a"]);
    expect(v.byProject[0].models[0].share).toBe(1);
    expect(v.byConfig[0].totalCost).toBe(20);
    expect(v.byConfig[0].models.map((m) => m.model)).toEqual(["a"]);
  });

  it("removes projects and configs with no visible model", () => {
    const v = filterModels(summary, new Set(["a", "b"]));
    expect(v.totalCost).toBe(0);
    expect(v.byModel).toHaveLength(0);
    expect(v.byProject).toHaveLength(0);
    expect(v.byConfig).toHaveLength(0);
  });
});
