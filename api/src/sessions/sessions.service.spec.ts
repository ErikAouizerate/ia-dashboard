import { SessionsService } from "./sessions.service";

const readerMock = {
  open: jest.fn(),
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
  listProjects: jest.fn().mockReturnValue([{ id: "p1", name: "gateway" }]),
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
  it("returns annotated flag via annotatedMap", async () => {
    const db = mkDb([{ sessionId: "s1", featureId: "f1" }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const map = await svc.annotatedMap(["s1", "s2"]);
    expect(map.s1).toBe("f1");
    expect(map.s2).toBeNull();
  });

  it("delegates list to the reader", async () => {
    const db = mkDb([], [], []);
    const svc = new SessionsService(readerMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.total).toBe(2);
    expect(readerMock.listSessions).toHaveBeenCalledWith({ page: 1 });
  });

  it("list resolves projectId from directory and analysis status", async () => {
    const db = mkDb(
      [], // annotatedMap (featureSessions rows)
      [], // analysisMap (sessionAnalyses rows)
      [{ id: "p1", directory: "/p/gateway" }], // projects lookup for directory->id
    );
    const svc = new SessionsService(readerMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.items[0].projectId).toBe("p1");
    expect(page.items[0].analysedStatus).toBe("none");
    expect(page.items[0].analysed).toBe(false);
  });

  it("findOne annotates the session when linked", async () => {
    const db = mkDb([{ featureId: "f9" }], []);
    const svc = new SessionsService(readerMock as any, db as any);
    const out = await svc.findOne("s3");
    expect(out?.annotated).toBe(true);
    expect(out?.featureId).toBe("f9");
  });

  it("analysisFor returns the stored analysis", async () => {
    const db = mkDb([{ sessionId: "s1", status: "done", summary: "x" }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const a = await svc.analysisFor("s1");
    expect(a?.status).toBe("done");
  });

  it("meta returns projects as id/name pairs from pg", async () => {
    const db = mkDb([{ id: "p1", name: "gateway", stale: false }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const meta = await svc.meta();
    expect(meta.projects).toEqual([{ id: "p1", name: "gateway" }]);
    expect(meta.models).toEqual(["deepseek-v4-flash"]);
  });
});