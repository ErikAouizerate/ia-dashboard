export function summarizeConfig(config: unknown): { label: string; value: string }[] {
  if (!config || typeof config !== "object") return [];
  const c = config as Record<string, unknown>;
  const out: { label: string; value: string }[] = [];
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : null);
  const model = str("model") ?? str("modelID");
  if (model) out.push({ label: "Modèle", value: model });
  const small = str("smallModel") ?? str("small_model");
  if (small) out.push({ label: "Petit modèle", value: small });
  const groups: [string, string][] = [
    ["agents", "Agents"],
    ["mcp", "MCP"],
    ["plugins", "Plugins"],
    ["skills", "Skills"],
  ];
  for (const [key, label] of groups) {
    const v = c[key];
    if (Array.isArray(v) && v.length > 0) out.push({ label, value: String(v.length) });
    else if (v && typeof v === "object" && Object.keys(v).length > 0)
      out.push({ label, value: String(Object.keys(v).length) });
  }
  return out;
}
