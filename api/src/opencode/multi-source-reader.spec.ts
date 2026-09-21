import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MultiSourceReader } from "./multi-source-reader";
import { configFingerprint } from "./config-fingerprint";

const FIXTURE_CONFIG = { model: "m", plugins: ["a", "b"], skills: ["s"] };
const CID = configFingerprint(FIXTURE_CONFIG)!;

const SCHEMA = `CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
      title TEXT, model TEXT, agent TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER, time_created INTEGER, time_updated INTEGER);`;

interface SeedOptions {
  cost?: number;
  tokensInput?: number;
  tokensOutput?: number;
  directory?: string;
  model?: string;
  parentId?: string | null;
  timeCreated?: number;
  projectId?: string;
  projectWorktree?: string | null;
  projectName?: string | null;
}

function writeSession(
  db: Database.Database,
  sessionId: string,
  timeUpdated: number,
  title: string,
  opts: SeedOptions = {},
) {
  const o = {
    cost: 1,
    tokensInput: 0,
    tokensOutput: 0,
    directory: "/w/app",
    model: '{"id":"m"}',
    parentId: null as string | null,
    timeCreated: timeUpdated - 100,
    projectId: "proj1",
    projectWorktree: "/w/app" as string | null,
    projectName: null as string | null,
    ...opts,
  };
  db.prepare("INSERT OR IGNORE INTO project VALUES (?,?,?)").run(
    o.projectId,
    o.projectWorktree,
    o.projectName,
  );
  db.prepare(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    sessionId,
    o.projectId,
    o.parentId,
    o.directory,
    null,
    title,
    o.model,
    "build",
    o.cost,
    o.tokensInput,
    o.tokensOutput,
    0,
    0,
    0,
    0,
    0,
    0,
    o.timeCreated,
    timeUpdated,
    null,
  );
}

function seedDb(path: string, sessionId: string, timeUpdated: number, title: string, opts: SeedOptions = {}) {
  const db = new Database(path);
  db.exec(SCHEMA);
  writeSession(db, sessionId, timeUpdated, title, opts);
  db.close();
}

function addSession(path: string, sessionId: string, timeUpdated: number, title: string, opts: SeedOptions = {}) {
  const db = new Database(path);
  writeSession(db, sessionId, timeUpdated, title, opts);
  db.close();
}

function seedPart(path: string, sessionId: string, t0: number, t1: number) {
  const db = new Database(path);
  db.prepare("INSERT INTO message VALUES (?,?,?,?,?)").run(`msg-${sessionId}`, sessionId, "{}", t0, t1);
  db.prepare("INSERT INTO part VALUES (?,?,?,?,?,?)").run(
    `part-${sessionId}`,
    `msg-${sessionId}`,
    sessionId,
    JSON.stringify({ type: "step-finish" }),
    t0,
    t1,
  );
  db.close();
}

const DAY1 = Date.UTC(2026, 0, 5);
const DAY2 = Date.UTC(2026, 0, 6);
const DAY3 = Date.UTC(2026, 0, 7);

function setupRich() {
  const hostDir = mkdtempSync(join(tmpdir(), "rich-host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "h1", DAY1 + 2000, "h1", {
    directory: "/w/app",
    cost: 2,
    tokensInput: 10,
    tokensOutput: 20,
    timeCreated: DAY1 + 1000,
    projectId: "proj1",
    projectName: "host-app",
  });
  addSession(hostDb, "h2", DAY2 + 2000, "h2", {
    directory: "/w/app",
    cost: 3,
    tokensInput: 30,
    tokensOutput: 40,
    timeCreated: DAY2 + 1000,
    projectId: "proj2",
    projectWorktree: "/w/other",
  });

  const store = mkdtempSync(join(tmpdir(), "rich-store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  const vmDb = join(gen, "opencode.db");
  seedDb(vmDb, "v1", DAY1 + 6000, "v1", {
    directory: "/w/app",
    cost: 7,
    tokensInput: 70,
    tokensOutput: 80,
    timeCreated: DAY1 + 5000,
    projectId: "proj1",
    projectName: "vm-app",
  });
  addSession(vmDb, "v2", DAY3 + 2000, "v2", {
    directory: "/w/other",
    cost: 1,
    tokensInput: 1,
    tokensOutput: 1,
    timeCreated: DAY3 + 1000,
    projectId: "proj1",
    projectName: "vm-app",
  });

  return { hostDb, store };
}

function setupTime() {
  const hostDir = mkdtempSync(join(tmpdir(), "time-host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "t1", 5000, "t1", { directory: "/w/app", timeCreated: 0 });
  seedPart(hostDb, "t1", 1000, 4000);

  const store = mkdtempSync(join(tmpdir(), "time-store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  const vmDb = join(gen, "opencode.db");
  seedDb(vmDb, "t2", 5000, "t2", { directory: "/w/app", timeCreated: 0 });
  seedPart(vmDb, "t2", 1000, 2500);

  return { hostDb, store };
}

function setupDup() {
  const hostDir = mkdtempSync(join(tmpdir(), "dup-host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "dup-host-newer", 5000, "host-newer", { timeCreated: 4000 });
  addSession(hostDb, "dup-vm-newer", 8000, "host-older", { timeCreated: 7000 });

  const store = mkdtempSync(join(tmpdir(), "dup-store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  const vmDb = join(gen, "opencode.db");
  seedDb(vmDb, "dup-host-newer", 4000, "vm-older", { timeCreated: 3000 });
  addSession(vmDb, "dup-vm-newer", 9000, "vm-newer", { timeCreated: 7000 });

  return { hostDb, store };
}

function setup() {
  const hostDir = mkdtempSync(join(tmpdir(), "host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "h1", 1000, "host-session");

  const store = mkdtempSync(join(tmpdir(), "store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  seedDb(join(gen, "opencode.db"), "v1", 2000, "vm-session");
  writeFileSync(
    join(gen, "captures.jsonl"),
    JSON.stringify({
      sessionId: "v1",
      profile: "muse-spark",
      agent: "build",
      model: { modelID: "m" },
      configId: "cid1",
      at: 1,
    }) + "\n",
  );
  writeFileSync(
    join(gen, "configs.json"),
    JSON.stringify({ id: "cid1", config: FIXTURE_CONFIG }) + "\n",
  );

  return { hostDb, store };
}

test("lists host and vm sessions with their source, dedup by id keeping newest", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  const page = sources.listSessions({});
  const byId = Object.fromEntries(page.items.map((s) => [s.id, s]));
  expect(byId.h1.source).toBe("host");
  expect(byId.v1.source).toBe("vm:devbox-abc");
  expect(page.items[0].id).toBe("v1");
});

test("resolves a session's captured config", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  expect(sources.getSession("v1")?.source).toBe("vm:devbox-abc");
  expect(sources.capture("v1")?.profile).toBe("muse-spark");
  expect(sources.capture("h1")).toBeNull();
});

test("lists configs grouped by configId with a no-config bucket", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);
  const byKey = Object.fromEntries(reader.listConfigs().map((c) => [c.configId ?? "none", c]));

  expect(byKey[CID].profile).toBe("muse-spark");
  expect(byKey[CID].sessions).toBe(1);
  expect(byKey[CID].totalCost).toBe(1);
  expect(byKey.none.sessions).toBe(1);
  expect(byKey.none.profile).toBeNull();

  const detail = reader.getConfig(CID);
  expect(detail?.config).toEqual(FIXTURE_CONFIG);
  expect(detail?.sessionList.map((s) => s.id)).toEqual(["v1"]);
  expect(reader.getConfig("none")?.sessionList.map((s) => s.id)).toEqual(["h1"]);
  expect(reader.getConfig("missing")).toBeNull();
});

test("merges configs captured with reordered plugins into one fingerprint", () => {
  const { hostDb, store } = setup();
  const gen = join(store, "devbox-reorder");
  mkdirSync(gen, { recursive: true });
  seedDb(join(gen, "opencode.db"), "v9", 5000, "reordered");
  const config = { model: "m", plugins: ["a", "b"], skills: ["s"] };
  writeFileSync(
    join(gen, "configs.json"),
    JSON.stringify({ id: "raw-reordered", config: { ...config, plugins: ["b", "a"] } }) + "\n",
  );
  writeFileSync(
    join(gen, "captures.jsonl"),
    JSON.stringify({
      sessionId: "v9",
      profile: "muse-spark",
      model: { modelID: "m" },
      configId: "raw-reordered",
      at: 1,
    }) + "\n",
  );
  const reader = new MultiSourceReader(hostDb, store);
  const merged = reader.listConfigs().filter((c) => c.configId === CID);
  expect(merged).toHaveLength(1);
  expect(merged[0].sessions).toBe(2);
  expect(merged[0].plugins).toEqual(["a", "b"]);
  expect(merged[0].skills).toEqual(["s"]);
  expect(merged[0].stats.cost.count).toBe(2);
});

test("filters configs to sessions created after a period start", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);
  // h1 created at 900, v1 at 1900 — from 1500 keeps only the vm config
  const configs = reader.listConfigs({ from: 1500 });
  expect(configs.map((c) => c.configId)).toEqual([CID]);
  expect(configs[0].sessions).toBe(1);
});

test("ignores an unreadable generation without breaking the list", () => {
  const { hostDb, store } = setup();
  const broken = join(store, "devbox-broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "opencode.db"), "not a sqlite database");
  const sources = new MultiSourceReader(hostDb, store);
  const page = sources.listSessions({});
  expect(page.items.map((s) => s.id).sort()).toEqual(["h1", "v1"]);
});

test("picks up a new generation and an atomically replaced snapshot", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  expect(sources.listSessions({}).total).toBe(2);

  const gen2 = join(store, "devbox-def");
  mkdirSync(gen2, { recursive: true });
  seedDb(join(gen2, "opencode.db"), "v2", 3000, "vm-session-2");
  expect(sources.listSessions({}).items.map((s) => s.id).sort()).toEqual(["h1", "v1", "v2"]);

  const tmp = join(store, "devbox-abc", ".tmp.db");
  seedDb(tmp, "v3", 4000, "vm-session-3");
  renameSync(tmp, join(store, "devbox-abc", "opencode.db"));
  expect(sources.listSessions({}).items.map((s) => s.id)).toContain("v3");
});

test("filters sessions by source", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);
  expect(reader.listSessions({ source: "host" } as any).items.map((s) => s.id)).toEqual(["h1"]);
  expect(reader.listSessions({ source: "vm:devbox-abc" } as any).items.map((s) => s.id)).toEqual([
    "v1",
  ]);
});

test("filters sessions by configId, with a no-config bucket", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);
  expect(reader.listSessions({ configId: CID } as any).items.map((s) => s.id)).toEqual(["v1"]);
  expect(reader.listSessions({ configId: "none" } as any).items.map((s) => s.id)).toEqual(["h1"]);
});

test("lists its sources", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);
  expect(reader.listSources().sort()).toEqual(["host", "vm:devbox-abc"]);
});

test("merges aggregates across sources and exposes bySource", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);

  const byDir = reader.aggregateByDirectory({});
  const app = byDir.filter((r) => r.directory === "/w/app");
  expect(app).toHaveLength(1);
  expect(app[0].sessions).toBe(2);
  expect(app[0].totalCost).toBe(2);
  expect(app[0].bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);

  const all = reader.aggregateAll({});
  expect(all.sessions).toBe(2);
  expect(all.bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);

  const byModel = reader.aggregateByModel({});
  expect(byModel).toHaveLength(1);
  expect(byModel[0].sessions).toBe(2);

  expect(reader.getSessionTree("v1")).toEqual(["v1"]);
  expect(reader.getSession("v1")?.source).toBe("vm:devbox-abc");
});

test("aggregateByDirectoryAndModel merges the same directory+model across sources, summing scalars and concatenating bySource", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const app = reader
    .aggregateByDirectoryAndModel({})
    .filter((r) => r.directory === "/w/app" && r.model === "m");
  expect(app).toHaveLength(1);
  expect(app[0].totalCost).toBe(12);
  expect(app[0].tokensInput).toBe(110);
  expect(app[0].tokensOutput).toBe(140);
  expect(app[0].sessions).toBe(3);
  expect(app[0].bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);
  expect(app[0].bySource.map((s) => s.sessions).sort((a, b) => a - b)).toEqual([1, 2]);
});

test("aggregateByDirectory merges one row per directory with min firstSeen and max lastSeen", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const app = reader.aggregateByDirectory({}).filter((r) => r.directory === "/w/app");
  expect(app).toHaveLength(1);
  expect(app[0].firstSeen).toBe(DAY1 + 1000);
  expect(app[0].lastSeen).toBe(DAY2 + 2000);
  expect(app[0].totalCost).toBe(12);
  expect(app[0].sessions).toBe(3);
  expect(app[0].bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);
});

test("aggregateByDay merges the same day across sources and sorts days ascending", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const days = reader.aggregateByDay({});
  expect(days.map((d) => d.day)).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
  const d1 = days.find((d) => d.day === "2026-01-05")!;
  expect(d1.totalCost).toBe(9);
  expect(d1.tokensInput).toBe(80);
  expect(d1.tokensOutput).toBe(100);
  expect(d1.sessions).toBe(2);
  expect(d1.bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);
});

test("aggregateAll sums totals across sources with one bySource entry per source", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const all = reader.aggregateAll({});
  expect(all.totalCost).toBe(13);
  expect(all.tokensInput).toBe(111);
  expect(all.tokensOutput).toBe(141);
  expect(all.sessions).toBe(4);
  expect(all.bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);
  expect(all.bySource.reduce((n, s) => n + s.sessions, 0)).toBe(4);
});

test("listDirectories unions directories, dedups and takes min firstSeen / max lastSeen", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const dirs = reader.listDirectories();
  expect(dirs.map((d) => d.directory).sort()).toEqual(["/w/app", "/w/other"]);
  const app = dirs.find((d) => d.directory === "/w/app")!;
  expect(app.firstSeen).toBe(DAY1 + 1000);
  expect(app.lastSeen).toBe(DAY2 + 2000);
});

test("listProjects unions projects and dedups by id (first source wins)", () => {
  const { hostDb, store } = setupRich();
  const reader = new MultiSourceReader(hostDb, store);
  const projects = reader.listProjects();
  expect(projects.map((p) => p.id).sort()).toEqual(["proj1", "proj2"]);
  expect(projects.find((p) => p.id === "proj1")!.name).toBe("host-app");
});

test("timeByDirectory merges the same directory, summing durationMs and concatenating bySource", () => {
  const { hostDb, store } = setupTime();
  const reader = new MultiSourceReader(hostDb, store);
  const rows = reader.timeByDirectory({});
  expect(rows).toHaveLength(1);
  expect(rows[0].directory).toBe("/w/app");
  expect(rows[0].durationMs).toBe(4500);
  expect(rows[0].bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);
  expect(rows[0].bySource.map((s) => s.durationMs).sort((a, b) => a - b)).toEqual([1500, 3000]);
});

test("listSessions dedups by id keeping the most recent timeUpdated whichever source order", () => {
  const { hostDb, store } = setupDup();
  const reader = new MultiSourceReader(hostDb, store);
  const byId = Object.fromEntries(reader.listSessions({}).items.map((s) => [s.id, s]));
  expect(byId["dup-host-newer"].source).toBe("host");
  expect(byId["dup-vm-newer"].source).toBe("vm:devbox-abc");
});

test("getSessionTree routes to the owning source and unknown ids yield null/[]", () => {
  const { hostDb, store } = setup();
  const vmDb = join(store, "devbox-abc", "opencode.db");
  addSession(vmDb, "v1-child", 2500, "child", { parentId: "v1", timeCreated: 2100 });
  addSession(hostDb, "h1-child", 1100, "child", { parentId: "h1", timeCreated: 950 });
  const reader = new MultiSourceReader(hostDb, store);

  expect(reader.getSessionTree("v1").sort()).toEqual(["v1", "v1-child"]);
  expect(reader.getSessionTree("h1").sort()).toEqual(["h1", "h1-child"]);
  expect(reader.getSubagentIds("v1")).toEqual(["v1-child"]);
  expect(reader.getSessionTree("missing")).toEqual([]);
  expect(reader.getSubagentIds("missing")).toEqual([]);
  expect(reader.getSession("missing")).toBeNull();
});
