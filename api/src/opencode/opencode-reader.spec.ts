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

  const addAssistant = (id: string, sessionId: string, data: object, at: number) =>
    db
      .prepare(
        "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
      )
      .run(id, sessionId, JSON.stringify(data), at, at);
  const addPart = (id: string, messageId: string, sessionId: string, data: object, at: number) =>
    db
      .prepare(
        "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)",
      )
      .run(id, messageId, sessionId, JSON.stringify(data), at, at);

  addAssistant(
    "as1",
    "s1",
    {
      role: "assistant",
      cost: 0.5,
      modelID: "m-x",
      providerID: "p",
      agent: "build",
      mode: "build",
      tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 0 } },
    },
    1785702300000,
  );
  addPart(
    "sf1",
    "as1",
    "s1",
    {
      type: "step-finish",
      cost: 0.5,
      tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 0 } },
    },
    1785702300000,
  );
  addPart("tp1", "as1", "s1", { type: "tool", tool: "bash", state: { status: "completed" } }, 1785702300001);
  addPart("tp2", "as1", "s1", { type: "tool", tool: "read", state: { status: "error" } }, 1785702300002);
  addAssistant(
    "as2",
    "s1-sub",
    {
      role: "assistant",
      cost: 0.4,
      modelID: "m-x",
      providerID: "p",
      agent: "general",
      mode: "general",
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    1785702400000,
  );
  addPart("tp3", "as2", "s1-sub", { type: "tool", tool: "bash", state: { status: "completed" } }, 1785702400001);

  db.close();
  return path;
}

function buildMultiModelFixture(dir: string): string {
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

function buildRulesFixture(dir: string): string {
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
             time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project (id, worktree, name) VALUES (?,?,?)").run(
    "proj1",
    "/repo/alpha",
    null,
  );
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // même id de modèle que d2/d3/d5 mais chaînes JSON différentes -> à fusionner
  ins.run("d1", "proj1", null, "/repo/alpha", null, "A",
    '{"id":"dup-model","providerID":"p1"}', "build",
    1.0, 100, 10, 5, 0, 0, 0, 0, 0, 1000, 5000, null);
  ins.run("d2", "proj1", null, "/repo/alpha", null, "B",
    '{"id":"dup-model","providerID":"p2","variant":"x"}', "build",
    2.0, 200, 20, 7, 0, 0, 0, 0, 0, 6000, 8000, null);
  ins.run("d3", "proj1", null, "/repo/beta", null, "C",
    '{"id":"dup-model","providerID":"p1"}', "build",
    4.0, 400, 40, 8, 0, 0, 0, 0, 0, 1000, 2000, null);
  ins.run("d4", "proj1", null, "/repo/alpha", null, "D",
    '{"id":"other-model","providerID":"p1"}', "build",
    0.5, 5, 1, 0, 0, 0, 0, 0, 0, 9000, 9500, null);
  ins.run("d5", "proj1", "d4", "/repo/gamma", null, "sub",
    '{"id":"dup-model","providerID":"p3"}', "general",
    9.0, 50, 5, 0, 0, 0, 0, 0, 0, 1000, 3000, null);
  // d6 : durée de session négative (time_updated < time_created)
  ins.run("d6", "proj1", null, "/repo/alpha", null, "E",
    '{"id":"other-model","providerID":"p1"}', "build",
    0.0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 4000, null);
  // n1 : colonnes de tokens NULL (objet tokens absent)
  ins.run("n1", "proj1", null, "/repo/alpha", null, "F",
    '{"id":"dup-model"}', null,
    0.0, null, null, null, null, null, null, null, null, 12000, 13000, null);

  const insMsg = db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
  );
  const insPart = db.prepare(
    "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?,?)",
  );
  insMsg.run("d1-mu", "d1", JSON.stringify({ role: "user" }), 1000, 1000);
  insMsg.run("d1-ma1", "d1", JSON.stringify({ role: "assistant", cost: 0.2 }), 1500, 1500);
  insMsg.run(
    "d1-ma2",
    "d1",
    JSON.stringify({ role: "assistant", cost: 0.3, tokens: { input: 7 } }),
    1600,
    1600,
  );
  insPart.run("d1-p", "d1-mu", "d1", JSON.stringify({ type: "text" }), 1000, 4000);
  insPart.run("d1-sp1", "d1-ma1", "d1", JSON.stringify({ type: "step-finish", cost: 1.0 }), 1500, 1500);
  insPart.run("d1-sp2", "d1-ma2", "d1", JSON.stringify({ type: "step-finish", tokens: { output: 3 } }), 1600, 1600);

  insMsg.run("d2-m", "d2", JSON.stringify({ role: "assistant" }), 6000, 8000);
  insPart.run("d2-p", "d2-m", "d2", JSON.stringify({ type: "text" }), 6000, 8000);
  insMsg.run("d3-m", "d3", JSON.stringify({ role: "assistant" }), 1000, 2000);
  insPart.run("d3-p", "d3-m", "d3", JSON.stringify({ type: "text" }), 1000, 2000);
  insMsg.run("d4-m", "d4", JSON.stringify({ role: "assistant" }), 9000, 9000);
  insPart.run("d4-p", "d4-m", "d4", JSON.stringify({ type: "text" }), 9000, 9000);
  insMsg.run("d5-m", "d5", JSON.stringify({ role: "assistant" }), 1000, 3000);
  insPart.run("d5-p", "d5-m", "d5", JSON.stringify({ type: "text" }), 1000, 3000);
  insMsg.run("d6-m", "d6", JSON.stringify({ role: "assistant" }), 5000, 4000);
  insPart.run("d6-p", "d6-m", "d6", JSON.stringify({ type: "text" }), 5000, 4000);

  db.close();
  return path;
}

function buildModelFixture(
  dir: string,
  opts: { model: string; directory: string | null; projectId: string | null },
): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
           CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
             title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);`);
  if (opts.projectId) {
    db.prepare("INSERT INTO project (id, worktree, name) VALUES (?,?,?)").run(
      opts.projectId,
      null,
      null,
    );
  }
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run("x", opts.projectId, null, opts.directory, null, "X", opts.model, "build",
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 2000, null);
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

  it("getSessionTree returns the parent and its descendants", () => {
    expect(reader.getSessionTree("s1").sort()).toEqual(["s1", "s1-sub"]);
  });

  it("getSessionCalls parses assistant messages for the tree", () => {
    const calls = reader.getSessionCalls(["s1", "s1-sub"]);
    expect(calls).toHaveLength(2);
    expect(calls.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(0.9);
    expect(calls[0].model).toBe("m-x");
  });

  it("getSessionSteps parses step-finish parts", () => {
    const steps = reader.getSessionSteps(["s1", "s1-sub"]);
    expect(steps).toHaveLength(1);
    expect(steps[0].cost).toBeCloseTo(0.5);
    expect(steps[0].cacheRead).toBe(30);
  });

  it("getSessionToolUsage counts tools, completed and error", () => {
    const tools = reader.getSessionToolUsage(["s1", "s1-sub"]);
    const bash = tools.find((t) => t.tool === "bash")!;
    expect(bash.count).toBe(2);
    expect(bash.completed).toBe(2);
    expect(tools.find((t) => t.tool === "read")!.error).toBe(1);
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

  it("filters sessions by a directories list", () => {
    const page = reader.listSessions({ directories: ["/home/user/other"] });
    expect(page.total).toBe(0);
    const gateways = reader.listSessions({ directories: ["/home/user/gateway"] });
    expect(gateways.total).toBe(2);
  });

  it("filters sessions to parents only", () => {
    const page = reader.listSessions({ parentOnly: true });
    expect(page.items.map((s) => s.id)).toEqual(["s1"]);
  });

  it("filters sessions by a created-at window", () => {
    const from = reader.listSessions({ from: new Date(1785702400000).toISOString() });
    expect(from.items.map((s) => s.id)).toEqual(["s1-sub"]);
    const to = reader.listSessions({ to: new Date(1785702292033).toISOString() });
    expect(to.items.map((s) => s.id)).toEqual(["s1"]);
  });

  it("falls back to the raw model string when it is not JSON", () => {
    const p = buildModelFixture(mkdtempSync(join(tmpdir(), "oc-model-")), {
      model: "not-json",
      directory: "/w/a",
      projectId: "proj1",
    });
    const r = new OpenCodeReader(p);
    r.open();
    expect(r.getSession("x")?.model).toBe("not-json");
    r.close();
  });

  it("maps a JSON model without an id to an empty string", () => {
    const p = buildModelFixture(mkdtempSync(join(tmpdir(), "oc-model-")), {
      model: '{"foo":1}',
      directory: "/w/a",
      projectId: "proj1",
    });
    const r = new OpenCodeReader(p);
    r.open();
    expect(r.getSession("x")?.model).toBe("");
    r.close();
  });

  it("names a session with no directory after its global project id", () => {
    const p = buildModelFixture(mkdtempSync(join(tmpdir(), "oc-model-")), {
      model: '{"id":"m"}',
      directory: null,
      projectId: "global",
    });
    const r = new OpenCodeReader(p);
    r.open();
    expect(r.getSession("x")?.projectName).toBe("global");
    r.close();
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
    expect(byDir[0].bySource).toEqual([
      {
        source: "host",
        totalCost: byDir[0].totalCost,
        tokensInput: byDir[0].tokensInput,
        tokensOutput: byDir[0].tokensOutput,
        sessions: byDir[0].sessions,
      },
    ]);
    const byModel = reader.aggregateByModel({});
    expect(byModel[0].model).toBe("deepseek-v4-flash-free");
    const all = reader.aggregateAll({});
    expect(all.sessions).toBe(2);
    expect(all.bySource).toHaveLength(1);
    expect(all.bySource[0].source).toBe("host");
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

    it("lists distinct model ids sorted", () => {
      expect(reader.listModels()).toEqual(["claude-sonnet-4-20250514", "deepseek-v4-flash-free"]);
    });

    it("filters sessions by multiple directories", () => {
      const page = reader.listSessions({
        directories: ["/home/user/api"],
      });
      // discriminatif : api a 2 sessions sur 6 au total ; aucun id gateway
      expect(page.total).toBe(2);
      expect(page.items.map((s) => s.id).sort()).toEqual(["a1", "a2"]);
      const both = reader.listSessions({
        directories: ["/home/user/gateway", "/home/user/api"],
      });
      expect(both.total).toBe(6);
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

  describe("business rules fixture", () => {
    let reader: OpenCodeReader;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "oc-rules-"));
      path = buildRulesFixture(dir);
      reader = new OpenCodeReader(path);
      reader.open();
    });
    afterEach(() => reader.close());

    it("timeByDirectory sums parent-session durations per directory and exposes bySource host", () => {
      const rows = reader.timeByDirectory({});
      const alpha = rows.find((r) => r.directory === "/repo/alpha");
      expect(alpha?.durationMs).toBe(5000); // d1 [1000,4000] + d2 [6000,8000] : plusieurs sessions sommées
      expect(alpha?.bySource).toEqual([{ source: "host", durationMs: 5000 }]);
      const beta = rows.find((r) => r.directory === "/repo/beta");
      expect(beta?.durationMs).toBe(1000); // d3
    });

    it("timeByDirectory excludes subagent sessions and non-positive durations", () => {
      const rows = reader.timeByDirectory({});
      // d5 est dans /repo/gamma mais parent_id non nul -> aucune ligne
      expect(rows.find((r) => r.directory === "/repo/gamma")).toBeUndefined();
      // d4 (instantanée) et d6 (négative) sont dans /repo/alpha et n'ajoutent rien
      expect(rows.find((r) => r.directory === "/repo/alpha")?.durationMs).toBe(5000);
    });

    it("aggregateByDirectoryAndModel merges JSON model strings that parse to the same id", () => {
      const rows = reader.aggregateByDirectoryAndModel({});
      const alphaDup = rows.find(
        (r) => r.directory === "/repo/alpha" && r.model === "dup-model",
      );
      expect(alphaDup?.sessions).toBe(3); // d1 + d2 + n1 (3 chaînes JSON différentes)
      expect(alphaDup?.totalCost).toBeCloseTo(3.0);
      expect(alphaDup?.tokensInput).toBe(300);
      // même id mais répertoire différent -> lignes distinctes
      const betaDup = rows.find(
        (r) => r.directory === "/repo/beta" && r.model === "dup-model",
      );
      expect(betaDup?.sessions).toBe(1);
      expect(betaDup?.totalCost).toBeCloseTo(4.0);
      expect(rows.filter((r) => r.model === "dup-model")).toHaveLength(3);
    });

    it("aggregateByDirectoryAndModel sorts rows by descending total cost", () => {
      const rows = reader.aggregateByDirectoryAndModel({});
      expect(rows[0].directory).toBe("/repo/gamma");
      expect(rows[0].totalCost).toBeCloseTo(9.0);
      expect(rows[rows.length - 1].totalCost).toBeLessThan(rows[0].totalCost);
    });

    it("aggregateByModel sums and merges equal parsed ids", () => {
      const rows = reader.aggregateByModel({});
      const dup = rows.find((r) => r.model === "dup-model");
      expect(dup?.sessions).toBe(5); // d1 d2 d3 d5 n1
      expect(dup?.totalCost).toBeCloseTo(16.0);
      expect(dup?.tokensInput).toBe(750);
      const other = rows.find((r) => r.model === "other-model");
      expect(other?.sessions).toBe(2); // d4 d6
      expect(other?.totalCost).toBeCloseTo(0.5);
      expect(rows[0].model).toBe("dup-model");
    });

    it("getSessionCalls defaults absent tokens to 0 and absent agent/mode to null", () => {
      const calls = reader.getSessionCalls(["d1"]);
      const bare = calls.find((c) => c.cost === 0.2)!;
      expect(bare.tokensInput).toBe(0);
      expect(bare.tokensOutput).toBe(0);
      expect(bare.tokensReasoning).toBe(0);
      expect(bare.cacheRead).toBe(0);
      expect(bare.cacheWrite).toBe(0);
      expect(bare.agent).toBeNull();
      expect(bare.mode).toBeNull();
      const partial = calls.find((c) => c.cost === 0.3)!;
      expect(partial.tokensInput).toBe(7);
      expect(partial.tokensOutput).toBe(0);
    });

    it("getSessionSteps defaults absent tokens to 0", () => {
      const steps = reader.getSessionSteps(["d1"]);
      const bare = steps.find((s) => s.cost === 1.0)!;
      expect(bare.tokensInput).toBe(0);
      expect(bare.tokensOutput).toBe(0);
      expect(bare.tokensReasoning).toBe(0);
      expect(bare.cacheRead).toBe(0);
      expect(bare.cacheWrite).toBe(0);
      const partial = steps.find((s) => s.tokensOutput === 3)!;
      expect(partial.tokensInput).toBe(0);
    });

    it("listSessions accepts a directories list and the historical single-directory form", () => {
      const list = reader.listSessions({ directories: ["/repo/alpha", "/repo/beta"] });
      expect(list.items.map((s) => s.id).sort()).toEqual(["d1", "d2", "d3", "d4", "d6", "n1"]);
      expect(list.total).toBe(6);
      const single = reader.listSessions({ directory: "/repo/beta" });
      expect(single.items.map((s) => s.id)).toEqual(["d3"]);
    });
  });
});