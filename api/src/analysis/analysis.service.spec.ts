import { AnalysisService } from "./analysis.service";

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({
    summary: "Added OAuth",
    demandes: [{ label: "Ajouter OAuth", description: "Flux login" }],
    enjeux: [{ label: "Sécurité", description: "Tokens JWT" }],
  }),
};

const readerMock = {
  getSessionAnalysisInput: jest.fn().mockReturnValue({
    id: "s1",
    title: "Add auth",
    model: "deepseek-v4-flash",
    agent: "build",
    timeCreated: 1000,
    userMessages: ["Add OAuth"],
    todos: [],
    summaryAdditions: 10,
    summaryDeletions: 5,
    summaryFiles: 3,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" }),
  listParentSessions: jest.fn().mockReturnValue([
    { id: "s1", timeCreated: 1000, directory: "/p" },
    { id: "s2", timeCreated: 900, directory: "/p" },
  ]),
  getSubagentIds: jest.fn().mockReturnValue([]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    limit: () => chain,
    onConflictDoNothing: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("AnalysisService", () => {
  beforeEach(() => {
    llmMock.chatCompletion.mockClear();
    readerMock.getSession.mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" });
  });

  it("analyzeSession calls the LLM with the session input and persists done", async () => {
    readerMock.getSession.mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" });
    const db = mkDb(
      [], // projectIdForDirectory: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory: insert projects returning
      [], // existing sessionAnalyses select -> none
      [], // insert pending (awaited, ignored)
      [], // update analyzing (awaited, ignored)
      [{ id: "a1", summary: "Added OAuth", status: "done" }], // update done returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const out = await svc.analyzeSession("s1");
    expect(out.summary).toBe("Added OAuth");
    expect(llmMock.chatCompletion).toHaveBeenCalled();
  });

  it("queueBackfill only enqueues recent unanalyzed parent sessions", async () => {
    const db = mkDb(
      [], // select existing analyses -> none
      [], // projectIdForDirectory s1: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory s1: insert projects returning
      [], // projectIdForDirectory s2: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory s2: insert projects returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.queueBackfill(2);
    expect(n).toBe(2);
    expect(readerMock.listParentSessions).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) }),
    );
  });

  it("tick skips when no pending session", async () => {
    const db = mkDb([], [], []);
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    await expect(svc.tick()).resolves.toBeUndefined();
  });

  it("serializes concurrent analyzeSession calls on the same session", async () => {
    readerMock.getSession.mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" });
    const db = mkDb(
      [], // projectIdForDirectory: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory: insert projects returning
      [], // existing sessionAnalyses select -> none (first call)
      [], // insert pending (awaited, ignored)
      [], // update analyzing (awaited, ignored)
      [{ id: "a1", summary: "Added OAuth", status: "done" }], // update done returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const [a, b] = await Promise.all([
      svc.analyzeSession("s1"),
      svc.analyzeSession("s1"),
    ]);
    expect(a.summary).toBe("Added OAuth");
    expect(b.summary).toBe("Added OAuth");
    expect(llmMock.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not re-analyze a session already done", async () => {
    readerMock.getSession.mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" });
    const db = mkDb(
      [], // projectIdForDirectory: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory: insert projects returning
      [{ id: "a1", sessionId: "s1", status: "done", summary: "already" }], // existing select -> done
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const out = await svc.analyzeSession("s1");
    expect(out.summary).toBe("already");
    expect(llmMock.chatCompletion).not.toHaveBeenCalled();
  });

  it("recoverStuck resets analyzing rows to pending", async () => {
    const db = mkDb([{ id: "a1", status: "pending" }]);
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.recoverStuck();
    expect(n).toBe(1);
  });
});