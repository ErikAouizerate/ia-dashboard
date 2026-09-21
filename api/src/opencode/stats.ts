export interface Stat {
  count: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  mean: number;
}

const EMPTY: Stat = { count: 0, median: 0, p25: 0, p75: 0, min: 0, max: 0, mean: 0 };

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stat(values: number[]): Stat {
  if (values.length === 0) return { ...EMPTY };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}
