import { offeredDiff } from "./offered";

test("offeredDiff returns the symmetric difference, sorted", () => {
  expect(offeredDiff(["bash", "read"], ["bash", "edit"])).toEqual({
    onlyA: ["read"],
    onlyB: ["edit"],
  });
  expect(offeredDiff([], ["x"])).toEqual({ onlyA: [], onlyB: ["x"] });
});
