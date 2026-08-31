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
});