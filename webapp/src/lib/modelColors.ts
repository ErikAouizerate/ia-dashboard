export function modelColorAt(index: number): string {
  return `hsl(${(index * 137.508) % 360} 65% 55%)`;
}

export function buildModelColorMap(
  projects: { models: { model: string }[] }[],
): (model: string) => string {
  const map = new Map<string, string>();
  for (const p of projects) {
    for (const m of p.models) {
      if (!map.has(m.model)) {
        map.set(m.model, modelColorAt(map.size));
      }
    }
  }
  return (model) => map.get(model) ?? modelColorAt(0);
}
