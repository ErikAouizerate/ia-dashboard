import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FeaturesService } from "./features.service";

const readerMock = {
  getSession: jest.fn().mockReturnValue({
    id: "s1",
    projectId: "p1",
    projectName: "gateway",
    directory: "/home/user/gateway",
    title: "Add auth",
    model: "deepseek-v4-flash-free",
    agent: "build",
    cost: 1.25,
    tokensInput: 100,
    tokensOutput: 200,
    tokensReasoning: 50,
    tokensCacheRead: 300,
    tokensCacheWrite: 0,
    summaryAdditions: 10,
    summaryDeletions: 5,
    summaryFiles: 3,
    timeCreated: 1785702292033,
    timeUpdated: 1785703020414,
  }),
  getSubagentIds: jest.fn().mockReturnValue([]),
};

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({ demandes: [], enjeux: [] }),
};

function makeDb(...results: unknown[]) {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    innerJoin: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
}

const PID = "4d74880e-fb15-48eb-a4dc-686b38a7f31e";

describe("FeaturesService", () => {
  it("create inserts a feature with projectId", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    const out = await svc.create({ name: "Auth", projectId: PID });
    expect(out.id).toBe("f1");
  });

  it("findOne throws NotFoundException when missing", async () => {
    const db = makeDb([]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    await expect(svc.findOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("update accepts null satisfaction/timeSpentMin", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    const out = await svc.update("f1", { satisfaction: null, timeSpentMin: null });
    expect(out.id).toBe("f1");
  });

  it("rejects status in create payload", async () => {
    const db = makeDb();
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    await expect(
      svc.create({ name: "A", projectId: "p1", status: "done" } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a missing projectId", async () => {
    const db = makeDb();
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    await expect(svc.create({ name: "A" } as any)).rejects.toThrow(BadRequestException);
  });
});