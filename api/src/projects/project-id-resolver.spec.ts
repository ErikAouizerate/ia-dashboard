import {
  resolvePreferredProjectRowId,
  resolveProjectGroup,
  resolveProjectRowIds,
} from "./project-id-resolver";

function row(id: string, directory: string, stale = false) {
  return {
    id,
    name: directory.split("/").pop() ?? directory,
    directory,
    stale,
    firstSeen: new Date(1000),
    lastSeen: new Date(2000),
  };
}

const mkDb = (rows: unknown[]) => {
  const chain: any = {
    then: (resolve: (v: unknown) => void) => resolve(rows),
    from: () => chain,
  };
  return { select: jest.fn(() => chain) };
};

describe("project-id-resolver", () => {
  it("resolves a synthetic id to all member row ids", async () => {
    const db = mkDb([
      row("p1", "/w/gateway"),
      row("p2", "/w/gateway_v2"),
    ]);
    expect(await resolveProjectRowIds(db as any, "nominal:gateway")).toEqual(["p1", "p2"]);
  });

  it("resolves a synthetic id to the preferred (non-versioned) member id", async () => {
    const db = mkDb([
      row("p2", "/w/gateway_v2"),
      row("p1", "/w/gateway"),
    ]);
    expect(await resolvePreferredProjectRowId(db as any, "nominal:gateway")).toBe("p1");
  });

  it("resolves a real member id to its group rows", async () => {
    const db = mkDb([
      row("p1", "/w/gateway"),
      row("p2", "/w/gateway_v2"),
    ]);
    const group = await resolveProjectGroup(db as any, "p2");
    expect(group?.meta.name).toBe("gateway");
    expect(group?.rows.map((r) => r.id).sort()).toEqual(["p1", "p2"]);
  });

  it("keeps a real id unchanged for a non-versioned project", async () => {
    const db = mkDb([row("p1", "/w/gateway")]);
    expect(await resolvePreferredProjectRowId(db as any, "p1")).toBe("p1");
  });

  it("returns null for an unknown id", async () => {
    const db = mkDb([row("p1", "/w/gateway")]);
    expect(await resolveProjectRowIds(db as any, "nominal:inconnu")).toBeNull();
    expect(await resolvePreferredProjectRowId(db as any, "nope")).toBeNull();
  });
});