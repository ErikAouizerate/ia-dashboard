import { DashboardService } from "./dashboard.service";

const readerMock = {
  aggregateAll: jest.fn().mockReturnValue({
    totalCost: 10,
    tokensInput: 20,
    tokensOutput: 30,
    sessions: 4,
  }),
  aggregateByDirectory: jest.fn().mockReturnValue([
    { directory: "/p/gateway", name: "gateway", totalCost: 10 },
  ]),
  aggregateByModel: jest.fn().mockReturnValue([
    { model: "deepseek-v4-flash", totalCost: 10 },
  ]),
  aggregateByDay: jest.fn().mockReturnValue([
    { day: "2026-08-27", totalCost: 10 },
  ]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
  };
  return { select: jest.fn(() => chain) };
};

describe("DashboardService", () => {
  it("summary aggregates live metrics plus analysed/feature counts", async () => {
    const db = mkDb(
      [{ c: 3 }], // analysed count
      [{ c: 5 }], // feature count
      [{ id: "p1", directory: "/p/gateway" }], // projects id-by-directory
    );
    const svc = new DashboardService(readerMock as any, db as any);
    const out = await svc.summary(7);
    expect(out.totalCost).toBe(10);
    expect(out.sessionCount).toBe(4);
    expect(out.analysedCount).toBe(3);
    expect(out.featureCount).toBe(5);
    expect(out.byProject[0].name).toBe("gateway");
    expect(out.byProject[0].id).toBe("p1");
  });
});