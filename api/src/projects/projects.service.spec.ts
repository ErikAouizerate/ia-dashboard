import { ProjectsService } from "./projects.service";

const readerMock = {
  listDirectories: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
  ]),
  aggregateByDirectory: jest.fn().mockReturnValue([
    {
      directory: "/home/user/gateway",
      name: "gateway",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
      firstSeen: 1000,
      lastSeen: 2000,
    },
  ]),
  aggregateByModel: jest.fn().mockReturnValue([
    {
      model: "deepseek-v4-flash",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
    },
  ]),
};

const mkChain = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    onConflictDoUpdate: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("ProjectsService", () => {
  it("syncProjects upserts directories and marks missing stale", async () => {
    const db = mkChain(
      [{ id: "p1", directory: "/home/user/gateway" }], // existing select
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    await svc.syncProjects();
    expect(db.insert).toHaveBeenCalled();
  });

  it("list returns projects with live aggregates", async () => {
    const projectRow = {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    };
    const db = mkChain(
      [projectRow], // syncProjects: existing select
      [], // syncProjects: upsert (awaited, ignored)
      [projectRow], // list select
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const rows = await svc.list();
    expect(rows[0].name).toBe("gateway");
    expect(rows[0].totalCost).toBe(5);
    expect(rows[0].sessionCount).toBe(2);
  });

  it("findOne returns features and proposals", async () => {
    const db = mkChain(
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/home/user/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
      ], // project
      [{ id: "f1", name: "Auth" }], // features
      [{ id: "pr1", name: "Auth", status: "pending", sessionIds: ["s1"] }], // proposals
      [{ sessionId: "s1" }], // featureSessions (linkedCount)
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const detail = await svc.findOne("p1");
    expect(detail.features).toEqual([{ id: "f1", name: "Auth" }]);
    expect(detail.proposals[0].status).toBe("pending");
    expect(detail.byModel[0].model).toBe("deepseek-v4-flash");
    expect(detail.ungroupedSessions).toBe(0); // 2 sessions - 1 linked - 1 proposed = 0
  });
});