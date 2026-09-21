import { stat } from "./stats";

test("stat returns zeros for an empty list", () => {
  expect(stat([])).toEqual({
    count: 0,
    median: 0,
    p25: 0,
    p75: 0,
    min: 0,
    max: 0,
    mean: 0,
  });
});

test("stat computes median, quartiles and range (odd count)", () => {
  expect(stat([1, 2, 3, 4, 5])).toEqual({
    count: 5,
    median: 3,
    p25: 2,
    p75: 4,
    min: 1,
    max: 5,
    mean: 3,
  });
});

test("stat interpolates quartiles (even count)", () => {
  const s = stat([0.02, 0.03, 0.04, 0.1]);
  expect(s.median).toBeCloseTo(0.035);
  expect(s.p25).toBeCloseTo(0.0275);
  expect(s.p75).toBeCloseTo(0.055);
  expect(s.min).toBe(0.02);
  expect(s.max).toBe(0.1);
  expect(s.mean).toBeCloseTo(0.0475);
});
