import { ProjectsService } from "./projects.service";

const readerMock = {
  listDirectories: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
    { directory: "/home/user/gateway_v2", firstSeen: 1500, lastSeen: 2500 },
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
    {
      directory: "/home/user/gateway_v2",
      name: "gateway_v2",
      totalCost: 3,
      tokensInput: 6,
      tokensOutput: 12,
      sessions: 1,
      firstSeen: 1500,
      lastSeen: 2500,
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
  timeByDirectory: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", durationMs: 7200000 },
    { directory: "/home/user/gateway_v2", durationMs: 1800000 },
  ]),
  aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
    {
      directory: "/home/user/gateway",
      model: "deepseek-v4-flash",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
    },
    {
      directory: "/home/user/gateway_v2",
      model: "deepseek-v4-flash",
      totalCost: 3,
      tokensInput: 6,
      tokensOutput: 12,
      sessions: 1,
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
      [], // syncProjects: upsert gateway
      [], // syncProjects: upsert gateway_v2
      [projectRow], // list select
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const rows = await svc.list();
    expect(rows[0].name).toBe("gateway");
    expect(rows[0].totalCost).toBe(5);
    expect(rows[0].sessionCount).toBe(2);
    expect(rows[0].durationMs).toBe(7200000);
    expect(rows[0].bySource).toEqual([]);
  });

  it("list groups versioned directories under the nominal name", async () => {
    const gateway = {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    };
    const gatewayV2 = {
      id: "p2",
      name: "gateway_v2",
      directory: "/home/user/gateway_v2",
      stale: false,
      firstSeen: new Date(1500),
      lastSeen: new Date(2500),
    };
    const db = mkChain(
      [], // syncProjects: existing select
      [], // syncProjects: upsert gateway
      [], // syncProjects: upsert gateway_v2
      [gateway, gatewayV2], // list select
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const rows = await svc.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("nominal:gateway");
    expect(rows[0].name).toBe("gateway");
    expect(rows[0].directory).toBe("/home/user/gateway");
    expect(rows[0].directories).toEqual([
      "/home/user/gateway",
      "/home/user/gateway_v2",
    ]);
    expect(rows[0].sessionCount).toBe(3);
    expect(rows[0].totalCost).toBe(8);
    expect(rows[0].durationMs).toBe(9000000);
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
    expect(detail.byModel).toEqual([
      { model: "deepseek-v4-flash", totalCost: 5, sessions: 2 },
    ]);
    expect(detail.ungroupedSessions).toBe(0); // 2 sessions - 1 linked - 1 proposed = 0
  });

  it("findOne resolves a synthetic id and merges members", async () => {
    const rows = [
      {
        id: "p1",
        name: "gateway",
        directory: "/home/user/gateway",
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
      {
        id: "p2",
        name: "gateway_v2",
        directory: "/home/user/gateway_v2",
        stale: false,
        firstSeen: new Date(1500),
        lastSeen: new Date(2500),
      },
    ];
    const db = mkChain(
      rows, // resolveGroup select-all
      [{ id: "f1", name: "Auth" }, { id: "f2", name: "Deploy" }], // features (inArray both ids)
      [{ id: "pr1", name: "Auth", status: "pending", sessionIds: ["s1"] }], // proposals
      [{ sessionId: "s1" }], // featureSessions (linkedCount)
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const detail = await svc.findOne("nominal:gateway");
    expect(detail.id).toBe("nominal:gateway");
    expect(detail.name).toBe("gateway");
    expect(detail.directories).toEqual(["/home/user/gateway", "/home/user/gateway_v2"]);
    expect(detail.features.map((f: any) => f.id)).toEqual(["f1", "f2"]);
    expect(detail.sessionCount).toBe(3);
    expect(detail.byModel).toEqual([
      { model: "deepseek-v4-flash", totalCost: 8, sessions: 3 },
    ]);
  });

  it("findOne throws NotFoundException for an unknown synthetic id", async () => {
    const db = mkChain([
      {
        id: "p1",
        name: "gateway",
        directory: "/home/user/gateway",
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
    ]);
    const svc = new ProjectsService(db as any, readerMock as any);
    await expect(svc.findOne("nominal:inconnu")).rejects.toThrow("Project not found");
  });

  it("list exposes the per-source breakdown per project", async () => {
    const readerMock2 = {
      ...readerMock,
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
          bySource: [
            { source: "host", totalCost: 3, tokensInput: 6, tokensOutput: 12, sessions: 1 },
            { source: "vm:devbox", totalCost: 2, tokensInput: 4, tokensOutput: 8, sessions: 1 },
          ],
        },
      ]),
    };
    const projectRow = {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    };
    const db = mkChain([], [], [], [projectRow]);
    const svc = new ProjectsService(db as any, readerMock2 as any);
    const rows = await svc.list();
    expect(rows[0].bySource).toEqual([
      { source: "host", totalCost: 3, tokensInput: 6, tokensOutput: 12, sessions: 1 },
      { source: "vm:devbox", totalCost: 2, tokensInput: 4, tokensOutput: 8, sessions: 1 },
    ]);
  });
});