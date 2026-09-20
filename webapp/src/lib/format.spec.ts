import { describe, expect, it } from "vitest";
import { avgCostPerMillion, formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats sub-hour durations in minutes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(30000)).toBe("1m");
    expect(formatDuration(3599999)).toBe("1h");
  });
  it("formats hour durations", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(5400000)).toBe("1h 30m");
    expect(formatDuration(7200000)).toBe("2h");
  });
});

describe("avgCostPerMillion", () => {
  it("returns the cost per million tokens", () => {
    expect(avgCostPerMillion(2, 1_000_000)).toBe(2);
    expect(avgCostPerMillion(1, 500_000)).toBe(2);
  });
  it("returns 0 when there are no tokens", () => {
    expect(avgCostPerMillion(5, 0)).toBe(0);
  });
});