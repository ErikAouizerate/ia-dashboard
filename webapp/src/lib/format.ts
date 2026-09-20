export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function avgCostPerMillion(cost: number, tokens: number): number {
  return tokens > 0 ? (cost / tokens) * 1_000_000 : 0;
}