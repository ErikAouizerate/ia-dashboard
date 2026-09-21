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
