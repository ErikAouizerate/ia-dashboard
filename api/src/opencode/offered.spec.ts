import { offeredDiff } from "./offered";

test("offeredDiff returns the symmetric difference, sorted", () => {
  expect(offeredDiff(["bash", "read"], ["bash", "edit"])).toEqual({
    onlyA: ["read"],
    onlyB: ["edit"],
  });
  expect(offeredDiff([], ["x"])).toEqual({ onlyA: [], onlyB: ["x"] });
});

test("offeredDiff sorts both sides for unordered multi-element inputs", () => {
  expect(offeredDiff(["read", "bash", "grep"], ["edit", "bash", "write"])).toEqual({
    onlyA: ["grep", "read"],
    onlyB: ["edit", "write"],
  });
});
