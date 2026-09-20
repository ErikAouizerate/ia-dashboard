export function offeredDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    onlyA: [...sa].filter((t) => !sb.has(t)).sort(),
    onlyB: [...sb].filter((t) => !sa.has(t)).sort(),
  };
}
