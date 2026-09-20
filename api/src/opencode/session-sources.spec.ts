import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SessionSources } from "./session-sources";

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
  const sources = new SessionSources(hostDb, store);
  const page = sources.list({});
  const byId = Object.fromEntries(page.items.map((s) => [s.id, s]));
  expect(byId.h1.source).toBe("host");
  expect(byId.v1.source).toBe("vm:devbox-abc");
  // newest first
  expect(page.items[0].id).toBe("v1");
});

test("resolves a session's reader and captured config", () => {
  const { hostDb, store } = setup();
  const sources = new SessionSources(hostDb, store);
  expect(sources.readerFor("v1")?.source).toBe("vm:devbox-abc");
  expect(sources.capture("v1")?.profile).toBe("muse-spark");
  expect(sources.capture("h1")).toBeNull();
});
