import { describe, expect, it } from "vitest";
import { summarizeConfig } from "./configSummary";

describe("summarizeConfig", () => {
  it("returns nothing for a non-object config", () => {
    expect(summarizeConfig(null)).toEqual([]);
    expect(summarizeConfig("nope")).toEqual([]);
  });

  it("extracts model, smallModel and counts agents/mcp/plugins/skills", () => {
    const rows = summarizeConfig({
      model: "deepseek-v4-flash",
      smallModel: "deepseek-v4-mini",
      agents: { build: {}, plan: {} },
      mcp: [{ name: "a" }],
      plugins: ["p1", "p2"],
      skills: { s1: {} },
    });
    expect(rows).toEqual([
      { label: "Modèle", value: "deepseek-v4-flash" },
      { label: "Petit modèle", value: "deepseek-v4-mini" },
      { label: "Agents", value: "2" },
      { label: "MCP", value: "1" },
      { label: "Plugins", value: "2" },
      { label: "Skills", value: "1" },
    ]);
  });

  it("falls back to the modelID / small_model keys", () => {
    expect(summarizeConfig({ modelID: "m-id", small_model: "s-id" })).toEqual([
      { label: "Modèle", value: "m-id" },
      { label: "Petit modèle", value: "s-id" },
    ]);
  });

  it("omits empty sections", () => {
    expect(summarizeConfig({ model: "m" })).toEqual([{ label: "Modèle", value: "m" }]);
  });
});
