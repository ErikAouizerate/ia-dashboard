import { AnalysisService } from "./analysis.service";

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({
    proposals: [
      {
        name: "Authentification OAuth",
        purpose: "Ajouter le flux OAuth",
        session_ids: ["s1"],
        rationale: "Seule session sur le sujet",
        demandes: [{ label: "OAuth", description: "Login" }],
        enjeux: [{ label: "Sécurité", description: "JWT" }],
      },
    ],
  }),
};

const readerMock = {
  getSessionAnalysisInput: jest.fn().mockReturnValue({
    id: "s1",
    title: "T",
    model: "m",
    agent: "a",
    timeCreated: 1,
    userMessages: [],
    todos: [],
    summaryAdditions: 0,
    summaryDeletions: 0,
    summaryFiles: 0,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s1", directory: "/p", title: "T" }),
  getSubagentIds: jest.fn().mockReturnValue(["s1-sub"]),
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
    orderBy: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("AnalysisService clustering", () => {
  it("clusterProject creates pending proposals and marks old pending stale", async () => {
    const db = mkDb(
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/p/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
      ], // resolveProjectGroup: projects select-all
      [
        { sessionId: "s1", projectId: "p1", status: "done", title: "A", analyzedAt: new Date(1000), summary: "s", demandes: [] },
        { sessionId: "s2", projectId: "p1", status: "done", title: "B", analyzedAt: new Date(2000), summary: "s", demandes: [] },
      ], // analyzedSessionsForProject: done analyses
      [], // pending proposals
      [], // linked sessions
      [{ id: "pr-old" }], // update stale returning (awaited, ignored)
      [{ id: "pr1" }], // insert proposal returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.clusterProject("p1");
    expect(n).toBe(1);
    expect(llmMock.chatCompletion).toHaveBeenCalled();
  });

  it("clusterProject resolves a synthetic id and clusters member sessions", async () => {
    const values: unknown[] = [];
    let i = 0;
    const results: unknown[] = [
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
      ], // resolveProjectGroup: projects select-all (group nominal:gateway)
      [
        { sessionId: "s1", projectId: "p1", status: "done", title: "A", analyzedAt: new Date(1000), summary: "s", demandes: [] },
        { sessionId: "s2", projectId: "p2", status: "done", title: "B", analyzedAt: new Date(2000), summary: "s", demandes: [] },
      ], // analyzedSessionsForProject: done analyses under both member ids
      [], // pending proposals
      [], // linked sessions
      [{ id: "pr-old" }], // update stale returning (awaited, ignored)
      [{ id: "pr1" }], // insert proposal returning
    ];
    const chain: any = {
      then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
      from: () => chain,
      where: () => chain,
      values: (v: unknown) => {
        values.push(v);
        return chain;
      },
      returning: () => chain,
      set: () => chain,
      limit: () => chain,
      orderBy: () => chain,
    };
    const db = {
      select: jest.fn(() => chain),
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
      delete: jest.fn(() => chain),
    };
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.clusterProject("nominal:gateway");
    expect(n).toBe(1);
    expect(llmMock.chatCompletion).toHaveBeenCalled();
    const proposal = values.find((v) => (v as any).name === "Authentification OAuth") as any;
    expect(proposal.projectId).toBe("p1");
  });

  it("acceptProposal creates a feature, links sessions + subagents, marks accepted", async () => {
    readerMock.getSession.mockImplementation((id: string) =>
      id === "s1-sub"
        ? { id: "s1-sub", directory: "/p", title: "T-sub" }
        : { id: "s1", directory: "/p", title: "T" },
    );
    const db = mkDb(
      [{ id: "pr1", projectId: "p1", name: "Auth", purpose: "P", sessionIds: ["s1"], demandes: [], enjeux: [], rationale: "R", status: "pending" }], // proposal row
      [{ id: "f1", projectId: "p1", name: "Auth", purpose: "P" }], // insert feature returning
      [], // exists check s1
      [{ id: "fs1" }], // insert feature_session s1
      [], // exists check s1-sub
      [{ id: "fs2" }], // insert feature_session s1-sub
      [{ id: "pr1", status: "accepted" }], // update proposal returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const feat = await svc.acceptProposal("pr1");
    expect(feat.id).toBe("f1");
    expect(readerMock.getSubagentIds).toHaveBeenCalledWith("s1");
  });

  it("dismissProposal marks it dismissed", async () => {
    const db = mkDb([{ id: "pr1", status: "dismissed" }]);
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const out = await svc.dismissProposal("pr1");
    expect(out).toEqual({ ok: true });
  });
});