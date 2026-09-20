import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { OpenCodeReader } from "../opencode/opencode-reader";

function sessionDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "cmp-"));
  const path = join(dir, "opencode.db");
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
  db.prepare("INSERT INTO project VALUES (?,?,?)").run("p", "/w/a", null);
  const ins = db.prepare("INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("a", "p", null, "/w/a", null, "A", '{"id":"m"}', "build", 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, null);
  ins.run("a-sub", "p", "a", "/w/a", null, "A sub", '{"id":"m"}', "general", 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, null);
  const msg = db.prepare("INSERT INTO message VALUES (?,?,?,?,?)");
  msg.run("m1", "a", JSON.stringify({ role: "assistant", cost: 1, modelID: "m", tokens: {} }), 0, 0);
  msg.run("m2", "a-sub", JSON.stringify({ role: "assistant", cost: 0.5, modelID: "m", tokens: {} }), 0, 0);
  const part = db.prepare("INSERT INTO part VALUES (?,?,?,?,?,?)");
  part.run("pp1", "m1", "a", JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed" } }), 0, 0);
  part.run("pp2", "m2", "a-sub", JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed" } }), 0, 0);
  db.close();
  return path;
}

test("tree aggregation sums parent + subagents", () => {
  const reader = new OpenCodeReader(sessionDb());
  const tree = reader.getSessionTree("a");
  const calls = reader.getSessionCalls(tree);
  expect(tree.sort()).toEqual(["a", "a-sub"]);
  expect(calls.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(1.5);
  expect(reader.getSessionToolUsage(tree).find((t) => t.tool === "bash")!.count).toBe(2);
});
