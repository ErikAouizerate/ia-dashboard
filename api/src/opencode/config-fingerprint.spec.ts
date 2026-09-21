import { configFingerprint, normalizeConfig } from "./config-fingerprint";

const base = {
  model: "m",
  mcp: [
    { name: "zeta", enabled: true },
    { name: "alpha", enabled: true },
  ],
  plugins: ["a", "b", "c"],
  skills: ["x", "y"],
};

test("fingerprint ignores plugin, mcp and skill order", () => {
  const reordered = {
    ...base,
    plugins: ["c", "a", "b"],
    mcp: [
      { name: "alpha", enabled: true },
      { name: "zeta", enabled: true },
    ],
    skills: ["y", "x"],
  };
  expect(configFingerprint(base)).toBe(configFingerprint(reordered));
});

test("fingerprint changes when content changes", () => {
  expect(configFingerprint(base)).not.toBe(
    configFingerprint({ ...base, plugins: ["a", "b", "d"] }),
  );
});

test("fingerprint is null for non-objects", () => {
  expect(configFingerprint(null)).toBeNull();
  expect(configFingerprint("m")).toBeNull();
});

test("normalizeConfig sorts order-bearing arrays", () => {
  const n = normalizeConfig(base) as Record<string, unknown>;
  expect(n.plugins).toEqual(["a", "b", "c"]);
  expect(n.skills).toEqual(["x", "y"]);
  expect((n.mcp as { name: string }[]).map((m) => m.name)).toEqual(["alpha", "zeta"]);
});

test("normalizeConfig fully sorts mcp with at least three entries whatever the order", () => {
  const n = normalizeConfig({
    model: "m",
    mcp: [
      { name: "zeta", enabled: true },
      { name: "mu", enabled: false },
      { name: "alpha", enabled: true },
    ],
  }) as Record<string, unknown>;
  expect((n.mcp as { name: string }[]).map((m) => m.name)).toEqual(["alpha", "mu", "zeta"]);
});

test("fingerprint is order-insensitive with at least three plugins, mcp and skills", () => {
  const many = {
    model: "m",
    plugins: ["c", "a", "b", "d"],
    mcp: [
      { name: "zeta", enabled: true },
      { name: "mu", enabled: false },
      { name: "alpha", enabled: true },
    ],
    skills: ["y", "x", "z"],
  };
  const reordered = {
    model: "m",
    plugins: ["d", "b", "a", "c"],
    mcp: [
      { name: "alpha", enabled: true },
      { name: "zeta", enabled: true },
      { name: "mu", enabled: false },
    ],
    skills: ["z", "y", "x"],
  };
  expect(configFingerprint(many)).toBe(configFingerprint(reordered));
});
