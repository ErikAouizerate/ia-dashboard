import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MultiSourceReader } from "./multi-source-reader";

function seedDb(path: string, sessionId: string, timeUpdated: number, title: string) {
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
      title TEXT, model TEXT, agent TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER, time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project VALUES (?,?,?)").run("proj1", "/w/app", null);
  db.prepare(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    sessionId,
    "proj1",
    null,
    "/w/app",
    null,
    title,
    '{"id":"m"}',
    "build",
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    timeUpdated - 100,
    timeUpdated,
    null,
  );
  db.close();
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
  writeFileSync(join(gen, "configs.json"), JSON.stringify({ id: "cid1", config: { model: "m" } }) + "\n");

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

  expect(byKey.cid1.profile).toBe("muse-spark");
  expect(byKey.cid1.sessions).toBe(1);
  expect(byKey.cid1.totalCost).toBe(1);
  expect(byKey.none.sessions).toBe(1);
  expect(byKey.none.profile).toBeNull();

  const detail = reader.getConfig("cid1");
  expect(detail?.config).toEqual({ model: "m" });
  expect(detail?.sessionList.map((s) => s.id)).toEqual(["v1"]);
  expect(reader.getConfig("none")?.sessionList.map((s) => s.id)).toEqual(["h1"]);
  expect(reader.getConfig("missing")).toBeNull();
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
