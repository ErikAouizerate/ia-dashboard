import { describe, expect, it } from "vitest";
import {
  allVisibleSelected,
  computeBulkEligibility,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "./selection";

describe("selection", () => {
  it("setSelection adds an entry with its annotated flag and removes it when unchecked", () => {
    const added = setSelection(new Map(), { id: "s1", annotated: false }, true);
    expect(added.get("s1")).toBe(false);
    const removed = setSelection(added, { id: "s1", annotated: false }, false);
    expect(removed.has("s1")).toBe(false);
  });

  it("computeBulkEligibility excludes annotated sessions and counts them as skipped", () => {
    const sel = new Map<string, boolean>([
      ["s1", false],
      ["s2", false],
      ["s3", true],
    ]);
    expect(computeBulkEligibility(sel)).toEqual({ eligible: ["s1", "s2"], skipped: 1 });
  });

  it("allVisibleSelected / someVisibleSelected reflect the visible rows", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const partial = new Map<string, boolean>([["s1", false]]);
    expect(allVisibleSelected(partial, rows)).toBe(false);
    expect(someVisibleSelected(partial, rows)).toBe(true);
    const full = new Map<string, boolean>([
      ["s1", false],
      ["s2", true],
    ]);
    expect(allVisibleSelected(full, rows)).toBe(true);
  });

  it("toggleVisibleSelection selects all visible rows or clears them", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const selected = toggleVisibleSelection(new Map(), rows);
    expect(selected.get("s1")).toBe(false);
    expect(selected.get("s2")).toBe(true);
    const cleared = toggleVisibleSelection(selected, rows);
    expect(cleared.size).toBe(0);
  });

  it("clearing visible rows preserves off-page selection (union persists across pages)", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const allVisiblePlusOffPage = new Map<string, boolean>([
      ["s1", false],
      ["s2", true],
      ["s9", false],
    ]);
    const cleared = toggleVisibleSelection(allVisiblePlusOffPage, rows);
    expect(cleared.has("s1")).toBe(false);
    expect(cleared.has("s2")).toBe(false);
    expect(cleared.get("s9")).toBe(false);
  });

  it("toggleVisibleSelection adds missing visible rows when some are already selected", () => {
    const rows = [
      { id: "s1", annotated: false },
      { id: "s2", annotated: true },
    ];
    const some = new Map<string, boolean>([["s2", true]]);
    const next = toggleVisibleSelection(some, rows);
    expect(next.get("s1")).toBe(false);
    expect(next.get("s2")).toBe(true);
  });
});