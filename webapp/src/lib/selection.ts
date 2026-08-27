export type SelectionEntry = { id: string; annotated: boolean };
export type Selection = Map<string, boolean>;

export function setSelection(
  sel: ReadonlyMap<string, boolean>,
  entry: SelectionEntry,
  checked: boolean,
): Map<string, boolean> {
  const next = new Map(sel);
  if (checked) next.set(entry.id, entry.annotated);
  else next.delete(entry.id);
  return next;
}

export function toggleVisibleSelection(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): Map<string, boolean> {
  const all = allVisibleSelected(sel, rows);
  const next = new Map(sel);
  if (all) {
    for (const r of rows) next.delete(r.id);
  } else {
    for (const r of rows) next.set(r.id, r.annotated);
  }
  return next;
}

export function allVisibleSelected(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): boolean {
  return rows.length > 0 && rows.every((r) => sel.has(r.id));
}

export function someVisibleSelected(
  sel: ReadonlyMap<string, boolean>,
  rows: SelectionEntry[],
): boolean {
  return rows.some((r) => sel.has(r.id));
}

export function computeBulkEligibility(sel: ReadonlyMap<string, boolean>): {
  eligible: string[];
  skipped: number;
} {
  const eligible: string[] = [];
  let skipped = 0;
  for (const [id, annotated] of sel) {
    if (annotated) skipped++;
    else eligible.push(id);
  }
  return { eligible, skipped };
}