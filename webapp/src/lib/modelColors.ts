export const MODEL_COLORS = [
  "bg-blue-500",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-violet-500",
  "bg-rose-400",
  "bg-cyan-500",
  "bg-orange-400",
  "bg-teal-400",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-red-500",
  "bg-indigo-400",
  "bg-pink-400",
  "bg-green-500",
  "bg-yellow-500",
];

export function buildModelColorMap(
  projects: { models: { model: string }[] }[],
): (model: string) => string {
  const map = new Map<string, string>();
  for (const p of projects) {
    for (const m of p.models) {
      if (!map.has(m.model)) {
        map.set(m.model, MODEL_COLORS[map.size % MODEL_COLORS.length]);
      }
    }
  }
  return (model) => map.get(model) ?? MODEL_COLORS[0];
}