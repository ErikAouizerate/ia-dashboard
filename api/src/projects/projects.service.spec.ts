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
  listConfigs: jest.fn().mockReturnValue([
    {
      configId: "cid1",
      profile: "muse-spark",
      config: null,
      sessions: 3,
      totalCost: 8,
      tokensInput: 16,
      tokensOutput: 32,
      bySource: [],
      models: [
        {
          model: "deepseek-v4-flash",
          sessions: 3,
          totalCost: 8,
          tokensInput: 16,
          tokensOutput: 32,
        },
      ],
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

  it("findOne returns the project detail with byModel", async () => {
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
    const detail = await svc.findOne("p1");
    expect(detail.byModel[0].model).toBe("deepseek-v4-flash");
    expect(detail.byModel).toEqual([
      { model: "deepseek-v4-flash", totalCost: 5, sessions: 2 },
    ]);
    expect(detail.durationMs).toBe(7200000);
    expect(detail.configs).toEqual([
      {
        configId: "cid1",
        profile: "muse-spark",
        sessions: 3,
        totalCost: 8,
        tokensInput: 16,
        tokensOutput: 32,
        models: [
          {
            model: "deepseek-v4-flash",
            sessions: 3,
            totalCost: 8,
            tokensInput: 16,
            tokensOutput: 32,
          },
        ],
      },
    ]);
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
    const db = mkChain(rows);
    const svc = new ProjectsService(db as any, readerMock as any);
    const detail = await svc.findOne("nominal:gateway");
    expect(detail.id).toBe("nominal:gateway");
    expect(detail.name).toBe("gateway");
    expect(detail.directories).toEqual(["/home/user/gateway", "/home/user/gateway_v2"]);
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

  it("findOne throws NotFoundException for an unknown real id", async () => {
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
    await expect(svc.findOne("does-not-exist")).rejects.toThrow("Project not found");
  });

  it("findOne accepts a real member id and resolves its nominal group", async () => {
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
    const db = mkChain(rows);
    const svc = new ProjectsService(db as any, readerMock as any);
    const detail = await svc.findOne("p2");
    expect(detail.id).toBe("nominal:gateway");
    expect(detail.directories).toEqual(["/home/user/gateway", "/home/user/gateway_v2"]);
    expect(detail.sessionCount).toBe(3);
    expect(detail.totalCost).toBe(8);
    expect(detail.tokensInput).toBe(16);
    expect(detail.tokensOutput).toBe(32);
    expect(detail.durationMs).toBe(9000000);
  });

  it("findOne scopes byModel to the project directories", async () => {
    const rows = [
      {
        id: "p1",
        name: "gateway",
        directory: "/home/user/gateway",
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
    ];
    const reader = {
      ...readerMock,
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
          directory: "/home/user/other",
          model: "gpt-5",
          totalCost: 999,
          tokensInput: 1,
          tokensOutput: 1,
          sessions: 9,
        },
        {
          directory: "/home/user/other",
          model: "deepseek-v4-flash",
          totalCost: 100,
          tokensInput: 1,
          tokensOutput: 1,
          sessions: 4,
        },
      ]),
    };
    const db = mkChain(rows);
    const svc = new ProjectsService(db as any, reader as any);
    const detail = await svc.findOne("p1");
    expect(detail.byModel).toEqual([
      { model: "deepseek-v4-flash", totalCost: 5, sessions: 2 },
    ]);
  });

  it("list returns one row per nominal group and sums member aggregates", async () => {
    const dirs = [
      { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
      { directory: "/home/user/gateway_v2", firstSeen: 500, lastSeen: 4000 },
      { directory: "/home/user/gateway_v3", firstSeen: 1500, lastSeen: 3000 },
      { directory: "/home/user/other", firstSeen: 100, lastSeen: 3500 },
      { directory: "/home/user/infrastructure_v2", firstSeen: 700, lastSeen: 4200 },
    ];
    const rows = [
      {
        id: "p1",
        name: "gateway",
        directory: "/home/user/gateway",
        stale: true,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
      {
        id: "p2",
        name: "gateway_v2",
        directory: "/home/user/gateway_v2",
        stale: false,
        firstSeen: new Date(500),
        lastSeen: new Date(4000),
      },
      {
        id: "p3",
        name: "gateway_v3",
        directory: "/home/user/gateway_v3",
        stale: true,
        firstSeen: new Date(1500),
        lastSeen: new Date(3000),
      },
      {
        id: "p4",
        name: "other",
        directory: "/home/user/other",
        stale: true,
        firstSeen: new Date(100),
        lastSeen: new Date(3500),
      },
      {
        id: "p5",
        name: "infrastructure_v2",
        directory: "/home/user/infrastructure_v2",
        stale: false,
        firstSeen: new Date(700),
        lastSeen: new Date(4200),
      },
    ];
    const reader = {
      ...readerMock,
      listDirectories: jest.fn().mockReturnValue(dirs),
      aggregateByDirectory: jest.fn().mockReturnValue([
        { directory: "/home/user/gateway", name: "gateway", totalCost: 5, tokensInput: 10, tokensOutput: 20, sessions: 2 },
        { directory: "/home/user/gateway_v2", name: "gateway_v2", totalCost: 3, tokensInput: 6, tokensOutput: 12, sessions: 1 },
        { directory: "/home/user/gateway_v3", name: "gateway_v3", totalCost: 1, tokensInput: 2, tokensOutput: 4, sessions: 4 },
        { directory: "/home/user/other", name: "other", totalCost: 9, tokensInput: 90, tokensOutput: 90, sessions: 9 },
        { directory: "/home/user/infrastructure_v2", name: "infrastructure_v2", totalCost: 7, tokensInput: 70, tokensOutput: 70, sessions: 7 },
      ]),
      timeByDirectory: jest.fn().mockReturnValue([
        { directory: "/home/user/gateway", durationMs: 7200000 },
        { directory: "/home/user/gateway_v2", durationMs: 1800000 },
        { directory: "/home/user/gateway_v3", durationMs: 600000 },
        { directory: "/home/user/other", durationMs: 1000 },
        { directory: "/home/user/infrastructure_v2", durationMs: 2000 },
      ]),
    };
    const db = mkChain([], [], [], [], [], [], rows);
    const svc = new ProjectsService(db as any, reader as any);
    const out = await svc.list();

    expect(out).toHaveLength(3);
    expect(out.map((r) => r.id)).toEqual(["nominal:infrastructure", "nominal:gateway", "p4"]);

    const gw = out[1];
    expect(gw.name).toBe("gateway");
    expect(gw.directory).toBe("/home/user/gateway");
    expect(gw.directories).toEqual([
      "/home/user/gateway",
      "/home/user/gateway_v2",
      "/home/user/gateway_v3",
    ]);
    expect(gw.sessionCount).toBe(7);
    expect(gw.totalCost).toBe(9);
    expect(gw.tokensInput).toBe(18);
    expect(gw.tokensOutput).toBe(36);
    expect(gw.durationMs).toBe(9600000);
    expect(gw.firstSeen.getTime()).toBe(500);
    expect(gw.lastSeen.getTime()).toBe(4000);
    expect(gw.stale).toBe(false);

    const isolated = out[0];
    expect(isolated.name).toBe("infrastructure");
    expect(isolated.directory).toBe("/home/user/infrastructure_v2");
    expect(isolated.directories).toEqual(["/home/user/infrastructure_v2"]);

    const other = out[2];
    expect(other.id).toBe("p4");
    expect(other.stale).toBe(true);
  });

  it("list picks the nominal-name member as directory regardless of row order", async () => {
    const dirs = [
      { directory: "/home/user/gateway_v2", firstSeen: 500, lastSeen: 4000 },
      { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
    ];
    const rows = [
      {
        id: "p2",
        name: "gateway_v2",
        directory: "/home/user/gateway_v2",
        stale: false,
        firstSeen: new Date(500),
        lastSeen: new Date(4000),
      },
      {
        id: "p1",
        name: "gateway",
        directory: "/home/user/gateway",
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
    ];
    const db = mkChain([], [], [], rows);
    const svc = new ProjectsService(db as any, readerMock as any);
    const out = await svc.list();
    expect(out).toHaveLength(1);
    expect(out[0].directory).toBe("/home/user/gateway");
    expect(out[0].directories).toEqual([
      "/home/user/gateway_v2",
      "/home/user/gateway",
    ]);
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