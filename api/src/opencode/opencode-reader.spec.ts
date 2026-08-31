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
             id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
             title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
           CREATE TABLE message (
             id TEXT PRIMARY KEY, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);
           CREATE TABLE part (
             id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);
           CREATE TABLE todo (
             session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER,
             time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project (id, worktree, name) VALUES (?,?,?)").run(
    "proj1",
    "/home/user/gateway",
    null,
  );
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  ins.run(
    "s1",
    "proj1",
    null,
    "/home/user/gateway",
    null,
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
    null,
  );
  ins.run(
    "s1-sub",
    "proj1",
    "s1",
    "/home/user/gateway",
    null,
    "Implement Task 1 (@general subagent)",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}',
    "general",
    0.4,
    10,
    20,
    0,
    30,
    0,
    2,
    1,
    1,
    1785702400000,
    1785702500000,
    null,
  );
  db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
  ).run("m1", "s1", JSON.stringify({ role: "user" }), 1785702293000, 1785702293000);
  db.prepare(
    "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)",
  ).run(
    "p1",
    "m1",
    "s1",
    JSON.stringify({ type: "text", text: "Add OAuth login flow" }),
    1785702294000,
    1785702294000,
  );
  db.prepare(
    "INSERT INTO todo (session_id, content, status, priority, position, time_created, time_updated) VALUES (?,?,?,?,?,?,?)",
  ).run("s1", "Write provider", "in_progress", "high", 0, 1785702295000, 1785702295000);
  db.close();
  return path;
}

function buildMultiModelFixture(dir: string): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
             title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
           CREATE TABLE message (
             id TEXT PRIMARY KEY, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);
           CREATE TABLE part (
             id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);`);
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // gateway : parent + subagent deepseek, parent claude, parent deepseek (mergé)
  ins.run("g1", null, null, "/home/user/gateway", null, "A",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    1.0, 100, 200, 0, 0, 0, 0, 0, 0, 1000, 6000, null);
  ins.run("g1-sub", null, "g1", "/home/user/gateway", null, "sub",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "general",
    0.5, 10, 20, 0, 0, 0, 0, 0, 0, 4600, 4900, null);
  ins.run("g2", null, null, "/home/user/gateway", null, "B",
    '{"id":"claude-sonnet-4-20250514","providerID":"anthropic"}', "build",
    2.0, 50, 60, 0, 0, 0, 0, 0, 0, 2000, 3000, null);
  ins.run("g3", null, null, "/home/user/gateway", null, "C",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    3.0, 300, 400, 0, 0, 0, 0, 0, 0, 3000, 4000, null);
  // api : parent claude, parent deepseek à durée négative
  ins.run("a1", null, null, "/home/user/api", null, "D",
    '{"id":"claude-sonnet-4-20250514","providerID":"anthropic"}', "build",
    4.0, 700, 800, 0, 0, 0, 0, 0, 0, 1000, 2000, null);
  ins.run("a2", null, null, "/home/user/api", null, "E",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    0.1, 1, 1, 0, 0, 0, 0, 0, 0, 5000, 4000, null);

  const insMsg = db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
  );
  const insPart = db.prepare(
    "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)",
  );
  // g1 : message user instantané, puis réponse assistant avec texte+outil chevauchants et texte séparé
  insMsg.run("g1-mu", "g1", JSON.stringify({ role: "user" }), 1500, 1500);
  insPart.run("g1-pu", "g1-mu", "g1", JSON.stringify({ type: "text" }), 1500, 1500);
  insMsg.run("g1-ma", "g1", JSON.stringify({ role: "assistant" }), 4000, 5300);
  insPart.run("g1-p1", "g1-ma", "g1", JSON.stringify({ type: "text" }), 4000, 5000);
  insPart.run("g1-p2", "g1-ma", "g1", JSON.stringify({ type: "tool" }), 4600, 4900);
  insPart.run("g1-p3", "g1-ma", "g1", JSON.stringify({ type: "text" }), 5200, 5300);
  // g1-sub : parts présentes mais session exclue (parent_id non nul)
  insMsg.run("g1-sub-m", "g1-sub", JSON.stringify({ role: "assistant" }), 4650, 4850);
  insPart.run("g1-sub-p", "g1-sub-m", "g1-sub", JSON.stringify({ type: "text" }), 4650, 4850);
  // g2 : une réponse assistant
  insMsg.run("g2-m", "g2", JSON.stringify({ role: "assistant" }), 2100, 2600);
  insPart.run("g2-p", "g2-m", "g2", JSON.stringify({ type: "text" }), 2100, 2600);
  // g3 : texte + outil chevauchants
  insMsg.run("g3-m", "g3", JSON.stringify({ role: "assistant" }), 3200, 3400);
  insPart.run("g3-p1", "g3-m", "g3", JSON.stringify({ type: "text" }), 3200, 3400);
  insPart.run("g3-p2", "g3-m", "g3", JSON.stringify({ type: "tool" }), 3300, 3350);
  // a1 : une réponse assistant
  insMsg.run("a1-m", "a1", JSON.stringify({ role: "assistant" }), 1200, 1500);
  insPart.run("a1-p", "a1-m", "a1", JSON.stringify({ type: "text" }), 1200, 1500);
  // a2 : part instantanée (exclue : time_updated > time_created non vérifié)
  insMsg.run("a2-m", "a2", JSON.stringify({ role: "assistant" }), 4000, 4000);
  insPart.run("a2-p", "a2-m", "a2", JSON.stringify({ type: "text" }), 4000, 4000);

  db.close();
  return path;
}

function buildDanglingPartFixture(dir: string): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
             title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
           CREATE TABLE message (
             id TEXT PRIMARY KEY, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);
           CREATE TABLE part (
             id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT,
             time_created INTEGER, time_updated INTEGER);`);
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run("d1", null, null, "/home/user/api", null, "Dangling",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    0.1, 1, 1, 0, 0, 0, 0, 0, 0, 1000, 1000 + 3 * 60 * 60 * 1000, null);
  db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
  ).run("d1-m", "d1", JSON.stringify({ role: "assistant" }), 2000, 2000 + 3 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)",
  ).run("d1-p", "d1-m", "d1", JSON.stringify({ type: "tool" }), 2000, 2000 + 3 * 60 * 60 * 1000);
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
    expect(page.total).toBe(2);
    expect(page.items[0].id).toBe("s1-sub");
  });

  it("filters by model", () => {
    const page = reader.listSessions({ model: "deepseek-v4-flash-free" });
    expect(page.items.length).toBe(2);
  });

  it("filters by derived project name (directory basename)", () => {
    const page = reader.listSessions({ project: "gateway" });
    expect(page.total).toBe(2);
    expect(page.items[0].id).toBe("s1-sub");
  });

  it("lists projects deriving name from worktree basename", () => {
    const projects = reader.listProjects();
    expect(projects.find((p) => p.id === "proj1")?.name).toBe("gateway");
  });

  it("throws OpendbNotFoundError when the db is missing", () => {
    const missing = new OpenCodeReader("/nonexistent/opencode.db");
    expect(() => missing.open()).toThrow("OpenCode database not found");
  });

  it("exposes directory, parentId and isSubagent", () => {
    const parent = reader.getSession("s1");
    expect(parent?.directory).toBe("/home/user/gateway");
    expect(parent?.parentId).toBeNull();
    expect(parent?.isSubagent).toBe(false);
    const sub = reader.getSession("s1-sub");
    expect(sub?.parentId).toBe("s1");
    expect(sub?.isSubagent).toBe(true);
  });

  it("lists subagent ids of a parent", () => {
    expect(reader.getSubagentIds("s1")).toEqual(["s1-sub"]);
  });

  it("lists distinct directories", () => {
    expect(reader.listDirectories()).toEqual([
      { directory: "/home/user/gateway", firstSeen: 1785702292033, lastSeen: 1785703020414 },
    ]);
  });

  it("filters sessions by directory", () => {
    const page = reader.listSessions({ directory: "/home/user/gateway" });
    expect(page.total).toBe(2);
  });

  it("filters sessions to parents only", () => {
    const page = reader.listSessions({ parentOnly: true });
    expect(page.items.map((s) => s.id)).toEqual(["s1"]);
  });

  it("builds an analysis input from user messages and todos", () => {
    const input = reader.getSessionAnalysisInput("s1");
    expect(input?.title).toBe("Add auth");
    expect(input?.userMessages).toEqual(["Add OAuth login flow"]);
    expect(input?.todos[0]).toEqual({ content: "Write provider", status: "in_progress" });
  });

  it("lists parent sessions after a timestamp", () => {
    const all = reader.listParentSessions({});
    expect(all.map((s) => s.id)).toEqual(["s1"]);
    const none = reader.listParentSessions({ from: 1785702292033 + 1 });
    expect(none).toEqual([]);
  });

  it("aggregates by directory and model", () => {
    const byDir = reader.aggregateByDirectory({});
    expect(byDir[0].name).toBe("gateway");
    expect(byDir[0].totalCost).toBeCloseTo(1.65);
    expect(byDir[0].sessions).toBe(2);
    const byModel = reader.aggregateByModel({});
    expect(byModel[0].model).toBe("deepseek-v4-flash-free");
    const all = reader.aggregateAll({});
    expect(all.sessions).toBe(2);
  });

  it("aggregates by day (YYYY-MM-DD)", () => {
    const days = reader.aggregateByDay({ from: 0 });
    expect(days[0].day).toBe(new Date(1785702292033).toISOString().slice(0, 10));
  });

  describe("multi-model fixture", () => {
    let reader: OpenCodeReader;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "oc-multi-"));
      path = buildMultiModelFixture(dir);
      reader = new OpenCodeReader(path);
      reader.open();
    });
    afterEach(() => reader.close());

    it("aggregates by directory and model, merging duplicate JSON model ids", () => {
      const rows = reader.aggregateByDirectoryAndModel({});
      const gateway = rows.filter((r) => r.directory === "/home/user/gateway");
      const ds = gateway.find((r) => r.model === "deepseek-v4-flash-free");
      // g1 + g1-sub + g3 : l'agrégat modèle inclut les subagents (comme aggregateByModel)
      expect(ds?.sessions).toBe(3);
      expect(ds?.totalCost).toBeCloseTo(4.5); // 1.0 + 0.5 + 3.0
      expect(ds?.tokensInput).toBe(410); // 100 + 10 + 300
      const claude = gateway.find((r) => r.model === "claude-sonnet-4-20250514");
      expect(claude?.sessions).toBe(1);
      expect(rows.filter((r) => r.directory === "/home/user/api").length).toBe(2);
    });

    it("computes processing time from part intervals, excluding user pauses", () => {
      const rows = reader.timeByDirectory({});
      const gateway = rows.find((r) => r.directory === "/home/user/gateway");
      // g1 : text [4000,5000] ∪ tool [4600,4900] ∪ text [5200,5300] = 1100ms ;
      //      pause user (1500->4000) et idle final (5300->6000) exclus
      // g2 : text [2100,2600] = 500ms
      // g3 : text [3200,3400] ∪ tool [3300,3350] = 200ms (chevauchant, pas de double comptage)
      // g1-sub : exclu (session subagent)
      expect(gateway?.durationMs).toBe(1800);
      const api = rows.find((r) => r.directory === "/home/user/api");
      // a1 : text [1200,1500] = 300ms ; a2 : part instantanée exclue (time_updated == time_created)
      expect(api?.durationMs).toBe(300);
    });

    it("caps a dangling part at 2 hours", () => {
      dir = mkdtempSync(join(tmpdir(), "oc-cap-"));
      path = buildDanglingPartFixture(dir);
      reader = new OpenCodeReader(path);
      reader.open();
      const rows = reader.timeByDirectory({});
      expect(rows.find((r) => r.directory === "/home/user/api")?.durationMs).toBe(
        2 * 60 * 60 * 1000,
      );
      reader.close();
    });
  });
});