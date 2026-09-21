import { describe, expect, it } from "vitest";
import { buildModelColorMap, modelColorAt } from "./modelColors";

describe("modelColorAt", () => {
  it("returns distinct colors for the first 20 indices", () => {
    const colors = new Set(Array.from({ length: 20 }, (_, i) => modelColorAt(i)));
    expect(colors.size).toBe(20);
  });
});

describe("buildModelColorMap", () => {
  const projects = [
    {
      models: [{ model: "deepseek-v4-flash" }, { model: "claude-sonnet" }],
    },
    {
      models: [{ model: "deepseek-v4-flash" }, { model: "gpt-4o" }],
    },
  ];

  it("maps the same model to the same color across projects", () => {
    const colorOf = buildModelColorMap(projects);
    expect(colorOf("deepseek-v4-flash")).toBe(colorOf("deepseek-v4-flash"));
    expect(colorOf("claude-sonnet")).toBe(colorOf("claude-sonnet"));
  });

  it("maps different models to different colors", () => {
    const colorOf = buildModelColorMap(projects);
    const colors = new Set([
      colorOf("deepseek-v4-flash"),
      colorOf("claude-sonnet"),
      colorOf("gpt-4o"),
    ]);
    expect(colors.size).toBe(3);
  });

  it("is deterministic across calls", () => {
    const a = buildModelColorMap(projects);
    const b = buildModelColorMap(projects);
    expect(a("deepseek-v4-flash")).toBe(b("deepseek-v4-flash"));
    expect(a("claude-sonnet")).toBe(b("claude-sonnet"));
  });

  it("falls back to the first color for unknown models", () => {
    const colorOf = buildModelColorMap([]);
    expect(colorOf("unknown")).toBe(modelColorAt(0));
  });
});
