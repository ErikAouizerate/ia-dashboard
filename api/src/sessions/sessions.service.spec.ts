import { SessionsService } from "./sessions.service";

const readerMock = {
  open: jest.fn(),
  listSessions: jest.fn().mockReturnValue({
    items: [{ id: "s1" }, { id: "s2" }],
    total: 2,
    page: 1,
    pageSize: 10,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s3", title: "T" }),
  listProjects: jest.fn().mockReturnValue([{ id: "p1", name: "gateway" }]),
  listModels: jest.fn().mockReturnValue(["deepseek-v4-flash-free"]),
};

const dbMock = {
  select: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([
        { sessionId: "s1", featureId: "f1" },
      ]),
    }),
  }),
};

describe("SessionsService", () => {
  it("returns annotated flag via annotatedMap", async () => {
    const svc = new SessionsService(readerMock as any, dbMock as any);
    const map = await svc.annotatedMap(["s1", "s2"]);
    expect(map.s1).toBe("f1");
    expect(map.s2).toBeNull();
  });

  it("delegates list to the reader", () => {
    const svc = new SessionsService(readerMock as any, dbMock as any);
    const page = svc.list({ page: 1 });
    expect(page.total).toBe(2);
    expect(readerMock.listSessions).toHaveBeenCalledWith({ page: 1 });
  });

  it("findOne annotates the session when linked", async () => {
    dbMock.select.mockClear();
    dbMock.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ featureId: "f9" }]),
      }),
    });
    const svc = new SessionsService(readerMock as any, dbMock as any);
    const out = await svc.findOne("s3");
    expect(out?.annotated).toBe(true);
    expect(out?.featureId).toBe("f9");
  });

  it("meta returns projects and models", () => {
    const svc = new SessionsService(readerMock as any, dbMock as any);
    expect(svc.meta()).toEqual({
      projects: ["gateway"],
      models: ["deepseek-v4-flash-free"],
    });
  });
});