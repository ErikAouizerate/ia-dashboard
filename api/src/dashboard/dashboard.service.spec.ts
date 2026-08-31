import { DashboardService } from "./dashboard.service";

const readerMock = {
  aggregateAll: jest.fn().mockReturnValue({
    totalCost: 10,
    tokensInput: 20,
    tokensOutput: 30,
    sessions: 4,
  }),
  aggregateByDirectory: jest.fn().mockReturnValue([
    { directory: "/p/gateway", name: "gateway", totalCost: 10, sessions: 2 },
  ]),
  aggregateByModel: jest.fn().mockReturnValue([
    { model: "deepseek-v4-flash", totalCost: 10 },
  ]),
  aggregateByDay: jest.fn().mockReturnValue([
    { day: "2026-08-27", totalCost: 10 },
  ]),
  aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
    {
      directory: "/p/gateway",
      model: "deepseek-v4-flash",
      totalCost: 6,
      tokensInput: 5,
      tokensOutput: 5,
      sessions: 1,
    },
    {
      directory: "/p/gateway",
      model: "claude-sonnet",
      totalCost: 4,
      tokensInput: 3,
      tokensOutput: 3,
      sessions: 1,
    },
  ]),
  timeByDirectory: jest.fn().mockReturnValue([
    { directory: "/p/gateway", durationMs: 3600000 },
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
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/p/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
      ], // projects (full rows)
    );
    const svc = new DashboardService(readerMock as any, db as any);
    const out = await svc.summary(7);
    expect(out.totalCost).toBe(10);
    expect(out.sessionCount).toBe(4);
    expect(out.analysedCount).toBe(3);
    expect(out.featureCount).toBe(5);
    expect(out.byProject[0].name).toBe("gateway");
    expect(out.byProject[0].id).toBe("p1");
    expect(out.byProject[0].models).toEqual([
      {
        model: "deepseek-v4-flash",
        totalCost: 6,
        tokensInput: 5,
        tokensOutput: 5,
        sessions: 1,
        share: 0.5,
      },
      {
        model: "claude-sonnet",
        totalCost: 4,
        tokensInput: 3,
        tokensOutput: 3,
        sessions: 1,
        share: 0.5,
      },
    ]);
    expect(out.timeByProject).toEqual([
      { directory: "/p/gateway", name: "gateway", durationMs: 3600000, id: "p1" },
    ]);
  });

  it("summary groups versioned projects under the nominal name", async () => {
    const readerMock2 = {
      ...readerMock,
      aggregateByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/gateway", name: "gateway", totalCost: 10, sessions: 2 },
        { directory: "/p/gateway_v2", name: "gateway_v2", totalCost: 5, sessions: 1 },
      ]),
      aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
        {
          directory: "/p/gateway",
          model: "deepseek-v4-flash",
          totalCost: 6,
          tokensInput: 5,
          tokensOutput: 5,
          sessions: 1,
        },
        {
          directory: "/p/gateway_v2",
          model: "deepseek-v4-flash",
          totalCost: 5,
          tokensInput: 4,
          tokensOutput: 4,
          sessions: 1,
        },
      ]),
      timeByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/gateway", durationMs: 3600000 },
        { directory: "/p/gateway_v2", durationMs: 1800000 },
      ]),
    };
    const db = mkDb(
      [{ c: 0 }],
      [{ c: 0 }],
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/p/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
        {
          id: "p2",
          name: "gateway_v2",
          directory: "/p/gateway_v2",
          stale: false,
          firstSeen: new Date(1500),
          lastSeen: new Date(2500),
        },
      ],
    );
    const svc = new DashboardService(readerMock2 as any, db as any);
    const out = await svc.summary(7);
    expect(out.byProject).toHaveLength(1);
    expect(out.byProject[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/p/gateway",
      totalCost: 15,
      sessions: 3,
    });
    expect(out.byProject[0].models).toEqual([
      {
        model: "deepseek-v4-flash",
        totalCost: 11,
        tokensInput: 9,
        tokensOutput: 9,
        sessions: 2,
        share: 2 / 3,
      },
    ]);
    expect(out.timeByProject).toEqual([
      { directory: "/p/gateway", name: "gateway", durationMs: 5400000, id: "nominal:gateway" },
    ]);
  });

  it("summary keeps unsynced directories visible via the fallback", async () => {
    const readerMock3 = {
      ...readerMock,
      aggregateByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/unsynced", name: "unsynced", totalCost: 2, sessions: 1 },
      ]),
      aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
        {
          directory: "/p/unsynced",
          model: "deepseek-v4-flash",
          totalCost: 2,
          tokensInput: 1,
          tokensOutput: 1,
          sessions: 1,
        },
      ]),
      timeByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/unsynced", durationMs: 60000 },
      ]),
    };
    const db = mkDb(
      [{ c: 0 }],
      [{ c: 0 }],
      [], // projects : aucun répertoire synchronisé
    );
    const svc = new DashboardService(readerMock3 as any, db as any);
    const out = await svc.summary(7);
    expect(out.byProject).toHaveLength(1);
    expect(out.byProject[0]).toMatchObject({
      id: "nominal:unsynced",
      name: "unsynced",
      directory: "/p/unsynced",
      totalCost: 2,
      sessions: 1,
    });
    expect(out.byProject[0].models).toEqual([
      {
        model: "deepseek-v4-flash",
        totalCost: 2,
        tokensInput: 1,
        tokensOutput: 1,
        sessions: 1,
        share: 1,
      },
    ]);
    expect(out.timeByProject).toEqual([
      { directory: "/p/unsynced", name: "unsynced", durationMs: 60000, id: "nominal:unsynced" },
    ]);
  });
});