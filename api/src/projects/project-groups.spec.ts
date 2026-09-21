import { basename } from "node:path";
import { findProjectGroup, groupProjects, ProjectRowLike } from "./project-groups";

function row(
  id: string,
  directory: string,
  stale = false,
  first = 1000,
  last = 2000,
): ProjectRowLike {
  return {
    id,
    name: basename(directory),
    directory,
    stale,
    firstSeen: new Date(first),
    lastSeen: new Date(last),
  };
}

describe("groupProjects", () => {
  it("keeps a single non-versioned project unchanged", () => {
    const out = groupProjects([row("p1", "/w/gateway")]);
    expect(out).toEqual([
      {
        id: "p1",
        name: "gateway",
        directory: "/w/gateway",
        directories: ["/w/gateway"],
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
    ]);
  });

  it("merges versioned directories under the nominal name", () => {
    const out = groupProjects([
      row("p1", "/w/gateway"),
      row("p2", "/w/gateway_v2", false, 1500, 2500),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/w/gateway",
      directories: ["/w/gateway", "/w/gateway_v2"],
      stale: false,
    });
    expect(out[0].firstSeen.getTime()).toBe(1000);
    expect(out[0].lastSeen.getTime()).toBe(2500);
  });

  it("groups an isolated versioned directory under its nominal name", () => {
    const out = groupProjects([row("p2", "/w/gateway_v2", false, 1500, 2500)]);
    expect(out[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/w/gateway_v2",
      directories: ["/w/gateway_v2"],
    });
  });

  it("marks a group stale only when all members are stale", () => {
    const mixed = groupProjects([
      row("p1", "/w/gateway", false),
      row("p2", "/w/gateway_v2", true),
    ]);
    expect(mixed[0].stale).toBe(false);
    const allStale = groupProjects([
      row("p1", "/w/gateway", true),
      row("p2", "/w/gateway_v2", true),
    ]);
    expect(allStale[0].stale).toBe(true);
  });

  it("prefers a non-versioned member as the group directory", () => {
    const onlyVersioned = groupProjects([
      row("p2", "/w/gateway_v2"),
      row("p3", "/w/gateway_v3"),
    ]);
    expect(onlyVersioned[0].directory).toBe("/w/gateway_v2");
    const withBase = groupProjects([
      row("p2", "/w/gateway_v2"),
      row("p1", "/w/gateway"),
    ]);
    expect(withBase[0].directory).toBe("/w/gateway");
  });
});

describe("findProjectGroup", () => {
  const rows = [
    row("p1", "/w/gateway"),
    row("p2", "/w/gateway_v2", false, 1500, 2500),
    row("p9", "/w/other"),
  ];

  it("returns the nominal meta and only the rows of the group for a real member id", () => {
    expect(findProjectGroup("p2", rows)).toEqual({
      meta: {
        id: "nominal:gateway",
        name: "gateway",
        directory: "/w/gateway",
        directories: ["/w/gateway", "/w/gateway_v2"],
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2500),
      },
      rows: [rows[0], rows[1]],
    });
  });

  it("returns null for an unknown real id", () => {
    expect(findProjectGroup("nope", rows)).toBeNull();
  });

  it("returns the group for a synthetic nominal id", () => {
    const found = findProjectGroup("nominal:gateway", rows);
    expect(found?.meta.id).toBe("nominal:gateway");
    expect(found?.meta.name).toBe("gateway");
    expect(found?.rows).toEqual([rows[0], rows[1]]);
  });
});