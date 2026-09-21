import { describe, expect, it } from "vitest";
import { MODEL_COLORS, buildModelColorMap } from "./modelColors";

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

  it("maps different models to different colors within the palette", () => {
    const colorOf = buildModelColorMap(projects);
    const colors = new Set([colorOf("deepseek-v4-flash"), colorOf("claude-sonnet"), colorOf("gpt-4o")]);
    expect(colors.size).toBe(3);
    expect(MODEL_COLORS).toContain(colorOf("deepseek-v4-flash"));
  });

  it("is deterministic across calls", () => {
    const a = buildModelColorMap(projects);
    const b = buildModelColorMap(projects);
    expect(a("deepseek-v4-flash")).toBe(b("deepseek-v4-flash"));
    expect(a("claude-sonnet")).toBe(b("claude-sonnet"));
  });

  it("falls back to the first color for unknown models", () => {
    const colorOf = buildModelColorMap([]);
    expect(colorOf("unknown")).toBe(MODEL_COLORS[0]);
  });

  it("gives every model in the palette a distinct color", () => {
    const models = MODEL_COLORS.map((_, i) => ({ model: `model-${i}` }));
    const colorOf = buildModelColorMap([{ models }]);
    const colors = new Set(models.map((m) => colorOf(m.model)));
    expect(colors.size).toBe(MODEL_COLORS.length);
  });
});