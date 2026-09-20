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

  it("findOne returns the session with its projectId", async () => {
    const db = mkDb([{ id: "p1", directory: "/p/gateway" }]);
    const svc = new SessionsService(sourcesMock as any, db as any);
    const out = await svc.findOne("s3");
    expect(out?.title).toBe("T");
    expect(out?.projectId).toBe("p1");
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
