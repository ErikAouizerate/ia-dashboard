import { createHash } from "node:crypto";

// Mirror of the capture plugin's canonical(): object keys sorted, arrays in order.
// Kept local because the plugin lives outside this repo.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(obj[k]))
      .join(",") +
    "}"
  );
}

// Plugin order (and mcp insertion order) is not part of a config's identity, but the
// raw capture hash preserves it, so reordering plugins produced distinct configIds.
// Normalize order-bearing arrays before hashing to merge those duplicates.
export function normalizeConfig(config: unknown): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const c = { ...(config as Record<string, unknown>) };
  if (Array.isArray(c.plugins)) c.plugins = [...(c.plugins as unknown[])].sort();
  if (Array.isArray(c.skills)) c.skills = [...(c.skills as unknown[])].sort();
  if (Array.isArray(c.mcp)) {
    c.mcp = [...(c.mcp as Record<string, unknown>[])].sort((a, b) =>
      String(a?.name ?? "") < String(b?.name ?? "") ? -1 : 1,
    );
  }
  return c;
}

export function configFingerprint(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  return createHash("sha1").update(canonical(normalizeConfig(config))).digest("hex");
}
