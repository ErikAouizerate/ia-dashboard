import { NotFoundException } from "@nestjs/common";
import { FeaturesService } from "./features.service";

const readerMock = {
  getSession: jest.fn().mockReturnValue({
    id: "s1",
    projectId: "p1",
    projectName: "gateway",
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
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
}

describe("FeaturesService", () => {
  it("create inserts a feature", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any);
    const out = await svc.create({ name: "Auth", project: "gateway" });
    expect(out.id).toBe("f1");
    expect(db.insert).toHaveBeenCalled();
  });

  it("findOne throws NotFoundException when missing", async () => {
    const db = makeDb([]);
    const svc = new FeaturesService(db as any, readerMock as any);
    await expect(svc.findOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("links a session and snapshots it", async () => {
    const db = makeDb(
      [{ id: "f1", name: "Auth" }], // findOne: feature row
      [], // findOne: sessions list
      [], // existing link check
      [], // insert snapshot
      [], // update feature.updatedAt
      [{ id: "f1", name: "Auth" }], // final findOne: feature row
      [], // final findOne: sessions list
    );
    const svc = new FeaturesService(db as any, readerMock as any);
    const out = await svc.linkSession("f1", "s1");
    expect(out).toBeDefined();
    expect(readerMock.getSession).toHaveBeenCalledWith("s1");
  });

  it("linkSession rejects when the session is already linked", async () => {
    const db = makeDb(
      [{ id: "f1" }], // findOne: feature row
      [], // findOne: sessions list
      [{ sessionId: "s1", featureId: "f1" }], // existing link check
    );
    const svc = new FeaturesService(db as any, readerMock as any);
    await expect(svc.linkSession("f1", "s1")).rejects.toThrow(
      "Session already linked to a feature",
    );
  });

  it("list aggregates session metrics", async () => {
    const db = makeDb(
      [{ id: "f1", name: "Auth" }], // features rows
      [
        {
          featureId: "f1",
          sessionCount: 2,
          totalCost: "2.50",
          totalTokensInput: "300",
          totalTokensOutput: "400",
        },
      ], // aggregation rows
    );
    const svc = new FeaturesService(db as any, readerMock as any);
    const rows = await svc.list();
    expect(rows[0].sessionCount).toBe(2);
    expect(rows[0].totalCost).toBe(2.5);
    expect(rows[0].totalTokensInput).toBe(300);
  });

  it("update accepts null satisfaction/timeSpentMin to clear fields", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any);
    const out = await svc.update("f1", { satisfaction: null, timeSpentMin: null });
    expect(out.id).toBe("f1");
  });
});