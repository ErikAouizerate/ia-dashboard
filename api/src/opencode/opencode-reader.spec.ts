import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { OpenCodeReader } from "./opencode-reader";

function buildFixture(dir: string): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
           CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project (id, worktree, name) VALUES (?,?,?)").run(
    "proj1",
    "/home/user/gateway",
    null,
  );
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, title, model, agent, cost, tokens_input,
       tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  ins.run(
    "s1",
    "proj1",
    "Add auth",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}',
    "build",
    1.25,
    100,
    200,
    50,
    300,
    0,
    10,
    5,
    3,
    1785702292033,
    1785703020414,
  );
  db.close();
  return path;
}

describe("OpenCodeReader", () => {
  let dir: string;
  let path: string;
  let reader: OpenCodeReader;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-fixture-"));
    path = buildFixture(dir);
    reader = new OpenCodeReader(path);
    reader.open();
  });
  afterEach(() => reader.close());

  it("parses session with derived project name and parsed model", () => {
    const s = reader.getSession("s1");
    expect(s?.projectName).toBe("gateway");
    expect(s?.model).toBe("deepseek-v4-flash-free");
    expect(s?.cost).toBe(1.25);
  });

  it("paginates listSessions", () => {
    const page = reader.listSessions({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("s1");
  });

  it("filters by model", () => {
    const page = reader.listSessions({ model: "deepseek-v4-flash-free" });
    expect(page.items.length).toBe(1);
  });

  it("filters by derived project name (worktree basename)", () => {
    const page = reader.listSessions({ project: "gateway" });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("s1");
  });

  it("lists projects deriving name from worktree basename", () => {
    const projects = reader.listProjects();
    expect(projects.find((p) => p.id === "proj1")?.name).toBe("gateway");
  });

  it("throws OpendbNotFoundError when the db is missing", () => {
    const missing = new OpenCodeReader("/nonexistent/opencode.db");
    expect(() => missing.open()).toThrow("OpenCode database not found");
  });
});