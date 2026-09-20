import { SessionsService } from "./sessions.service";

const sourcesMock = {
  listSessions: jest.fn().mockReturnValue({
    items: [
      { id: "s1", directory: "/p/gateway", model: "deepseek-v4-flash" },
      { id: "s2", directory: "/p/gateway", model: "deepseek-v4-flash" },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s3", title: "T", directory: "/p/gateway" }),
  listModels: jest.fn().mockReturnValue(["deepseek-v4-flash"]),
  capture: jest.fn().mockReturnValue({ profile: "muse-spark", configId: "cid1" }),
  listSources: jest.fn().mockReturnValue(["host", "vm:devbox-abc"]),
  listConfigs: jest.fn().mockReturnValue([{ configId: "cid1", profile: "muse-spark" }]),
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

describe("SessionsService", () => {
  it("delegates list to the reader", async () => {
    const db = mkDb([]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.total).toBe(2);
    expect(sourcesMock.listSessions).toHaveBeenCalledWith({ page: 1 });
  });

  it("list resolves projectId from directory", async () => {
    const db = mkDb([{ id: "p1", directory: "/p/gateway" }]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.items[0].projectId).toBe("p1");
  });

  it("list attaches the captured config to each item", async () => {
    const db = mkDb([]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.items[0].config).toEqual({ profile: "muse-spark", configId: "cid1" });
  });

  it("meta exposes the available sources and configs", async () => {
    const db = mkDb([]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const meta = await svc.meta();
    expect(meta.sources).toEqual(["host", "vm:devbox-abc"]);
    expect(meta.configs).toEqual([{ configId: "cid1", profile: "muse-spark" }]);
  });

  it("findOne returns the session with its projectId", async () => {
    const db = mkDb([{ id: "p1", directory: "/p/gateway" }]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const out = await svc.findOne("s3");
    expect(out?.title).toBe("T");
    expect(out?.projectId).toBe("p1");
  });

  it("profile returns totals, byModel, tools, calls and tree", () => {
    const reader = {
      getSession: jest.fn((id: string) =>
        id === "s3"
          ? { id: "s3", title: "T", source: "host", directory: "/p/gateway" }
          : { id, parentId: "s3", agent: "general", model: "m", cost: 0.5, source: "host" },
      ),
      getSessionTree: jest.fn().mockReturnValue(["s3", "s3-sub"]),
      getSessionCalls: jest.fn().mockReturnValue([
        {
          sessionId: "s3",
          timeCreated: 1,
          cost: 1,
          tokensInput: 10,
          tokensOutput: 2,
          tokensReasoning: 3,
          cacheRead: 4,
          cacheWrite: 5,
          model: "m",
          agent: "build",
          mode: null,
        },
      ]),
      getSessionSteps: jest.fn().mockReturnValue([
        {
          sessionId: "s3",
          cost: 1,
          tokensInput: 10,
          tokensOutput: 2,
          tokensReasoning: 3,
          cacheRead: 4,
          cacheWrite: 5,
        },
      ]),
      getSessionToolUsage: jest
        .fn()
        .mockReturnValue([{ tool: "bash", count: 3, completed: 2, error: 1 }]),
      capture: jest.fn().mockReturnValue({
        profile: "muse-spark",
        configId: "cid1",
        config: { model: "m" },
        offeredTools: ["bash"],
      }),
    };
    const svc = new SessionsService(reader as any, mkDb([]) as any);
    const p = svc.profile("s3");
    expect(p?.profile).toBe("muse-spark");
    expect(p?.config).toEqual({ model: "m" });
    expect(p?.totals).toEqual({
      cost: 1,
      tokensInput: 10,
      tokensOutput: 2,
      tokensReasoning: 3,
      cacheRead: 4,
      cacheWrite: 5,
      llmCalls: 1,
      toolCalls: 3,
      treeSize: 2,
    });
    expect(p?.byModel).toEqual([
      { model: "m", cost: 1, tokensInput: 10, tokensOutput: 2, llmCalls: 1 },
    ]);
    expect(p?.tools).toEqual([{ tool: "bash", count: 3, completed: 2, error: 1 }]);
    expect(p?.calls).toHaveLength(1);
    expect(p?.tree).toHaveLength(2);
  });

  it("profile returns null for an unknown session", () => {
    const reader = { getSession: jest.fn().mockReturnValue(null) };
    const svc = new SessionsService(reader as any, mkDb([]) as any);
    expect(svc.profile("nope")).toBeNull();
  });

  it("meta returns grouped projects with synthetic ids", async () => {
    const db = mkDb([
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
    ]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const meta = await svc.meta();
    expect(meta.projects).toEqual([{ id: "nominal:gateway", name: "gateway" }]);
    expect(meta.models).toEqual(["deepseek-v4-flash"]);
  });

  it("list resolves a synthetic projectId to member directories", async () => {
    const db = mkDb(
      [
        { id: "p1", directory: "/p/gateway" },
        { id: "p2", directory: "/p/gateway_v2" },
      ], // resolve select-all
      [
        { id: "p1", directory: "/p/gateway" },
        { id: "p2", directory: "/p/gateway_v2" },
      ], // byDir
    );
    const svc = new SessionsService(sourcesMock as any, db as any);
    await svc.list({ projectId: "nominal:gateway" });
    expect(sourcesMock.listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ directories: ["/p/gateway", "/p/gateway_v2"] }),
    );
  });
});
