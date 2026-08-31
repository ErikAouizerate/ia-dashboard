# ia-dashboard Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework ia-dashboard to auto-derive projects from session directories, analyze each parent session's requests/stakes via LLM (OpenCode Zen), auto-propose feature groupings per project (validable), and show a cost/token dashboard as home.

**Architecture:** Two-pass pipeline inside the NestJS API — (1) per-session LLM analysis cached in `session_analyses`, (2) per-project LLM clustering into `feature_proposals` that the user accepts/dismisses into `features`. Aggregates stay live-read from the OpenCode SQLite (never imported). Webapp becomes Dashboard → Projects → Features → Sessions drill-down. PG schema is fully reset.

**Tech Stack:** NestJS 11 + Drizzle ORM (pg) + better-sqlite3 (read-only OpenCode DB) + OpenCode Zen (OpenAI-compatible chat completions, model `deepseek-v4-flash`) + React 19 + Vite + Tailwind v4 + Redux classic (reducers + apiMiddleware).

## Global Constraints

- Communication/docs in French (memory policy).
- pg schema: drop old `features`/`feature_sessions`/`feature_status`; new schema only (user authorized full PG reset). Never write to opencode.db.
- LLM: base URL `https://opencode.ai/zen/v1`, model `deepseek-v4-flash` (env `LLM_MODEL`), key from `~/.local/share/opencode/auth.json` (`opencode` or `opencode-go` entry) or env `OPENCODE_API_KEY`; override path via env `OPENCODE_AUTH_PATH`.
- One LLM call at a time (no parallelism). Retries ×2, 60s timeout. `response_format: json_object`.
- Project name = `basename(session.directory)`; sessions with `parent_id != null` are subagents and are never analyzed individually.
- No `status` field on features. No mass import of sessions to PG. No BullMQ/Redis.
- Package manager pnpm. TypeScript everywhere. Tailwind v4 + classic Redux in webapp.

---

### Task 1: PG schema reset (Drizzle)

**Files:**
- Rewrite: `api/src/db/schema.ts`
- Generate: `api/drizzle/0001_*.sql` (via `pnpm --filter @ia-dashboard/api db:generate`)
- Test: `api/src/db/schema.spec.ts`

**Interfaces:**
- Consumes: existing `api/src/db/schema.ts`, existing drizzle setup.
- Produces: exports `projects`, `sessionAnalyses`, `features`, `featureProposals`, `featureSessions` pgTables; enums `analysisStatus`, `proposalStatus`; types `Demande`, `Enjeu`, `FeatureProposal`.

- [ ] **Step 1: Write the failing test**

Create `api/src/db/schema.spec.ts`:

```ts
import {
  projects,
  sessionAnalyses,
  features,
  featureProposals,
  featureSessions,
  analysisStatus,
  proposalStatus,
} from "./schema";

describe("db schema", () => {
  it("defines the five core tables", () => {
    expect(projects.name).toBe("projects");
    expect(sessionAnalyses.name).toBe("session_analyses");
    expect(features.name).toBe("features");
    expect(featureProposals.name).toBe("feature_proposals");
    expect(featureSessions.name).toBe("feature_sessions");
  });

  it("features has no status column", () => {
    expect("status" in features).toBe(false);
  });

  it("feature_proposals has a status enum with pending/accepted/dismissed/stale", () => {
    expect(proposalStatus.enumValues).toEqual(["pending", "accepted", "dismissed", "stale"]);
    expect(analysisStatus.enumValues).toEqual(["pending", "analyzing", "done", "error"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- schema.spec.ts`
Expected: FAIL (`Cannot find module './schema'` or wrong column shape).

- [ ] **Step 3: Rewrite `api/src/db/schema.ts`**

Replace the entire file:

```ts
import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  real,
  timestamp,
  boolean,
  uniqueIndex,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const analysisStatus = pgEnum("analysis_status", [
  "pending",
  "analyzing",
  "done",
  "error",
]);

export const proposalStatus = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "dismissed",
  "stale",
]);

export interface Demande {
  label: string;
  description: string;
}

export interface Enjeu {
  label: string;
  description: string;
}

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  directory: text("directory").notNull().unique(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  stale: boolean("stale").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionAnalyses = pgTable("session_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title"),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  summary: text("summary"),
  model: text("model"),
  status: analysisStatus("status").notNull().default("pending"),
  error: text("error"),
  errorCount: integer("error_count").notNull().default(0),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureProposals = pgTable("feature_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose"),
  sessionIds: jsonb("session_ids").$type<string[]>().notNull().default([]),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  rationale: text("rationale"),
  status: proposalStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const features = pgTable("features", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose"),
  satisfaction: smallint("satisfaction"),
  comment: text("comment"),
  tags: text("tags").array().notNull().default([]),
  timeSpentMin: integer("time_spent_min"),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  proposalId: uuid("proposal_id").references(() => featureProposals.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureSessions = pgTable(
  "feature_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    title: text("title"),
    model: text("model"),
    agent: text("agent"),
    cost: real("cost").notNull().default(0),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensReasoning: integer("tokens_reasoning").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
    summaryAdditions: integer("summary_additions").notNull().default(0),
    summaryDeletions: integer("summary_deletions").notNull().default(0),
    summaryFiles: integer("summary_files").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feature_sessions_session_id_key").on(t.sessionId)],
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ia-dashboard/api test -- schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Generate the reset migration**

Run: `pnpm --filter @ia-dashboard/api db:generate`
Expected: a new file `api/drizzle/0001_*.sql` is created.

- [ ] **Step 6: Verify the migration drops the old schema and creates the new one**

Read `api/drizzle/0001_*.sql` (or `api/drizzle/meta/*_snapshot.json`). Confirm it contains `DROP TABLE "feature_sessions"`, `DROP TABLE "features"`, `DROP TYPE "feature_status"`, and `CREATE TABLE` for all five new tables + the two enums. If drizzle-kit generated a diff that is not a full reset, delete the migration and the `meta` journal entry, then regenerate with the new schema as baseline (drizzle-kit 0.31 diffing from the empty `meta` journal produces a full reset). If the generated file is already a correct full reset, leave it.

- [ ] **Step 7: Commit**

```bash
git add api/src/db/schema.ts api/src/db/schema.spec.ts api/drizzle
git commit -m "feat(db): reset schema — projects, session_analyses, features (no status), feature_proposals, feature_sessions"
```

---

### Task 2: Extend OpenCodeReader (directory, subagents, analysis input, aggregates)

**Files:**
- Modify: `api/src/opencode/opencode.types.ts`
- Modify: `api/src/opencode/opencode-reader.ts`
- Test: `api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Consumes: existing `OpenCodeSession`, `SessionListFilters`, `SessionPage`, `OpenCodeProject` from `opencode.types.ts`.
- Produces:
  - `OpenCodeSession` gains: `directory: string`, `parentId: string | null`, `isSubagent: boolean`, `path: string | null`, `timeCompacting: number | null`.
  - `SessionListFilters` gains: `directory?: string`, `parentOnly?: boolean`.
  - New types: `SessionAnalysisInput`, `SessionAggregate`, `DirectoryAggregate`, `ModelAggregate`, `DayAggregate`.
  - `OpenCodeReader` gains: `getSubagentIds(parentId)`, `listDirectories()`, `getSessionAnalysisInput(id)`, `listParentSessions({ from })`, `aggregateAll({ from })`, `aggregateByDirectory({ from })`, `aggregateByModel({ from })`, `aggregateByDay({ from })`.

- [ ] **Step 1: Write the failing test (types + reader)**

Extend `api/src/opencode/opencode-reader.spec.ts` fixture so `session` includes `directory`, `parent_id`, `path`, `time_compacting`, and add `message`, `part`, `todo` tables. Replace `buildFixture` with:

```ts
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
    "INSERT INTO part (id, message_id, session_id, data, time_created, time_updated) VALUES (?,?,?,?,?)",
  ).run("p1", "m1", "s1", JSON.stringify({ type: "text", text: "Add OAuth login flow" }), 1785702294000, 1785702294000);
  db.prepare(
    "INSERT INTO todo (session_id, content, status, priority, position, time_created, time_updated) VALUES (?,?,?,?,?,?)",
  ).run("s1", "Write provider", "in_progress", "high", 0, 1785702295000, 1785702295000);
  db.close();
  return path;
}
```

Add tests (append to the `describe`):

```ts
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
    { directory: "/home/user/gateway", firstSeen: 1785702292033, lastSeen: 1785702500000 },
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

it("aggregates by day (YYYY-MM-DD local)", () => {
  const days = reader.aggregateByDay({ from: 0 });
  expect(days[0].day).toBe(new Date(1785702292033).toISOString().slice(0, 10));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader.spec.ts`
Expected: FAIL (missing fields/methods).

- [ ] **Step 3: Update `api/src/opencode/opencode.types.ts`**

```ts
export interface OpenCodeSession {
  id: string;
  projectId: string;
  projectName: string;
  directory: string;
  path: string | null;
  parentId: string | null;
  isSubagent: boolean;
  title: string;
  model: string;
  agent: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
  timeCreated: number;
  timeUpdated: number;
  timeCompacting: number | null;
}

export interface OpenCodeProject {
  id: string;
  name: string;
}

export interface SessionListFilters {
  project?: string;
  directory?: string;
  model?: string;
  from?: string;
  to?: string;
  annotated?: "yes" | "no";
  parentOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SessionPage {
  items: OpenCodeSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionAnalysisInput {
  id: string;
  title: string;
  model: string;
  agent: string | null;
  timeCreated: number;
  userMessages: string[];
  todos: { content: string; status: string }[];
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
}

export interface SessionAggregate {
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessions: number;
}

export interface DirectoryAggregate extends SessionAggregate {
  directory: string;
  name: string;
  firstSeen: number;
  lastSeen: number;
}

export interface ModelAggregate extends SessionAggregate {
  model: string;
}

export interface DayAggregate extends SessionAggregate {
  day: string;
}

export class OpendbNotFoundError extends Error {
  constructor(path: string) {
    super(`OpenCode database not found at ${path}`);
    this.name = "OpendbNotFoundError";
  }
}
```

- [ ] **Step 4: Update the reader Row + queries in `api/src/opencode/opencode-reader.ts`**

Add `parent_id`, `directory`, `path`, `time_compacting` to `Row`; add them to both SELECTs; add `directory` and `parentOnly` filters; compute `isSubagent = r.parent_id != null`.

Replace `listSessions` filters block (keep model/from/to, change project filter and add directory + parentOnly):

```ts
if (filters.project) {
  where.push(
    "(basename(s.directory) = @project OR s.directory = @project OR (@project = 'global' AND (s.directory IS NULL OR s.directory = '')))",
  );
  params.project = filters.project;
}
if (filters.directory) {
  where.push("s.directory = @directory");
  params.directory = filters.directory;
}
if (filters.parentOnly) {
  where.push("s.parent_id IS NULL");
}
```

Update the two SELECT statements to also select:

```sql
s.directory, s.path, s.parent_id, s.time_compacting
```

- [ ] **Step 5: Update `toSession` and add new methods**

Update `toSession` to map the new fields. Add helper `parseModel` (extract `model` column id — existing code already does this inline; extract into a private method). Then add:

```ts
getSubagentIds(parentId: string): string[] {
  const db = this.requireDb();
  const rows = db
    .prepare("SELECT id FROM session WHERE parent_id = ? ORDER BY time_created")
    .all(parentId) as { id: string }[];
  return rows.map((r) => r.id);
}

listDirectories(): { directory: string; firstSeen: number; lastSeen: number }[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT directory,
              MIN(time_created) AS firstSeen,
              MAX(time_updated) AS lastSeen
       FROM session
       WHERE directory IS NOT NULL AND directory != ''
       GROUP BY directory
       ORDER BY lastSeen DESC`,
    )
    .all() as { directory: string; firstSeen: number; lastSeen: number }[];
  return rows;
}

getSessionAnalysisInput(id: string): SessionAnalysisInput | null {
  const db = this.requireDb();
  const s = this.getSession(id);
  if (!s) return null;
  const userParts = db
    .prepare(
      `SELECT p.data AS part_data
       FROM message m JOIN part p ON p.message_id = m.id
       WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user'
         AND json_extract(p.data, '$.type') = 'text'
       ORDER BY m.time_created, p.time_created`,
    )
    .all(id) as { part_data: string }[];
  const userMessages = userParts
    .map((r) => this.extractPartText(r.part_data))
    .filter((t): t is string => !!t);
  const todos = db
    .prepare(
      `SELECT content, status FROM todo
       WHERE session_id = ? ORDER BY position`,
    )
    .all(id) as { content: string; status: string }[];
  return {
    id: s.id,
    title: s.title,
    model: s.model,
    agent: s.agent,
    timeCreated: s.timeCreated,
    userMessages,
    todos,
    summaryAdditions: s.summaryAdditions,
    summaryDeletions: s.summaryDeletions,
    summaryFiles: s.summaryFiles,
  };
}

private extractPartText(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as { text?: string };
    return typeof parsed.text === "string" && parsed.text.trim() ? parsed.text : null;
  } catch {
    return null;
  }
}

listParentSessions({ from }: { from?: number } = {}): OpenCodeSession[] {
  const db = this.requireDb();
  const where = ["s.parent_id IS NULL"];
  const params: Record<string, unknown> = {};
  if (from) {
    where.push("s.time_created >= @from");
    params.from = from;
  }
  const rows = db
    .prepare(
      `SELECT s.id, s.project_id, s.directory, s.path, s.parent_id, s.time_compacting,
              p.name AS project_name, p.worktree AS project_worktree, s.title, s.model, s.agent,
              s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
              s.tokens_cache_read, s.tokens_cache_write,
              s.summary_additions, s.summary_deletions, s.summary_files,
              s.time_created, s.time_updated
       FROM session s LEFT JOIN project p ON p.id = s.project_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.time_created ASC`,
    )
    .all(params) as Row[];
  return rows.map((r) => this.toSession(r));
}

private aggregate(from: number): SessionAggregate {
  const db = this.requireDb();
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(cost),0) AS totalCost,
              COALESCE(SUM(tokens_input),0) AS tokensInput,
              COALESCE(SUM(tokens_output),0) AS tokensOutput,
              COUNT(*) AS sessions
       FROM session WHERE time_created >= @from`,
    )
    .get({ from }) as SessionAggregate;
  return r;
}

aggregateAll({ from = 0 }: { from?: number } = {}): SessionAggregate {
  return this.aggregate(from);
}

aggregateByDirectory({ from = 0 }: { from?: number } = {}): DirectoryAggregate[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT directory,
              COALESCE(SUM(cost),0) AS totalCost,
              COALESCE(SUM(tokens_input),0) AS tokensInput,
              COALESCE(SUM(tokens_output),0) AS tokensOutput,
              COUNT(*) AS sessions,
              MIN(time_created) AS firstSeen,
              MAX(time_updated) AS lastSeen
       FROM session
       WHERE time_created >= @from AND directory IS NOT NULL AND directory != ''
       GROUP BY directory ORDER BY totalCost DESC`,
    )
    .all({ from }) as Omit<DirectoryAggregate, "name">[];
  return rows.map((r) => ({ ...r, name: basename(r.directory) }));
}

aggregateByModel({ from = 0 }: { from?: number } = {}): ModelAggregate[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT model,
              COALESCE(SUM(cost),0) AS totalCost,
              COALESCE(SUM(tokens_input),0) AS tokensInput,
              COALESCE(SUM(tokens_output),0) AS tokensOutput,
              COUNT(*) AS sessions
       FROM session WHERE time_created >= @from
       GROUP BY model ORDER BY totalCost DESC`,
    )
    .all({ from }) as { model: string; totalCost: number; tokensInput: number; tokensOutput: number; sessions: number }[];
  const out: ModelAggregate[] = [];
  for (const r of rows) {
    const id = this.parseModel(r.model);
    if (!id) continue;
    const existing = out.find((m) => m.model === id);
    if (existing) {
      existing.totalCost += r.totalCost;
      existing.tokensInput += r.tokensInput;
      existing.tokensOutput += r.tokensOutput;
      existing.sessions += r.sessions;
    } else {
      out.push({ model: id, totalCost: r.totalCost, tokensInput: r.tokensInput, tokensOutput: r.tokensOutput, sessions: r.sessions });
    }
  }
  return out.sort((a, b) => b.totalCost - a.totalCost);
}

aggregateByDay({ from = 0 }: { from?: number } = {}): DayAggregate[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT time_created, cost, tokens_input AS tokensInput, tokens_output AS tokensOutput
       FROM session WHERE time_created >= @from ORDER BY time_created`,
    )
    .all({ from }) as { time_created: number; cost: number; tokensInput: number; tokensOutput: number }[];
  const map = new Map<string, DayAggregate>();
  for (const r of rows) {
    const day = new Date(r.time_created).toISOString().slice(0, 10);
    const agg = map.get(day) ?? { day, totalCost: 0, tokensInput: 0, tokensOutput: 0, sessions: 0 };
    agg.totalCost += r.cost;
    agg.tokensInput += r.tokensInput;
    agg.tokensOutput += r.tokensOutput;
    agg.sessions += 1;
    map.set(day, agg);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

private parseModel(model: string): string | null {
  if (!model) return null;
  try {
    return (JSON.parse(model) as { id?: string })?.id ?? null;
  } catch {
    return model || null;
  }
}
```

Also replace the existing `toSession` model parsing to reuse `parseModel`, and update `projectName` priority to **directory basename first**:

```ts
private projectName(id: string, name: string | null, worktree: string | null, directory: string | null): string {
  if (directory) return basename(directory);
  if (id === "global") return "global";
  if (name) return name;
  if (worktree) return basename(worktree);
  return id;
}
```

Update all `toSession` calls to pass `r.directory` into `projectName`. Update `getSession` SELECT too (same columns as listSessions).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/opencode api/src/db
git commit -m "feat(api): extend OpenCodeReader — directory, subagents, analysis input, aggregates"
```

---

### Task 3: LLM client (OpenCode Zen) + config

**Files:**
- Modify: `api/src/config/config.ts`
- Create: `api/src/llm/llm-client.ts`
- Create: `api/src/llm/llm.module.ts`
- Test: `api/src/llm/llm-client.spec.ts`

**Interfaces:**
- Consumes: `AppConfig` (`databaseUrl`, `dbPath`) from `config.ts`.
- Produces:
  - `AppConfig` gains: `llmBaseUrl`, `llmApiKey`, `llmModel`, `authPath`.
  - `LlmClient` class with `chatCompletion<T>(messages: LlmChatMessage[]): Promise<T>`.
  - `LLM_CLIENT` symbol, `LlmModule` (Global, exports `LLM_CLIENT`).

- [ ] **Step 1: Write the failing test**

Create `api/src/llm/llm-client.spec.ts`:

```ts
import { LlmClient } from "./llm-client";

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("LlmClient", () => {
  const client = new LlmClient({
    baseUrl: "https://opencode.ai/zen/v1",
    apiKey: "test-key",
    model: "deepseek-v4-flash",
  });

  afterEach(() => jest.restoreAllMocks());

  it("posts chat completions with bearer auth and json_object format", async () => {
    const fetch = mockFetch({ choices: [{ message: { content: '{"ok":1}' } }] });
    const out = await client.chatCompletion<{ ok: number }>([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("retries on HTTP 429 then succeeds", async () => {
    const fetch = mockFetch({ choices: [{ message: { content: '{"ok":2}' } }] }, 429);
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":2}' } }] }),
        text: async () => '{"ok":2}',
      });
    const out = await client.chatCompletion<{ ok: number }>([{ role: "user", content: "x" }]);
    expect(out).toEqual({ ok: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws when the response is not valid JSON", async () => {
    mockFetch({ choices: [{ message: { content: "not json" } }] });
    await expect(
      client.chatCompletion([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/JSON/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- llm-client.spec.ts`
Expected: FAIL (`Cannot find module './llm-client'`).

- [ ] **Step 3: Write `api/src/llm/llm-client.ts`**

```ts
export interface LlmChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LlmClient {
  constructor(private readonly opts: LlmClientOptions) {}

  async chatCompletion<T>(messages: LlmChatMessage[]): Promise<T> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model: this.opts.model,
      messages,
      response_format: { type: "json_object" as const },
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        if (!res.ok) {
          throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        return JSON.parse(content) as T;
      } catch (e) {
        lastError = e;
        await sleep(1_000 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`LLM request failed after retries: ${String(lastError)}`);
  }
}
```

- [ ] **Step 4: Write `api/src/llm/llm.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { LlmClient } from "./llm-client";
import { APP_CONFIG, AppConfig } from "../config/config";

export const LLM_CLIENT = Symbol("LLM_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new LlmClient({
          baseUrl: config.llmBaseUrl,
          apiKey: config.llmApiKey,
          model: config.llmModel,
        }),
    },
  ],
  exports: [LLM_CLIENT],
})
export class LlmModule {}
```

- [ ] **Step 5: Update `api/src/config/config.ts`**

Add to `AppConfig` and `loadConfig`:

```ts
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppConfig {
  databaseUrl: string;
  dbPath: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  authPath: string;
}

function readAuthKey(authPath: string): string {
  const env = process.env.OPENCODE_API_KEY;
  if (env) return env;
  if (!existsSync(authPath)) return "";
  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf8")) as Record<
      string,
      { type?: string; key?: string }
    >;
    return parsed.opencode?.key ?? parsed["opencode-go"]?.key ?? "";
  } catch {
    return "";
  }
}

export const loadConfig = (): AppConfig => {
  const authPath =
    process.env.OPENCODE_AUTH_PATH ??
    join(homedir(), ".local", "share", "opencode", "auth.json");
  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
    dbPath:
      process.env.OPENCODE_DB_PATH ??
      join(homedir(), ".local", "share", "opencode", "opencode.db"),
    llmBaseUrl: process.env.LLM_BASE_URL ?? "https://opencode.ai/zen/v1",
    llmApiKey: readAuthKey(authPath),
    llmModel: process.env.LLM_MODEL ?? "deepseek-v4-flash",
    authPath,
  };
};
```

- [ ] **Step 6: Register `LlmModule` in `api/src/app.module.ts`** (add to imports).

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @ia-dashboard/api test -- llm-client.spec.ts`
Expected: PASS. Also run `pnpm --filter @ia-dashboard/api test` (regression).

- [ ] **Step 8: Commit**

```bash
git add api/src/llm api/src/config api/src/app.module.ts
git commit -m "feat(api): LLM client for OpenCode Zen (deepseek-v4-flash) + config"
```

---

### Task 4: Projects module (auto-derivation + endpoints)

**Files:**
- Create: `api/src/projects/projects.service.ts`
- Create: `api/src/projects/projects.controller.ts`
- Create: `api/src/projects/projects.module.ts`
- Test: `api/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE` + `DrizzleDb` from `db/drizzle.provider.ts`; `OPENCODE_READER` from `opencode/opencode.module.ts`; `projects`, `features`, `featureProposals` from `db/schema.ts`; reader methods `listDirectories`, `aggregateByDirectory`, `aggregateByModel`.
- Produces:
  - `ProjectsService.syncProjects(): Promise<void>` (upsert from `listDirectories`, mark stale).
  - `ProjectsService.list(): Promise<ProjectRow[]>` where `ProjectRow = { id, name, directory, stale, firstSeen, lastSeen, sessionCount, totalCost, tokensInput, tokensOutput }`.
  - `ProjectsService.findOne(id): Promise<ProjectDetail>` where `ProjectDetail = ProjectRow & { features: Feature[]; proposals: FeatureProposal[]; byModel: ModelAggregate[] }`.
  - `ProjectsController` routes `GET /api/projects`, `GET /api/projects/:id`.

- [ ] **Step 1: Write the failing test**

Create `api/src/projects/projects.service.spec.ts`:

```ts
import { ProjectsService } from "./projects.service";

const readerMock = {
  listDirectories: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
  ]),
  aggregateByDirectory: jest.fn().mockReturnValue([
    {
      directory: "/home/user/gateway",
      name: "gateway",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
      firstSeen: 1000,
      lastSeen: 2000,
    },
  ]),
  aggregateByModel: jest.fn().mockReturnValue([
    { model: "deepseek-v4-flash", totalCost: 5, tokensInput: 10, tokensOutput: 20, sessions: 2 },
  ]),
};

const mkChain = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    onConflictDoUpdate: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("ProjectsService", () => {
  it("syncProjects upserts directories and marks missing stale", async () => {
    const db = mkChain(
      [{ id: "p1", directory: "/home/user/gateway" }], // existing select
      [{ id: "p1" }], // insert returning
      [{ id: "p1" }], // upsert return for missing? none
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    await svc.syncProjects();
    expect(db.insert).toHaveBeenCalled();
  });

  it("list returns projects with live aggregates", async () => {
    const db = mkChain(
      [{ id: "p1", name: "gateway", directory: "/home/user/gateway", stale: false, firstSeen: new Date(1000), lastSeen: new Date(2000) }],
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const rows = await svc.list();
    expect(rows[0].name).toBe("gateway");
    expect(rows[0].totalCost).toBe(5);
    expect(rows[0].sessionCount).toBe(2);
  });

  it("findOne returns features and proposals", async () => {
    const db = mkChain(
      [{ id: "p1", name: "gateway", directory: "/home/user/gateway", stale: false, firstSeen: new Date(1000), lastSeen: new Date(2000) }], // project
      [{ id: "f1", name: "Auth" }], // features
      [{ id: "pr1", name: "Auth", status: "pending", sessionIds: ["s1"] }], // proposals
      [{ sessionId: "s1" }], // featureSessions (linkedCount)
    );
    const svc = new ProjectsService(db as any, readerMock as any);
    const detail = await svc.findOne("p1");
    expect(detail.features).toEqual([{ id: "f1", name: "Auth" }]);
    expect(detail.proposals[0].status).toBe("pending");
    expect(detail.byModel[0].model).toBe("deepseek-v4-flash");
    expect(detail.ungroupedSessions).toBe(1); // 2 sessions - 1 linked - 1 proposed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- projects.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `api/src/projects/projects.service.ts`**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { features, featureProposals, featureSessions, projects } from "../db/schema";
import { DirectoryAggregate, ModelAggregate } from "../opencode/opencode.types";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
  ) {}

  async syncProjects(): Promise<void> {
    const dirs = this.reader.listDirectories();
    const existing = await this.db.select().from(projects);
    const seen = new Set<string>();
    for (const d of dirs) {
      seen.add(d.directory);
      const name = d.directory.split("/").filter(Boolean).pop() ?? d.directory;
      await this.db
        .insert(projects)
        .values({
          name,
          directory: d.directory,
          firstSeen: new Date(d.firstSeen),
          lastSeen: new Date(d.lastSeen),
          stale: false,
        })
        .onConflictDoUpdate({
          target: projects.directory,
          set: {
            name,
            firstSeen: new Date(Math.min(d.firstSeen, new Date(existing.find((e) => e.directory === d.directory)?.firstSeen ?? d.firstSeen).getTime())),
            lastSeen: new Date(d.lastSeen),
            stale: false,
            updatedAt: new Date(),
          },
        });
    }
    for (const row of existing) {
      if (!seen.has(row.directory) && !row.stale) {
        await this.db.update(projects).set({ stale: true }).where(eq(projects.id, row.id));
      }
    }
  }

  async list() {
    await this.syncProjects();
    const rows = await this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.lastSeen));
    const agg = this.reader.aggregateByDirectory({});
    const byDir = new Map(agg.map((a) => [a.directory, a]));
    return rows.map((p) => {
      const a: DirectoryAggregate | undefined = byDir.get(p.directory);
      return {
        id: p.id,
        name: p.name,
        directory: p.directory,
        stale: p.stale,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        sessionCount: a?.sessions ?? 0,
        totalCost: a?.totalCost ?? 0,
        tokensInput: a?.tokensInput ?? 0,
        tokensOutput: a?.tokensOutput ?? 0,
      };
    });
  }

  async findOne(id: string) {
    const row = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);
    if (!row) throw new NotFoundException("Project not found");
    const agg = this.reader.aggregateByDirectory({});
    const a = agg.find((x) => x.directory === row.directory);
    const featRows = await this.db
      .select()
      .from(features)
      .where(eq(features.projectId, id))
      .orderBy(desc(features.updatedAt));
    const propRows = await this.db
      .select()
      .from(featureProposals)
      .where(eq(featureProposals.projectId, id))
      .orderBy(desc(featureProposals.createdAt));
    const linkedCount =
      featRows.length === 0
        ? 0
        : (
            await this.db
              .select({ sessionId: featureSessions.sessionId })
              .from(featureSessions)
              .where(inArray(featureSessions.featureId, featRows.map((f) => f.id)))
          ).length;
    const proposedCount = propRows
      .filter((p) => p.status === "pending")
      .reduce((n, p) => n + p.sessionIds.length, 0);
    return {
      id: row.id,
      name: row.name,
      directory: row.directory,
      stale: row.stale,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      sessionCount: a?.sessions ?? 0,
      totalCost: a?.totalCost ?? 0,
      tokensInput: a?.tokensInput ?? 0,
      tokensOutput: a?.tokensOutput ?? 0,
      ungroupedSessions: Math.max(0, (a?.sessions ?? 0) - linkedCount - proposedCount),
      byModel: this.reader.aggregateByModel({}),
      features: featRows,
      proposals: propRows,
    };
  }
}
```

- [ ] **Step 4: Write `api/src/projects/projects.controller.ts`**

```ts
import { Controller, Get, Param } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}
```

- [ ] **Step 5: Write `api/src/projects/projects.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({ controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}
```

- [ ] **Step 6: Register `ProjectsModule` in `app.module.ts`.**

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @ia-dashboard/api test -- projects.service.spec.ts`
Expected: PASS. Run full `pnpm --filter @ia-dashboard/api test`.

- [ ] **Step 8: Commit**

```bash
git add api/src/projects api/src/app.module.ts
git commit -m "feat(api): projects module — auto-derivation from directories + aggregates"
```

---

### Task 5: Analysis pass 1 — per-session LLM analysis + worker

**Files:**
- Create: `api/src/analysis/analysis.service.ts`
- Create: `api/src/analysis/analysis.worker.ts`
- Create: `api/src/analysis/analysis.controller.ts`
- Create: `api/src/analysis/analysis.module.ts`
- Test: `api/src/analysis/analysis.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE`, `OPENCODE_READER`, `LLM_CLIENT`; `sessionAnalyses`, `projects`, `featureSessions`, `featureProposals` from schema; reader `getSessionAnalysisInput`, `listParentSessions`, `getSubagentIds`.
- Produces:
  - `AnalysisService.analyzeSession(sessionId): Promise<SessionAnalysis>`
  - `AnalysisService.queueBackfill(daysAgo = 2): Promise<number>` (inserts `pending` rows for recent unanalyzed parent sessions)
  - `AnalysisService.tick(): Promise<void>` (analyze one pending/error session, < 3 errors)
  - `AnalysisService.getAnalysis(sessionId): Promise<SessionAnalysis | null>`
  - `AnalysisController`: `POST /api/analysis/run` (body `{ sessionId }`), `POST /api/analysis/run-project` (body `{ projectId }`), `GET /api/analysis/proposals?projectId=`.
  - `AnalysisWorker` (implements `OnModuleInit`): on boot runs `queueBackfill(2)` then starts `setInterval(tick, 30_000)`; guard `ANALYSIS_DISABLED !== 'true'`.

- [ ] **Step 1: Write the failing test**

Create `api/src/analysis/analysis.service.spec.ts`:

```ts
import { AnalysisService } from "./analysis.service";

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({
    summary: "Added OAuth",
    demandes: [{ label: "Ajouter OAuth", description: "Flux login" }],
    enjeux: [{ label: "Sécurité", description: "Tokens JWT" }],
  }),
};

const readerMock = {
  getSessionAnalysisInput: jest.fn().mockReturnValue({
    id: "s1",
    title: "Add auth",
    model: "deepseek-v4-flash",
    agent: "build",
    timeCreated: 1000,
    userMessages: ["Add OAuth"],
    todos: [],
    summaryAdditions: 10,
    summaryDeletions: 5,
    summaryFiles: 3,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s1", title: "Add auth" }),
  listParentSessions: jest.fn().mockReturnValue([
    { id: "s1", timeCreated: 1000 },
    { id: "s2", timeCreated: 900 },
  ]),
  getSubagentIds: jest.fn().mockReturnValue([]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    limit: () => chain,
    onConflictDoNothing: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("AnalysisService", () => {
  it("analyzeSession calls the LLM with the session input and persists done", async () => {
    readerMock.getSession.mockReturnValue({ id: "s1", title: "Add auth", directory: "/p" });
    const db = mkDb(
      [], // projectIdForDirectory: select projects -> none
      [{ id: "p1" }], // projectIdForDirectory: insert projects returning
      [], // existing sessionAnalyses select -> none
      [], // insert pending (awaited, ignored)
      [], // update analyzing (awaited, ignored)
      [{ id: "a1", summary: "Added OAuth", status: "done" }], // update done returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const out = await svc.analyzeSession("s1");
    expect(out.summary).toBe("Added OAuth");
    expect(llmMock.chatCompletion).toHaveBeenCalled();
  });

  it("queueBackfill only enqueues recent unanalyzed parent sessions", async () => {
    const db = mkDb(
      [], // select existing analyses -> none
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.queueBackfill(2);
    expect(n).toBe(2);
    expect(readerMock.listParentSessions).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) }),
    );
  });

  it("tick skips when no pending session", async () => {
    const db = mkDb([], [], []);
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    await expect(svc.tick()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- analysis.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `api/src/analysis/analysis.service.ts`**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { LLM_CLIENT } from "../llm/llm.module";
import { LlmClient } from "../llm/llm-client";
import { projects, sessionAnalyses, featureSessions, featureProposals } from "../db/schema";

const MAX_ERRORS = 3;
const ANALYSIS_SYSTEM_PROMPT =
  "Tu es un analyste de sessions d'agent de codage. " +
  "À partir d'une session, dégage : summary (résumé court en 1 phrase), " +
  "demandes (liste de {label, description} : ce que l'utilisateur a demandé), " +
  "enjeux (liste de {label, description} : points techniques ou décisionnels clés). " +
  "Réponds UNIQUEMENT en JSON : {\"summary\":string,\"demandes\":[{label,description}],\"enjeux\":[{label,description}]}.";

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  private async projectIdForDirectory(directory: string): Promise<string> {
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.directory, directory))
      .then((r) => r[0]);
    if (existing) return existing.id;
    const name = directory.split("/").filter(Boolean).pop() ?? directory;
    const inserted = await this.db
      .insert(projects)
      .values({
        name,
        directory,
        firstSeen: new Date(),
        lastSeen: new Date(),
        stale: false,
      })
      .returning();
    return inserted[0].id;
  }

  async analyzeSession(sessionId: string) {
    const input = this.reader.getSessionAnalysisInput(sessionId);
    if (!input) throw new NotFoundException("Session not found in OpenCode DB");
    const projectId = await this.projectIdForDirectory(
      this.reader.getSession(sessionId)?.directory ?? "",
    );
    const existing = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, sessionId))
      .then((r) => r[0]);
    if (!existing) {
      await this.db.insert(sessionAnalyses).values({
        sessionId,
        projectId,
        title: input.title,
        model: input.model,
        status: "pending",
      });
    }
    const userText = input.userMessages.map((m) => `- ${truncate(m, 2000)}`).join("\n");
    const todoText = input.todos
      .map((t) => `- [${t.status}] ${truncate(t.content, 500)}`)
      .join("\n");
    const user = [
      `Titre: ${input.title}`,
      `Modèle: ${input.model}`,
      `Agent: ${input.agent ?? "?"}`,
      `Date: ${new Date(input.timeCreated).toISOString()}`,
      `Diff: +${input.summaryAdditions} -${input.summaryDeletions} (${input.summaryFiles} fichiers)`,
      `Messages utilisateur:\n${userText}`,
      `Todos:\n${todoText || "(aucun)"}`,
    ].join("\n");
    await this.db
      .update(sessionAnalyses)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(sessionAnalyses.sessionId, sessionId));
    try {
      const result = await this.llm.chatCompletion<{
        summary: string;
        demandes: { label: string; description: string }[];
        enjeux: { label: string; description: string }[];
      }>([
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: user },
      ]);
      const rows = await this.db
        .update(sessionAnalyses)
        .set({
          status: "done",
          summary: result.summary,
          demandes: result.demandes ?? [],
          enjeux: result.enjeux ?? [],
          model: input.model,
          analyzedAt: new Date(),
          error: null,
          errorCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(sessionAnalyses.sessionId, sessionId))
        .returning();
      return rows[0];
    } catch (e) {
      const prev = await this.db
        .select()
        .from(sessionAnalyses)
        .where(eq(sessionAnalyses.sessionId, sessionId))
        .then((r) => r[0]);
      const errCount = (prev?.errorCount ?? 0) + 1;
      await this.db
        .update(sessionAnalyses)
        .set({
          status: errCount >= MAX_ERRORS ? "error" : "pending",
          error: String(e),
          errorCount: errCount,
          updatedAt: new Date(),
        })
        .where(eq(sessionAnalyses.sessionId, sessionId));
      throw e;
    }
  }

  async queueBackfill(daysAgo = 2): Promise<number> {
    const from = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    const parents = this.reader.listParentSessions({ from });
    const existing = await this.db
      .select({ sessionId: sessionAnalyses.sessionId })
      .from(sessionAnalyses);
    const done = new Set(existing.map((r) => r.sessionId));
    let queued = 0;
    for (const s of parents) {
      if (done.has(s.id)) continue;
      const projectId = await this.projectIdForDirectory(s.directory);
      await this.db.insert(sessionAnalyses).values({
        sessionId: s.id,
        projectId,
        title: s.title,
        model: s.model,
        status: "pending",
      });
      queued++;
    }
    return queued;
  }

  async tick(): Promise<void> {
    const next = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.status, "pending"))
      .limit(1);
    if (next.length === 0) return;
    const row = next[0];
    if (row.error && (row.errorCount ?? 0) >= MAX_ERRORS) return;
    await this.analyzeSession(row.sessionId);
  }

  async getAnalysis(sessionId: string) {
    const rows = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, sessionId));
    return rows[0] ?? null;
  }
}
```

- [ ] **Step 4: Write `api/src/analysis/analysis.worker.ts`**

```ts
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Injectable()
export class AnalysisWorker implements OnModuleInit {
  private readonly logger = new Logger(AnalysisWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(AnalysisService) private readonly svc: AnalysisService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.ANALYSIS_DISABLED === "true") return;
    try {
      const queued = await this.svc.queueBackfill(2);
      this.logger.log(`Analysis backfill queued ${queued} session(s)`);
    } catch (e) {
      this.logger.warn(`Analysis backfill failed: ${String(e)}`);
    }
    this.timer = setInterval(() => {
      this.svc.tick().catch((e) => this.logger.warn(`Analysis tick failed: ${String(e)}`));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
```

- [ ] **Step 5: Write `api/src/analysis/analysis.controller.ts`**

```ts
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Controller()
export class AnalysisController {
  constructor(private readonly svc: AnalysisService) {}

  @Post("analysis/run")
  run(@Body() body: { sessionId: string }) {
    return this.svc.analyzeSession(body.sessionId);
  }

  @Get("analysis/proposals")
  listProposals(@Query("projectId") projectId?: string) {
    return this.svc.listProposals(projectId);
  }
}
```

> Note: `listProposals`/`clusterProject` are implemented in Task 6; register the controller in the module now, and add the missing methods next task — the controller references will resolve once `AnalysisService` gains them. To keep tests green now, add a stub:

Add to `AnalysisService`:

```ts
async listProposals(_projectId?: string): Promise<unknown[]> {
  return [];
}
```

- [ ] **Step 6: Write `api/src/analysis/analysis.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisWorker } from "./analysis.worker";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisWorker],
  exports: [AnalysisService],
})
export class AnalysisModule {}
```

- [ ] **Step 7: Register `AnalysisModule` in `app.module.ts`.**

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @ia-dashboard/api test -- analysis.service.spec.ts`
Expected: PASS. Run full test suite.

- [ ] **Step 9: Commit**

```bash
git add api/src/analysis api/src/app.module.ts
git commit -m "feat(api): analysis pass 1 — per-session LLM analysis, backfill 2d, worker tick"
```

---

### Task 6: Analysis pass 2 — clustering into proposals + accept/dismiss

**Files:**
- Modify: `api/src/analysis/analysis.service.ts`
- Modify: `api/src/analysis/analysis.controller.ts`
- Test: `api/src/analysis/clustering.spec.ts`

**Interfaces:**
- Consumes: Task 5 `AnalysisService`, `featureProposals`, `features`, `featureSessions`, `projects`, `sessionAnalyses`; reader `getSubagentIds`.
- Produces:
  - `AnalysisService.listProposals(projectId?): Promise<FeatureProposal[]>`
  - `AnalysisService.clusterProject(projectId): Promise<number>` (creates new `pending` proposals, marks old `pending` ones `stale`)
  - `AnalysisService.acceptProposal(id, overrides?: { name?; purpose? }): Promise<Feature>` (creates feature, links sessions + subagents, marks proposal `accepted`)
  - `AnalysisService.dismissProposal(id): Promise<{ ok: true }>`
  - `AnalysisController` adds `POST /api/proposals/:id/accept`, `POST /api/proposals/:id/dismiss`.

- [ ] **Step 1: Write the failing test**

Create `api/src/analysis/clustering.spec.ts`:

```ts
import { AnalysisService } from "./analysis.service";

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({
    proposals: [
      {
        name: "Authentification OAuth",
        purpose: "Ajouter le flux OAuth",
        session_ids: ["s1"],
        rationale: "Seule session sur le sujet",
        demandes: [{ label: "OAuth", description: "Login" }],
        enjeux: [{ label: "Sécurité", description: "JWT" }],
      },
    ],
  }),
};

const readerMock = {
  getSessionAnalysisInput: jest.fn().mockReturnValue({ id: "s1", title: "T", model: "m", agent: "a", timeCreated: 1, userMessages: [], todos: [], summaryAdditions: 0, summaryDeletions: 0, summaryFiles: 0 }),
  getSession: jest.fn().mockReturnValue({ id: "s1", directory: "/p", title: "T" }),
  getSubagentIds: jest.fn().mockReturnValue(["s1-sub"]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
    limit: () => chain,
    orderBy: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
};

describe("AnalysisService clustering", () => {
  it("clusterProject creates pending proposals and marks old pending stale", async () => {
    const db = mkDb(
      [
        { sessionId: "s1", projectId: "p1", status: "done", title: "A", analyzedAt: new Date(1000), summary: "s", demandes: [] },
        { sessionId: "s2", projectId: "p1", status: "done", title: "B", analyzedAt: new Date(2000), summary: "s", demandes: [] },
      ], // analyzedSessionsForProject: done analyses
      [], // pending proposals
      [], // linked sessions
      [{ id: "pr-old" }], // update stale returning (awaited, ignored)
      [{ id: "pr1" }], // insert proposal returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const n = await svc.clusterProject("p1");
    expect(n).toBe(1);
    expect(llmMock.chatCompletion).toHaveBeenCalled();
  });

  it("acceptProposal creates a feature, links sessions + subagents, marks accepted", async () => {
    readerMock.getSession.mockImplementation((id: string) =>
      id === "s1-sub"
        ? { id: "s1-sub", directory: "/p", title: "T-sub" }
        : { id: "s1", directory: "/p", title: "T" },
    );
    const db = mkDb(
      [{ id: "pr1", projectId: "p1", name: "Auth", purpose: "P", sessionIds: ["s1"], demandes: [], enjeux: [], rationale: "R", status: "pending" }], // proposal row
      [{ id: "f1", projectId: "p1", name: "Auth", purpose: "P" }], // insert feature returning
      [], // exists check s1
      [{ id: "fs1" }], // insert feature_session s1
      [], // exists check s1-sub
      [{ id: "fs2" }], // insert feature_session s1-sub
      [{ id: "pr1", status: "accepted" }], // update proposal returning
    );
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const feat = await svc.acceptProposal("pr1");
    expect(feat.id).toBe("f1");
    expect(readerMock.getSubagentIds).toHaveBeenCalledWith("s1");
  });

  it("dismissProposal marks it dismissed", async () => {
    const db = mkDb([{ id: "pr1", status: "dismissed" }]);
    const svc = new AnalysisService(db as any, readerMock as any, llmMock as any);
    const out = await svc.dismissProposal("pr1");
    expect(out).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- clustering.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Add clustering + proposal methods to `AnalysisService`**

Append to `api/src/analysis/analysis.service.ts`:

```ts
private async linkFeatureSessions(featureId: string, sessionIds: string[]): Promise<void> {
  for (const sessionId of sessionIds) {
    const s = this.reader.getSession(sessionId);
    if (!s) continue;
    const allIds = [sessionId, ...this.reader.getSubagentIds(sessionId)];
    for (const sid of allIds) {
      const sub = this.reader.getSession(sid);
      if (!sub) continue;
      const exists = await this.db
        .select()
        .from(featureSessions)
        .where(eq(featureSessions.sessionId, sid))
        .then((r) => r[0]);
      if (exists) continue;
      await this.db.insert(featureSessions).values({
        featureId,
        sessionId: sub.id,
        title: sub.title,
        model: sub.model,
        agent: sub.agent,
        cost: sub.cost,
        tokensInput: sub.tokensInput,
        tokensOutput: sub.tokensOutput,
        tokensReasoning: sub.tokensReasoning,
        tokensCacheRead: sub.tokensCacheRead,
        tokensCacheWrite: sub.tokensCacheWrite,
        timeCreated: new Date(sub.timeCreated),
        timeUpdated: new Date(sub.timeUpdated),
        summaryAdditions: sub.summaryAdditions,
        summaryDeletions: sub.summaryDeletions,
        summaryFiles: sub.summaryFiles,
      });
    }
  }
}

private async analyzedSessionsForProject(projectId: string) {
  const analyses = await this.db
    .select()
    .from(sessionAnalyses)
    .where(eq(sessionAnalyses.projectId, projectId));
  const done = analyses.filter((a) => a.status === "done");
  const pendingProposals = await this.db
    .select()
    .from(featureProposals)
    .where(and(eq(featureProposals.projectId, projectId), eq(featureProposals.status, "pending")));
  const proposed = new Set(pendingProposals.flatMap((p) => p.sessionIds));
  const linked = new Set(
    (
      await this.db.select({ sessionId: featureSessions.sessionId }).from(featureSessions)
    ).map((r) => r.sessionId),
  );
  return done.filter((a) => !proposed.has(a.sessionId) && !linked.has(a.sessionId));
}

async clusterProject(projectId: string): Promise<number> {
  const candidates = await this.analyzedSessionsForProject(projectId);
  if (candidates.length < 2) return 0;
  const items = candidates
    .map((a) => ({
      session_id: a.sessionId,
      title: a.title ?? "",
      date: a.analyzedAt?.toISOString() ?? "",
      summary: a.summary ?? "",
      demandes: a.demandes,
    }))
    .sort((x, y) => (x.date < y.date ? -1 : 1));
  const prompt =
    "Regroupe ces sessions d'un même projet en features cohérentes. " +
    "Proximité temporelle ET ressemblance sémantique comptent. " +
    "Réponds UNIQUEMENT en JSON : {\"proposals\":[{name, purpose, session_ids[], rationale, demandes:[{label,description}], enjeux:[{label,description}]}]}.\n" +
    "Sessions:\n" +
    JSON.stringify(items);
  const result = await this.llm.chatCompletion<{
    proposals: {
      name: string;
      purpose: string;
      session_ids: string[];
      rationale: string;
      demandes: { label: string; description: string }[];
      enjeux: { label: string; description: string }[];
    }[];
  }>([
    { role: "system", content: "Tu es un outil de regroupement de sessions en features." },
    { role: "user", content: prompt },
  ]);
  await this.db
    .update(featureProposals)
    .set({ status: "stale", updatedAt: new Date() })
    .where(and(eq(featureProposals.projectId, projectId), eq(featureProposals.status, "pending")));
  let created = 0;
  for (const p of result.proposals ?? []) {
    await this.db.insert(featureProposals).values({
      projectId,
      name: p.name,
      purpose: p.purpose,
      sessionIds: p.session_ids ?? [],
      demandes: p.demandes ?? [],
      enjeux: p.enjeux ?? [],
      rationale: p.rationale,
      status: "pending",
    });
    created++;
  }
  return created;
}

async doCluster(projectId: string, sessions: { id: string }[]): Promise<number> {
  return this.clusterProject(projectId);
}

async listProposals(projectId?: string) {
  const q = this.db.select().from(featureProposals).orderBy(featureProposals.createdAt);
  return projectId
    ? this.db.select().from(featureProposals).where(eq(featureProposals.projectId, projectId))
    : q;
}

async acceptProposal(id: string, overrides?: { name?: string; purpose?: string }) {
  const prop = await this.db
    .select()
    .from(featureProposals)
    .where(eq(featureProposals.id, id))
    .then((r) => r[0]);
  if (!prop) throw new NotFoundException("Proposal not found");
  if (prop.status !== "pending") throw new NotFoundException("Proposal not pending");
  const feat = await this.db
    .insert(features)
    .values({
      projectId: prop.projectId,
      name: overrides?.name?.trim() || prop.name,
      purpose: overrides?.purpose?.trim() || prop.purpose,
      demandes: prop.demandes,
      enjeux: prop.enjeux,
      proposalId: prop.id,
    })
    .returning();
  await this.linkFeatureSessions(feat[0].id, prop.sessionIds);
  await this.db
    .update(featureProposals)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(featureProposals.id, id));
  return feat[0];
}

async dismissProposal(id: string) {
  await this.db
    .update(featureProposals)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(featureProposals.id, id));
  return { ok: true };
}
```

- [ ] **Step 4: Add controller routes**

Add to `api/src/analysis/analysis.controller.ts`:

```ts
@Post("proposals/:id/accept")
accept(
  @Param("id") id: string,
  @Body() body: { name?: string; purpose?: string },
) {
  return this.svc.acceptProposal(id, body);
}

@Post("proposals/:id/dismiss")
dismiss(@Param("id") id: string) {
  return this.svc.dismissProposal(id);
}
```

Update imports: add `Param` to the `@nestjs/common` import in the controller.

- [ ] **Step 5: Remove the `listProposals` stub added in Task 5.**

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @ia-dashboard/api test -- clustering.spec.ts`
Expected: PASS. Run full `pnpm --filter @ia-dashboard/api test`.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @ia-dashboard/api typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/analysis
git commit -m "feat(api): analysis pass 2 — per-project clustering proposals + accept/dismiss"
```

---

### Task 7: Features rework (no status, project FK, demandes/enjeux, reanalyze)

**Files:**
- Rewrite: `api/src/features/dto.ts`
- Rewrite: `api/src/features/features.service.ts`
- Rewrite: `api/src/features/features.controller.ts`
- Modify: `api/src/features/features.module.ts`
- Rewrite: `api/src/features/features.service.spec.ts`

**Interfaces:**
- Consumes: `projects`, `features`, `featureSessions`, `sessionAnalyses`, `featureProposals`; reader `getSession`, `getSubagentIds`; `AnalysisService` (for `linkFeatureSessions` reuse is NOT shared — re-implement linking here; keep feature linking local to FeaturesService for encapsulation).
- Produces:
  - `CreateFeatureDto = { projectId, name, purpose?, satisfaction?, comment?, tags?, timeSpentMin? }` (zod, no `status`, no `project` text).
  - `UpdateFeatureDto = CreateFeatureDto.partial()`.
  - `FeaturesService.list()` → features with `projectName` join + aggregates.
  - `FeaturesService.findOne(id)` → feature + `projectName` + linked sessions.
  - `FeaturesService.create/update/remove`, `linkSession` (parent + subagents), `bulkLinkSessions`, `unlinkSession`, `resyncSession`, `reanalyze(id)`.
  - `FeaturesController`: same routes as today (minus nothing) + `POST /api/features/:id/reanalyze`.

- [ ] **Step 1: Rewrite `api/src/features/dto.ts`**

```ts
import { z } from "zod";

export const createFeatureSchema = z.object({
  projectId: z.string().uuid().min(1),
  name: z.string().min(1),
  purpose: z.string().optional(),
  satisfaction: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().optional(),
  tags: z.array(z.string()).optional(),
  timeSpentMin: z.number().int().nonnegative().nullable().optional(),
});
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = createFeatureSchema.partial();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
```

- [ ] **Step 2: Rewrite `api/src/features/features.service.ts`**

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { LLM_CLIENT } from "../llm/llm.module";
import { LlmClient } from "../llm/llm-client";
import { features, featureSessions, projects } from "../db/schema";
import { CreateFeatureDto, UpdateFeatureDto, createFeatureSchema, updateFeatureSchema } from "./dto";

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  private snapshotValues(s: {
    id: string; title: string; model: string; agent: string | null;
    cost: number; tokensInput: number; tokensOutput: number; tokensReasoning: number;
    tokensCacheRead: number; tokensCacheWrite: number; timeCreated: number; timeUpdated: number;
    summaryAdditions: number; summaryDeletions: number; summaryFiles: number;
  }) {
    return {
      title: s.title,
      model: s.model,
      agent: s.agent,
      cost: s.cost,
      tokensInput: s.tokensInput,
      tokensOutput: s.tokensOutput,
      tokensReasoning: s.tokensReasoning,
      tokensCacheRead: s.tokensCacheRead,
      tokensCacheWrite: s.tokensCacheWrite,
      timeCreated: new Date(s.timeCreated),
      timeUpdated: new Date(s.timeUpdated),
      summaryAdditions: s.summaryAdditions,
      summaryDeletions: s.summaryDeletions,
      summaryFiles: s.summaryFiles,
    };
  }

  private async linkWithSubagents(featureId: string, sessionId: string): Promise<string[]> {
    const s = this.reader.getSession(sessionId);
    if (!s) return [];
    const ids = [sessionId, ...this.reader.getSubagentIds(sessionId)];
    const existing = await this.db
      .select({ sessionId: featureSessions.sessionId })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, ids));
    const already = new Set(existing.map((r) => r.sessionId));
    const linked: string[] = [];
    for (const sid of ids) {
      if (already.has(sid)) continue;
      const sub = sid === sessionId ? s : this.reader.getSession(sid);
      if (!sub) continue;
      await this.db.insert(featureSessions).values({
        featureId,
        sessionId: sub.id,
        ...this.snapshotValues(sub),
      });
      linked.push(sid);
    }
    return linked;
  }

  async create(input: CreateFeatureDto) {
    const parsed = createFeatureSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const rows = await this.db
      .insert(features)
      .values({ ...parsed.data, tags: parsed.data.tags ?? [] })
      .returning();
    return rows[0];
  }

  async list() {
    const rows = await this.db
      .select({
        feature: features,
        projectName: projects.name,
      })
      .from(features)
      .innerJoin(projects, eq(projects.id, features.projectId))
      .orderBy(desc(features.updatedAt));
    const ids = rows.map((r) => r.feature.id);
    const agg =
      ids.length === 0
        ? []
        : await this.db
            .select({
              featureId: featureSessions.featureId,
              sessionCount: count(featureSessions.id),
              totalCost: sum(featureSessions.cost),
              totalTokensInput: sum(featureSessions.tokensInput),
              totalTokensOutput: sum(featureSessions.tokensOutput),
            })
            .from(featureSessions)
            .where(inArray(featureSessions.featureId, ids))
            .groupBy(featureSessions.featureId);
    const byId = new Map(agg.map((a) => [a.featureId, a]));
    return rows.map(({ feature, projectName }) => ({
      ...feature,
      projectName,
      sessionCount: byId.get(feature.id)?.sessionCount ?? 0,
      totalCost: Number(byId.get(feature.id)?.totalCost ?? 0),
      totalTokensInput: Number(byId.get(feature.id)?.totalTokensInput ?? 0),
      totalTokensOutput: Number(byId.get(feature.id)?.totalTokensOutput ?? 0),
    }));
  }

  async findOne(id: string) {
    const row = await this.db
      .select({ feature: features, projectName: projects.name })
      .from(features)
      .innerJoin(projects, eq(projects.id, features.projectId))
      .where(eq(features.id, id))
      .then((r) => r[0]);
    if (!row) throw new NotFoundException("Feature not found");
    const sessions = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id))
      .orderBy(desc(featureSessions.createdAt));
    return { ...row.feature, projectName: row.projectName, sessions };
  }

  async update(id: string, patch: UpdateFeatureDto) {
    const parsed = updateFeatureSchema.safeParse(patch);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const rows = await this.db
      .update(features)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(features.id, id))
      .returning();
    if (rows.length === 0) throw new NotFoundException("Feature not found");
    return rows[0];
  }

  async remove(id: string) {
    await this.db.delete(features).where(eq(features.id, id));
    return { ok: true };
  }

  async linkSession(featureId: string, sessionId: string) {
    await this.findOne(featureId);
    await this.linkWithSubagents(featureId, sessionId);
    await this.db.update(features).set({ updatedAt: new Date() }).where(eq(features.id, featureId));
    return this.findOne(featureId);
  }

  async bulkLinkSessions(featureId: string, sessionIds: string[]) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new BadRequestException("sessionIds must be a non-empty array");
    }
    sessionIds = [...new Set(sessionIds)];
    await this.findOne(featureId);
    const linked: string[] = [];
    const skipped: string[] = [];
    for (const sessionId of sessionIds) {
      const s = this.reader.getSession(sessionId);
      if (!s) { skipped.push(sessionId); continue; }
      const added = await this.linkWithSubagents(featureId, sessionId);
      if (added.length > 0) linked.push(sessionId);
      else skipped.push(sessionId);
    }
    if (linked.length > 0) {
      await this.db.update(features).set({ updatedAt: new Date() }).where(eq(features.id, featureId));
    }
    return { linked, skipped };
  }

  async unlinkSession(featureId: string, sessionId: string) {
    await this.db
      .delete(featureSessions)
      .where(and(eq(featureSessions.featureId, featureId), eq(featureSessions.sessionId, sessionId)));
    await this.db.update(features).set({ updatedAt: new Date() }).where(eq(features.id, featureId));
    return { ok: true };
  }

  async resyncSession(featureId: string, sessionId: string) {
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const rows = await this.db
      .update(featureSessions)
      .set(this.snapshotValues(s))
      .where(and(eq(featureSessions.featureId, featureId), eq(featureSessions.sessionId, sessionId)))
      .returning();
    if (rows.length === 0) throw new NotFoundException("Session not linked to this feature");
    return this.findOne(featureId);
  }

  async reanalyze(id: string) {
    const feat = await this.findOne(id);
    const analyses = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id));
    const parentIds = analyses.map((s) => s.sessionId);
    if (parentIds.length === 0) return feat;
    const result = await this.llm.chatCompletion<{
      demandes: { label: string; description: string }[];
      enjeux: { label: string; description: string }[];
    }>([
      { role: "system", content: "Synthétise les demandes et enjeux de cette feature. Réponds UNIQUEMENT en JSON : {\"demandes\":[{label,description}],\"enjeux\":[{label,description}]}." },
      { role: "user", content: `Feature: ${feat.name}\nSessions:\n${JSON.stringify(parentIds)}` },
    ]);
    await this.db
      .update(features)
      .set({ demandes: result.demandes ?? [], enjeux: result.enjeux ?? [], updatedAt: new Date() })
      .where(eq(features.id, id));
    return this.findOne(id);
  }
}
```

- [ ] **Step 3: Rewrite `api/src/features/features.controller.ts`**

Same shape as today, with routes unchanged plus `reanalyze`:

```ts
@Post(":id/reanalyze")
reanalyze(@Param("id") id: string) {
  return this.svc.reanalyze(id);
}
```

The rest of the controller (list/findOne/create/update/remove/link/bulkLink/unlink/resync) is unchanged from the current file. `CreateFeatureDto`/`UpdateFeatureDto` import stays.

- [ ] **Step 4: Rewrite `api/src/features/features.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { FeaturesController } from "./features.controller";
import { FeaturesService } from "./features.service";

@Module({ controllers: [FeaturesController], providers: [FeaturesService] })
export class FeaturesModule {}
```

- [ ] **Step 5: Rewrite `api/src/features/features.service.spec.ts`**

Adapt the existing mock-based spec to the new signatures. `create` now requires `projectId` (uuid). Update `makeDb` results and assertions:

```ts
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FeaturesService } from "./features.service";

const readerMock = {
  getSession: jest.fn().mockReturnValue({
    id: "s1",
    projectId: "p1",
    projectName: "gateway",
    directory: "/home/user/gateway",
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
  getSubagentIds: jest.fn().mockReturnValue([]),
};

const llmMock = {
  chatCompletion: jest.fn().mockResolvedValue({ demandes: [], enjeux: [] }),
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
    innerJoin: () => chain,
  };
  return {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
  };
}

describe("FeaturesService", () => {
  it("create inserts a feature with projectId", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    const out = await svc.create({ name: "Auth", projectId: "p1" });
    expect(out.id).toBe("f1");
  });

  it("findOne throws NotFoundException when missing", async () => {
    const db = makeDb([]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    await expect(svc.findOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("update accepts null satisfaction/timeSpentMin", async () => {
    const db = makeDb([{ id: "f1" }]);
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    const out = await svc.update("f1", { satisfaction: null, timeSpentMin: null });
    expect(out.id).toBe("f1");
  });

  it("rejects status in create payload", async () => {
    const db = makeDb();
    const svc = new FeaturesService(db as any, readerMock as any, llmMock as any);
    await expect(
      svc.create({ name: "A", projectId: "p1", status: "done" } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @ia-dashboard/api test -- features.service.spec.ts`
Expected: PASS. Run full `pnpm --filter @ia-dashboard/api test` and `pnpm --filter @ia-dashboard/api typecheck`.

- [ ] **Step 7: Commit**

```bash
git add api/src/features
git commit -m "feat(api): features rework — project FK, no status, demandes/enjeux, reanalyze, subagent linking"
```

---

### Task 8: Sessions module extension (projectId filter, analysed status, analysis detail)

**Files:**
- Modify: `api/src/sessions/sessions.service.ts`
- Modify: `api/src/sessions/sessions.controller.ts`
- Test: `api/src/sessions/sessions.service.spec.ts`

**Interfaces:**
- Consumes: `projects`, `sessionAnalyses`, `featureSessions`; reader `listSessions`, `getSession`, `listModels`.
- Produces:
  - `SessionsService.list(filters)` where `filters` gains `projectId` (uuid), `analysed?: 'done'|'pending'|'error'|'not'`, `parentOnly`; returns items with `analysedStatus`, `analysed`, `featureId`, `projectId` (the pg project uuid).
  - `SessionsService.findOne(id)` → adds `analysedStatus`, `analysed`, `analysis` (the `session_analyses` row if present).
  - `SessionsService.meta()` → `{ projects: {id,name}[], models: string[] }`.

- [ ] **Step 1: Rewrite `api/src/sessions/sessions.service.spec.ts`**

```ts
import { SessionsService } from "./sessions.service";

const readerMock = {
  open: jest.fn(),
  listSessions: jest.fn().mockReturnValue({
    items: [
      { id: "s1", directory: "/p/gateway", model: "deepseek-v4-flash" },
      { id: "s2", directory: "/p/gateway", model: "deepseek-v4-flash" },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s3", title: "T", directory: "/p/gateway" }),
  listProjects: jest.fn().mockReturnValue([{ id: "p1", name: "gateway" }]),
  listModels: jest.fn().mockReturnValue(["deepseek-v4-flash"]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
  };
  return { select: jest.fn(() => chain) };
};

describe("SessionsService", () => {
  it("returns annotated flag via annotatedMap", async () => {
    const db = mkDb([{ sessionId: "s1", featureId: "f1" }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const map = await svc.annotatedMap(["s1", "s2"]);
    expect(map.s1).toBe("f1");
    expect(map.s2).toBeNull();
  });

  it("delegates list to the reader", async () => {
    const db = mkDb([], [], []);
    const svc = new SessionsService(readerMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.total).toBe(2);
    expect(readerMock.listSessions).toHaveBeenCalledWith({ page: 1 });
  });

  it("list resolves projectId from directory and analysis status", async () => {
    const db = mkDb(
      [], // annotatedMap (featureSessions rows)
      [], // analysisMap (sessionAnalyses rows)
      [{ id: "p1", directory: "/p/gateway" }], // projects lookup for directory->id
    );
    const svc = new SessionsService(readerMock as any, db as any);
    const page = await svc.list({ page: 1 });
    expect(page.items[0].projectId).toBe("p1");
    expect(page.items[0].analysedStatus).toBe("none");
    expect(page.items[0].analysed).toBe(false);
  });

  it("findOne annotates the session when linked", async () => {
    const db = mkDb([{ featureId: "f9" }], []);
    const svc = new SessionsService(readerMock as any, db as any);
    const out = await svc.findOne("s3");
    expect(out?.annotated).toBe(true);
    expect(out?.featureId).toBe("f9");
  });

  it("analysisFor returns the stored analysis", async () => {
    const db = mkDb([{ sessionId: "s1", status: "done", summary: "x" }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const a = await svc.analysisFor("s1");
    expect(a?.status).toBe("done");
  });

  it("meta returns projects as id/name pairs from pg", async () => {
    const db = mkDb([{ id: "p1", name: "gateway", stale: false }]);
    const svc = new SessionsService(readerMock as any, db as any);
    const meta = await svc.meta();
    expect(meta.projects).toEqual([{ id: "p1", name: "gateway" }]);
    expect(meta.models).toEqual(["deepseek-v4-flash"]);
  });
});
```

> Note: `SessionsService.meta()` is now `async` (queries the pg `projects` table). Update the `meta()` controller call site accordingly (it already awaits through NestJS).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- sessions.service.spec.ts`
Expected: FAIL (meta returns plain names / not async / new fields missing).

- [ ] **Step 3: Rewrite `api/src/sessions/sessions.service.ts`**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { featureSessions, projects, sessionAnalyses } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async annotatedMap(sessionIds: string[]): Promise<Record<string, string | null>> {
    if (sessionIds.length === 0) return {};
    const rows = await this.db
      .select({ sessionId: featureSessions.sessionId, featureId: featureSessions.featureId })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, sessionIds));
    const map: Record<string, string | null> = {};
    for (const id of sessionIds) map[id] = null;
    for (const r of rows) map[r.sessionId] = r.featureId;
    return map;
  }

  async analysisMap(sessionIds: string[]): Promise<Record<string, SessionAnalysisStatus>> {
    if (sessionIds.length === 0) return {};
    const rows = await this.db
      .select({ sessionId: sessionAnalyses.sessionId, status: sessionAnalyses.status })
      .from(sessionAnalyses)
      .where(inArray(sessionAnalyses.sessionId, sessionIds));
    const map: Record<string, SessionAnalysisStatus> = {};
    for (const id of sessionIds) map[id] = "none";
    for (const r of rows) map[r.sessionId] = r.status;
    return map;
  }

  async list(filters: SessionListFilters & { projectId?: string }) {
    if (filters.projectId) {
      const p = await this.db.select().from(projects).where(eq(projects.id, filters.projectId)).then((r) => r[0]);
      filters.directory = p?.directory ?? filters.directory;
    }
    const page = this.reader.listSessions(filters);
    const [map, amap] = await Promise.all([
      this.annotatedMap(page.items.map((i) => i.id)),
      this.analysisMap(page.items.map((i) => i.id)),
    ]);
    const byDir = new Map((await this.db.select().from(projects)).map((p) => [p.directory, p.id]));
    let items = page.items.map((i) => {
      const analysedStatus = amap[i.id] ?? "none";
      return {
        ...i,
        annotated: map[i.id] != null,
        featureId: map[i.id] ?? null,
        projectId: byDir.get(i.directory) ?? null,
        analysedStatus,
        analysed: analysedStatus === "done",
      };
    });
    if (filters.analysed === "yes") items = items.filter((i) => i.analysedStatus === "done");
    else if (filters.analysed === "no") items = items.filter((i) => i.analysedStatus === "none");
    return { ...page, total: items.length, items };
  }

  async findOne(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const rows = await this.db
      .select({ featureId: featureSessions.featureId })
      .from(featureSessions)
      .where(eq(featureSessions.sessionId, id));
    const analysis = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, id))
      .then((r) => r[0] ?? null);
    return {
      ...session,
      annotated: rows.length > 0,
      featureId: rows[0]?.featureId ?? null,
      analysedStatus: analysis?.status ?? "none",
      analysed: analysis?.status === "done",
      analysis,
    };
  }

  async analysisFor(id: string) {
    const rows = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, id));
    return rows[0] ?? null;
  }

  async meta() {
    const rows = await this.db.select().from(projects).where(eq(projects.stale, false));
    return {
      projects: rows.map((p) => ({ id: p.id, name: p.name })),
      models: this.reader.listModels(),
    };
  }
}

type SessionAnalysisStatus = "none" | "pending" | "analyzing" | "done" | "error";
```

- [ ] **Step 4: Update `api/src/sessions/sessions.controller.ts`**

Pass through new filters and handle `analysed` values `yes`/`no`/`pending`/`error`:

```ts
@Get()
async index(@Query() q: Record<string, string>) {
  const filters: SessionListFilters & { projectId?: string } = {
    project: q.project,
    projectId: q.projectId,
    directory: q.directory,
    model: q.model,
    from: q.from,
    to: q.to,
    annotated: q.annotated as SessionListFilters["annotated"],
    analysed: q.analysed,
    parentOnly: q.parentOnly === "true",
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  };
  return this.svc.list(filters);
}
```

Add the dedicated analysis route (spec: `GET /api/sessions/:id/analysis`):

```ts
@Get(":id/analysis")
analysis(@Param("id") id: string) {
  return this.svc.analysisFor(id);
}
```

`meta()` and `findOne()` routes unchanged.

- [ ] **Step 5: Update `api/src/opencode/opencode.types.ts`** — add `analysed?: string` and `projectId` is NOT a reader concept, so keep it in the controller/service types only:

```ts
export interface SessionListFilters {
  project?: string;
  directory?: string;
  model?: string;
  from?: string;
  to?: string;
  annotated?: "yes" | "no";
  analysed?: string;
  parentOnly?: boolean;
  page?: number;
  pageSize?: number;
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @ia-dashboard/api test` and `pnpm --filter @ia-dashboard/api typecheck`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/sessions api/src/opencode/opencode.types.ts
git commit -m "feat(api): sessions — projectId/analysed/parentOnly filters, analysis detail, meta id+name"
```

---

### Task 9: Dashboard summary endpoint

**Files:**
- Create: `api/src/dashboard/dashboard.service.ts`
- Create: `api/src/dashboard/dashboard.controller.ts`
- Create: `api/src/dashboard/dashboard.module.ts`
- Test: `api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Consumes: reader `aggregateAll`, `aggregateByDirectory`, `aggregateByModel`, `aggregateByDay`; `sessionAnalyses`, `features` counts.
- Produces:
  - `DashboardService.summary(periodDays = 7): Promise<DashboardSummary>` where `DashboardSummary = { periodDays, totalCost, tokensInput, tokensOutput, sessionCount, analysedCount, featureCount, byProject, byModel, byDay }`.

- [ ] **Step 1: Write the failing test**

Create `api/src/dashboard/dashboard.service.spec.ts`:

```ts
import { DashboardService } from "./dashboard.service";

const readerMock = {
  aggregateAll: jest.fn().mockReturnValue({ totalCost: 10, tokensInput: 20, tokensOutput: 30, sessions: 4 }),
  aggregateByDirectory: jest.fn().mockReturnValue([{ directory: "/p/gateway", name: "gateway", totalCost: 10 }]),
  aggregateByModel: jest.fn().mockReturnValue([{ model: "deepseek-v4-flash", totalCost: 10 }]),
  aggregateByDay: jest.fn().mockReturnValue([{ day: "2026-08-27", totalCost: 10 }]),
};

const mkDb = (...results: unknown[]) => {
  let i = 0;
  const chain: any = {
    then: (resolve: (v: any) => void) => resolve(results[i++] ?? []),
    from: () => chain,
    where: () => chain,
  };
  return { select: jest.fn(() => chain) };
};

describe("DashboardService", () => {
  it("summary aggregates live metrics plus analysed/feature counts", async () => {
    const db = mkDb(
      [{ c: 3 }], // analysed count
      [{ c: 5 }], // feature count
      [{ id: "p1", directory: "/p/gateway" }], // projects id-by-directory
    );
    const svc = new DashboardService(readerMock as any, db as any);
    const out = await svc.summary(7);
    expect(out.totalCost).toBe(10);
    expect(out.analysedCount).toBe(3);
    expect(out.featureCount).toBe(5);
    expect(out.byProject[0].name).toBe("gateway");
    expect(out.byProject[0].id).toBe("p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test -- dashboard.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `api/src/dashboard/dashboard.service.ts`**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { count, sql } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { features, projects, sessionAnalyses } from "../db/schema";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async summary(periodDays = 7) {
    const from = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const all = this.reader.aggregateAll({ from });
    const [analysedCount, featureCount, projectRows] = await Promise.all([
      this.db.select({ c: count() }).from(sessionAnalyses).where(sql`status = 'done'`).then((r) => Number(r[0]?.c ?? 0)),
      this.db.select({ c: count() }).from(features).then((r) => Number(r[0]?.c ?? 0)),
      this.db.select({ id: projects.id, directory: projects.directory }).from(projects),
    ]);
    const idByDir = new Map(projectRows.map((p) => [p.directory, p.id]));
    return {
      periodDays,
      ...all,
      analysedCount,
      featureCount,
      byProject: this.reader.aggregateByDirectory({ from }).map((a) => ({ ...a, id: idByDir.get(a.directory) ?? null })),
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
    };
  }
}
```

- [ ] **Step 4: Write `api/src/dashboard/dashboard.controller.ts`**

```ts
import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get("summary")
  summary(@Query("periodDays") periodDays?: string) {
    const days = periodDays ? Math.max(1, Number(periodDays)) : 7;
    return this.svc.summary(days);
  }
}
```

- [ ] **Step 5: Write `api/src/dashboard/dashboard.module.ts`** and register in `app.module.ts`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @ia-dashboard/api test` and `pnpm --filter @ia-dashboard/api typecheck`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/dashboard api/src/app.module.ts
git commit -m "feat(api): dashboard summary endpoint (live aggregates + analysed/feature counts)"
```

---

### Task 10: Apply the DB migration

**Files:**
- Run: migration against local PG.

- [ ] **Step 1: Apply the reset migration**

Run: `pnpm --filter @ia-dashboard/api db:migrate`
Expected: "migrations applied". The old `features`/`feature_sessions` tables are dropped and the new schema is created.

- [ ] **Step 2: Verify schema**

Run: `psql postgres://ia:ia@localhost:5433/ia_dashboard -c '\dt'` (or via the API boot). Expected: the five new tables exist.

- [ ] **Step 3: Boot the API and smoke-test endpoints**

Run the API (`pnpm --filter @ia-dashboard/api start:dev` or `pnpm dev`) and hit:
- `GET /api/health` → 200
- `GET /api/projects` → list derived from real `opencode.db`
- `GET /api/dashboard/summary` → KPIs
- `GET /api/sessions?parentOnly=true` → parent sessions

Expected: 200s with real data. The analysis worker may start queuing recent sessions (that's expected; LLM calls will run against OpenCode Zen with the key from `auth.json`).

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(api): apply reset migration and verify endpoints"
```

---

### Task 11: Webapp — Redux slices (dashboard, projects, proposals; adapt sessions/features)

**Files:**
- Create: `webapp/src/store/dashboard.ts`
- Create: `webapp/src/store/projects.ts`
- Create: `webapp/src/store/proposals.ts`
- Modify: `webapp/src/store/sessions.ts`
- Modify: `webapp/src/store/features.ts`
- Modify: `webapp/src/store/store.ts`
- Modify: `webapp/src/api/client.ts`
- Test: `webapp/src/store/dashboard.spec.ts`

**Interfaces:**
- Consumes: existing `apiMiddleware` (`*_REQUESTED` → `*_START/_SUCCESS/_ERROR`), existing slices pattern.
- Produces:
  - `dashboard` slice state `{ summary: DashboardSummary | null, periodDays: number, loading, error }`.
  - `projects` slice state `{ items: ProjectRow[], current: ProjectDetail | null, loading, error }`.
  - `proposals` slice state `{ items: Proposal[], loading, error }`.
  - `sessions` slice gains `analysedStatus`, `projectId`, `directory`, `isSubagent` in `SessionRow`; meta becomes `{ projects: {id,name}[], models: string[] }`.
  - `features` slice unchanged shape but rows now carry `projectName`, `demandes`, `enjeux`.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/store/dashboard.spec.ts`:

```ts
import { dashboardReducer } from "./dashboard";

describe("dashboard reducer", () => {
  it("stores summary on success", () => {
    const state = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_SUCCESS",
      payload: { data: { totalCost: 10 } },
    });
    expect(state.summary?.totalCost).toBe(10);
    expect(state.loading).toBe(false);
  });

  it("sets loading on request", () => {
    const state = dashboardReducer(undefined as any, {
      type: "DASHBOARD_LOAD_REQUESTED",
      payload: { periodDays: 30 },
    });
    expect(state.loading).toBe(true);
    expect(state.periodDays).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/webapp test -- dashboard.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `webapp/src/store/dashboard.ts`**

```ts
export interface DashboardSummary {
  periodDays: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessionCount: number;
  analysedCount: number;
  featureCount: number;
  byProject: { name: string; totalCost: number; sessions: number; tokensInput: number; tokensOutput: number }[];
  byModel: { model: string; totalCost: number; sessions: number }[];
  byDay: { day: string; totalCost: number; sessions: number }[];
}

interface DashboardState {
  summary: DashboardSummary | null;
  periodDays: number;
  loading: boolean;
  error: string | null;
}

const initial: DashboardState = { summary: null, periodDays: 7, loading: false, error: null };

export function dashboardReducer(state: DashboardState = initial, action: any): DashboardState {
  switch (action.type) {
    case "DASHBOARD_LOAD_REQUESTED":
      return { ...state, loading: true, error: null, periodDays: action.payload?.periodDays ?? state.periodDays };
    case "DASHBOARD_LOAD_SUCCESS":
      return { ...state, loading: false, summary: action.payload.data };
    case "DASHBOARD_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Write `webapp/src/store/projects.ts`**

```ts
export interface ProjectRow {
  id: string;
  name: string;
  directory: string;
  stale: boolean;
  firstSeen: string;
  lastSeen: string;
  sessionCount: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface Proposal {
  id: string;
  projectId: string;
  name: string;
  purpose: string | null;
  sessionIds: string[];
  demandes: { label: string; description: string }[];
  enjeux: { label: string; description: string }[];
  rationale: string | null;
  status: "pending" | "accepted" | "dismissed" | "stale";
  createdAt: string;
}

export interface ProjectDetail extends ProjectRow {
  byModel: { model: string; totalCost: number; sessions: number }[];
  ungroupedSessions: number;
  features: any[];
  proposals: Proposal[];
}

interface ProjectsState {
  items: ProjectRow[];
  current: ProjectDetail | null;
  loading: boolean;
  error: string | null;
}

const initial: ProjectsState = { items: [], current: null, loading: false, error: null };

export function projectsReducer(state: ProjectsState = initial, action: any): ProjectsState {
  switch (action.type) {
    case "PROJECTS_LOAD_REQUESTED":
    case "PROJECT_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "PROJECTS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "PROJECT_LOAD_SUCCESS":
      return { ...state, loading: false, current: action.payload.data };
    case "PROJECTS_LOAD_ERROR":
    case "PROJECT_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
```

- [ ] **Step 5: Write `webapp/src/store/proposals.ts`**

```ts
import { Proposal } from "./projects";

interface ProposalsState {
  items: Proposal[];
  loading: boolean;
  error: string | null;
}

const initial: ProposalsState = { items: [], loading: false, error: null };

export function proposalsReducer(state: ProposalsState = initial, action: any): ProposalsState {
  switch (action.type) {
    case "PROPOSALS_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "PROPOSALS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "PROPOSALS_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
```

- [ ] **Step 6: Update `webapp/src/store/sessions.ts`**

Add to `SessionRow`: `projectId: string | null`, `directory: string`, `isSubagent: boolean`, `analysedStatus: "none" | "pending" | "analyzing" | "done" | "error"`, `analysed: boolean`. Change `meta` type to `{ projects: { id: string; name: string }[]; models: string[] }`. Update `initial.meta`.

> The three views that render `meta.projects` (`SessionsView` Filters, `SessionActions`, `BulkLinkModal`) currently iterate `meta.projects` as `string[]` (`value={p}`). Update each to iterate the `{id,name}` shape in the same commit so typecheck stays green: options become `value={p.id}` with label `{p.name}`, and `SessionActions`/`BulkLinkModal` initialize `project`/`projectId` state from `meta.projects[0]?.id ?? ""`. (Behavioral wiring to `projectId` is finalized in Tasks 14–15; here only the rendering/typing.)

- [ ] **Step 7: Update `webapp/src/store/features.ts`** — keep shape; rows now include `projectName`, `demandes`, `enjeux`. No code change required beyond types (slice is `any[]`); leave as-is.

- [ ] **Step 8: Update `webapp/src/store/store.ts`**

```ts
import { configureStore } from "@reduxjs/toolkit";
import { apiMiddleware } from "./apiMiddleware";
import { sessionsReducer } from "./sessions";
import { featuresReducer } from "./features";
import { dashboardReducer } from "./dashboard";
import { projectsReducer } from "./projects";
import { proposalsReducer } from "./proposals";

export const store = configureStore({
  reducer: {
    sessions: sessionsReducer,
    features: featuresReducer,
    dashboard: dashboardReducer,
    projects: projectsReducer,
    proposals: proposalsReducer,
  },
  middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 9: Update `webapp/src/api/client.ts`**

Add:

```ts
dashboard: (periodDays: number) => apiFetch<any>(`/api/dashboard/summary?periodDays=${periodDays}`),
projects: () => apiFetch<any>(`/api/projects`),
project: (id: string) => apiFetch<any>(`/api/projects/${id}`),
proposals: (projectId?: string) =>
  apiFetch<any>(`/api/analysis/proposals${projectId ? `?projectId=${projectId}` : ""}`),
acceptProposal: (id: string, body: { name?: string; purpose?: string }) =>
  apiFetch<any>(`/api/proposals/${id}/accept`, { method: "POST", body: JSON.stringify(body) }),
dismissProposal: (id: string) =>
  apiFetch<any>(`/api/proposals/${id}/dismiss`, { method: "POST" }),
runAnalysis: (sessionId: string) =>
  apiFetch<any>(`/api/analysis/run`, { method: "POST", body: JSON.stringify({ sessionId }) }),
runProjectClustering: (projectId: string) =>
  apiFetch<any>(`/api/analysis/run-project`, { method: "POST", body: JSON.stringify({ projectId }) }),
sessionAnalysis: (id: string) => apiFetch<any>(`/api/sessions/${id}/analysis`),
reanalyzeFeature: (id: string) =>
  apiFetch<any>(`/api/features/${id}/reanalyze`, { method: "POST" }),
```

Note: `run-project` endpoint is registered in Task 11 step below on the controller (add `POST /api/analysis/run-project` to `AnalysisController` calling `clusterProject(body.projectId)`).

- [ ] **Step 10: Add `run-project` route** — in `api/src/analysis/analysis.controller.ts`, add:

```ts
@Post("analysis/run-project")
runProject(@Body() body: { projectId: string }) {
  return this.svc.clusterProject(body.projectId);
}
```

- [ ] **Step 11: Run tests**

Run: `pnpm --filter @ia-dashboard/webapp test -- dashboard.spec.ts`
Expected: PASS. Run `pnpm --filter @ia-dashboard/webapp typecheck`.

- [ ] **Step 12: Commit**

```bash
git add webapp/src/store webapp/src/api/client.ts api/src/analysis/analysis.controller.ts
git commit -m "feat(webapp): redux slices dashboard/projects/proposals + api client extensions"
```

---

### Task 12: Webapp — Dashboard view (home)

**Files:**
- Create: `webapp/src/views/DashboardView.tsx`
- Create: `webapp/src/components/ui/KpiCard.tsx`
- Create: `webapp/src/components/ui/BarList.tsx`
- Modify: `webapp/src/App.tsx` (route `/` → DashboardView)
- Test: `webapp/src/views/DashboardView.spec.tsx`

**Interfaces:**
- Consumes: `RootState.dashboard`; `api.dashboard`.
- Produces: `<DashboardView />` rendered at `/`.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/views/DashboardView.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { dashboardReducer } from "../store/dashboard";
import { DashboardView } from "./DashboardView";

const store = configureStore({
  reducer: { dashboard: dashboardReducer },
  middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
  preloadedState: {
    dashboard: {
      periodDays: 7,
      loading: false,
      error: null,
      summary: {
        periodDays: 7,
        totalCost: 12.34,
        tokensInput: 1000,
        tokensOutput: 2000,
        sessionCount: 42,
        analysedCount: 10,
        featureCount: 3,
        byProject: [{ name: "gateway", totalCost: 5, sessions: 2, tokensInput: 100, tokensOutput: 200 }],
        byModel: [{ model: "deepseek-v4-flash", totalCost: 12.34, sessions: 42 }],
        byDay: [{ day: "2026-08-27", totalCost: 12.34, sessions: 42 }],
      },
    },
  },
});

test("renders KPIs and project list", () => {
  render(
    <Provider store={store}>
      <DashboardView />
    </Provider>,
  );
  expect(screen.getByText("12.34 €")).toBeTruthy();
  expect(screen.getByText("gateway")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/webapp test -- DashboardView.spec.tsx`
Expected: FAIL (no `@testing-library/react` yet — install it in Step 3; or module missing).

- [ ] **Step 3: Install testing-library**

Run: `pnpm --filter @ia-dashboard/webapp add -D @testing-library/react @testing-library/jest-dom`

- [ ] **Step 4: Write `webapp/src/components/ui/KpiCard.tsx`**

```tsx
export function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-sm text-gray-500">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Write `webapp/src/components/ui/BarList.tsx`**

```tsx
import { Link } from "react-router-dom";

export function BarList({
  rows,
  valueOf,
  labelOf,
  to,
  valueSuffix = "€",
}: {
  rows: any[];
  valueOf: (r: any) => number;
  labelOf: (r: any) => string;
  to?: (r: any) => string | undefined;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const href = to?.(r);
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-40 truncate text-sm text-gray-700" title={labelOf(r)}>
              {href ? (
                <Link className="text-blue-600 hover:underline" to={href}>
                  {labelOf(r)}
                </Link>
              ) : (
                labelOf(r)
              )}
            </div>
            <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded bg-blue-500"
                style={{ width: `${(valueOf(r) / max) * 100}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm tabular-nums text-gray-700">
              {valueOf(r).toFixed(2)} {valueSuffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Write `webapp/src/views/DashboardView.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { api } from "../api/client";
import { KpiCard } from "../components/ui/KpiCard";
import { BarList } from "../components/ui/BarList";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export function DashboardView() {
  const dispatch = useDispatch();
  const { summary, periodDays, loading, error } = useSelector((s: RootState) => s.dashboard);
  const [days, setDays] = useState(periodDays);

  const load = (d: number) => {
    setDays(d);
    dispatch({ type: "DASHBOARD_LOAD_REQUESTED", payload: { path: `/api/dashboard/summary?periodDays=${d}`, periodDays: d } });
  };

  useEffect(() => {
    load(periodDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Coûts & tokens OpenCode" />
      <div className="mb-4 flex gap-2">
        <Button variant={days === 7 ? "primary" : "secondary"} onClick={() => load(7)}>7 jours</Button>
        <Button variant={days === 30 ? "primary" : "secondary"} onClick={() => load(30)}>30 jours</Button>
      </div>
      {error && <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {loading && !summary && <p className="text-sm text-gray-500">Chargement…</p>}
      {summary && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Coût total" value={`${summary.totalCost.toFixed(2)} €`} />
            <KpiCard label="Tokens in" value={summary.tokensInput.toLocaleString()} />
            <KpiCard label="Tokens out" value={summary.tokensOutput.toLocaleString()} />
            <KpiCard label="Sessions" value={String(summary.sessionCount)} sub={`${summary.periodDays} jours`} />
            <KpiCard label="Analysées / Features" value={`${summary.analysedCount} / ${summary.featureCount}`} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par projet</h3>
              <BarList
                rows={summary.byProject}
                valueOf={(r) => r.totalCost}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par modèle</h3>
              <BarList rows={summary.byModel} valueOf={(r) => r.totalCost} labelOf={(r) => r.model} />
            </Card>
          </div>
          <Card className="mt-4 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Sessions par jour</h3>
            <div className="flex items-end gap-1">
              {summary.byDay.map((d) => (
                <div key={d.day} className="flex-1 text-center" title={`${d.day}: ${d.sessions}`}>
                  <div className="text-[10px] text-gray-500">{d.sessions}</div>
                  <div
                    className="mx-auto w-full rounded-t bg-blue-400"
                    style={{ height: `${Math.max(2, d.sessions * 6)}px` }}
                  />
                  <div className="mt-1 text-[10px] text-gray-400">{d.day.slice(8)}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Update `webapp/src/App.tsx` routes**

- Import `DashboardView`; add `<Route path="/" element={<DashboardView />} />` (replace the current `/` → SessionsView) and a `Dashboard` NavLink. Keep `/sessions`, `/features`, `/features/:id`. Add later `/projects`, `/projects/:id` in Task 13.

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @ia-dashboard/webapp test` and `pnpm --filter @ia-dashboard/webapp typecheck`.
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add webapp/src/views/DashboardView.tsx webapp/src/components/ui/KpiCard.tsx webapp/src/components/ui/BarList.tsx webapp/src/App.tsx webapp/package.json
git commit -m "feat(webapp): dashboard home view with KPIs and bar charts"
```

---

### Task 13: Webapp — Projects list + Project detail (proposals)

**Files:**
- Create: `webapp/src/views/ProjectsView.tsx`
- Create: `webapp/src/views/ProjectDetail.tsx`
- Modify: `webapp/src/App.tsx` (routes `/projects`, `/projects/:id`)

**Interfaces:**
- Consumes: `RootState.projects`, `api.projects`, `api.project`, `api.acceptProposal`, `api.dismissProposal`, `api.runProjectClustering`.

- [ ] **Step 1: Write `webapp/src/views/ProjectsView.tsx`**

```tsx
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";

export function ProjectsView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.projects);

  useEffect(() => {
    dispatch({ type: "PROJECTS_LOAD_REQUESTED", payload: { path: "/api/projects" } });
  }, [dispatch]);

  return (
    <div>
      <PageHeader title="Projets" subtitle={`${items.length} projets`} />
      {error && <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {items.length === 0 && !loading ? (
        <EmptyState message="Aucun projet dérivé des sessions." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="block">
              <Card className="p-4 transition hover:border-gray-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">{p.name}</span>
                  {p.stale && <span className="text-xs text-amber-600">stale</span>}
                </div>
                <div className="mt-1 truncate text-sm text-gray-500" title={p.directory}>{p.directory}</div>
                <div className="mt-1 text-sm text-gray-700">
                  {p.sessionCount} sessions · {p.totalCost.toFixed(2)} € · {p.tokensInput.toLocaleString()} tok
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {loading && <p className="mt-2 text-sm text-gray-500">Chargement…</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `webapp/src/views/ProjectDetail.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.projects);

  const reload = () =>
    dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });

  useEffect(() => {
    if (id) dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });
  }, [dispatch, id]);

  const recluster = async () => {
    if (id) await api.runProjectClustering(id);
    reload();
  };

  if (loading && !current)
    return <div className="flex items-center gap-2 p-6 text-gray-500"><Spinner /> Chargement…</div>;
  if (!current) return <p className="p-6">Projet introuvable</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div>
      <Link to="/projects" className="text-sm text-blue-600 hover:underline">← Projets</Link>
      <PageHeader title={current.name} subtitle={current.directory} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3"><div className="text-xs uppercase text-gray-500">Coût</div><div className="text-lg font-semibold tabular-nums">{current.totalCost.toFixed(2)} €</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-gray-500">Sessions</div><div className="text-lg font-semibold tabular-nums">{current.sessionCount}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-gray-500">Features</div><div className="text-lg font-semibold tabular-nums">{current.features.length}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-gray-500">Non groupées</div><div className="text-lg font-semibold tabular-nums">{current.ungroupedSessions}</div></Card>
      </div>

      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={recluster}>Reclustering du projet</Button>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Propositions de features</h2>
      {current.proposals.filter((p) => p.status === "pending").length === 0 && (
        <p className="mb-2 text-sm text-gray-500">Aucune proposition en attente.</p>
      )}
      <div className="space-y-3">
        {current.proposals
          .filter((p) => p.status === "pending")
          .map((p) => (
            <ProposalCard key={p.id} proposal={p} onChanged={reload} />
          ))}
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Features</h2>
      <div className="space-y-2">
        {current.features.map((f) => (
          <Link key={f.id} to={`/features/${f.id}`} className="block">
            <Card className="p-3 transition hover:border-gray-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{f.name}</span>
                <span className="text-sm text-gray-500">{f.demandes?.length ?? 0} demandes</span>
              </div>
              {f.purpose && <p className="mt-1 text-sm text-gray-600">{f.purpose}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProposalCard({ proposal, onChanged }: { proposal: any; onChanged: () => void }) {
  const [name, setName] = useState(proposal.name);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    await api.acceptProposal(proposal.id, { name });
    setBusy(false);
    onChanged();
  };
  const dismiss = async () => {
    setBusy(true);
    await api.dismissProposal(proposal.id);
    setBusy(false);
    onChanged();
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <TextInput className="max-w-sm font-semibold" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="danger" onClick={dismiss} disabled={busy}>Écarter</Button>
          <Button variant="primary" onClick={accept} disabled={busy} loading={busy}>Accepter</Button>
        </div>
      </div>
      {proposal.purpose && <p className="mt-2 text-sm text-gray-600">{proposal.purpose}</p>}
      {proposal.rationale && <p className="mt-1 text-xs text-gray-400">{proposal.rationale}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {proposal.sessionIds.map((sid: string) => (
          <span key={sid} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{sid.slice(0, 8)}</span>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Update `App.tsx`** — add routes `/projects` → `<ProjectsView />` and `/projects/:id` → `<ProjectDetail />`, plus a `Projets` NavLink.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/views/ProjectsView.tsx webapp/src/views/ProjectDetail.tsx webapp/src/App.tsx
git commit -m "feat(webapp): projects list + detail with proposal accept/dismiss/recluster"
```

---

### Task 14: Webapp — Features adapt (no status, demandes/enjeux, reanalyze)

**Files:**
- Modify: `webapp/src/views/FeaturesView.tsx`
- Modify: `webapp/src/views/FeatureDetail.tsx`
- Modify: `webapp/src/views/FeatureForm.tsx`
- Modify: `webapp/src/views/BulkLinkModal.tsx` (projectId instead of project name)
- Modify: `webapp/src/views/SessionActions.tsx` (projectId)
- Modify: `webapp/src/store/sessions.ts` (selection eligibility unchanged)

**Interfaces:**
- Consumes: existing feature views; new API `reanalyzeFeature`.

- [ ] **Step 1: Update `FeaturesView.tsx`**

Remove the `statusTone` map and status badge; show `projectName` and a demandes count:

Replace the card body with:

```tsx
<div className="flex items-center justify-between gap-2">
  <span className="truncate font-semibold text-gray-900">{f.name}</span>
  <Badge tone="blue">{f.projectName}</Badge>
</div>
<div className="mt-1 text-sm text-gray-600">
  {f.sessionCount} sessions · {f.demandes?.length ?? 0} demandes
</div>
```

(Remove the status Badge line.)

- [ ] **Step 2: Update `FeatureDetail.tsx`**

- Replace `PageHeader` subtitle `${current.project} · ${current.status}` → `${current.projectName}`.
- Remove the satisfaction/time/comment/tags display? Keep them (still valid), remove nothing qualitative. Remove the status mention only (there is none in detail).
- Add a `demandes`/`enjeux` section after Purpose:

```tsx
{current.demandes?.length > 0 && (
  <div className="mb-4">
    <h3 className="text-sm font-semibold text-gray-900">Demandes</h3>
    <ul className="mt-1 space-y-1 text-sm text-gray-700">
      {current.demandes.map((d: any, i: number) => (
        <li key={i}><b>{d.label}</b>{d.description ? ` — ${d.description}` : ""}</li>
      ))}
    </ul>
  </div>
)}
{current.enjeux?.length > 0 && (
  <div className="mb-4">
    <h3 className="text-sm font-semibold text-gray-900">Enjeux</h3>
    <ul className="mt-1 space-y-1 text-sm text-gray-700">
      {current.enjeux.map((e: any, i: number) => (
        <li key={i}><b>{e.label}</b>{e.description ? ` — ${e.description}` : ""}</li>
      ))}
    </ul>
  </div>
)}
```

- Add a "Re-synthétiser" button next to the FeatureForm or after it:

```tsx
<Button variant="secondary" onClick={async () => { await api.reanalyzeFeature(current.id); reload(); }}>
  Re-synthétiser
</Button>
```

- [ ] **Step 3: Update `FeatureForm.tsx`**

Remove the `status` state and its `Select` field. Keep the rest. The `updateFeature` call drops `status`.

- [ ] **Step 4: Update `BulkLinkModal.tsx`** — change `project` (string) to `projectId`; meta.projects now `{id,name}[]`. In the "new" tab, `createFeature({ projectId, name, purpose, satisfaction })`. Initial value `meta.projects[0]?.id ?? ""`.

- [ ] **Step 5: Update `SessionActions.tsx`** — same change: `project` state → `projectId`; `createFeature` sends `projectId`; default `meta.projects[0]?.id ?? ""`.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @ia-dashboard/webapp typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/views/FeaturesView.tsx webapp/src/views/FeatureDetail.tsx webapp/src/views/FeatureForm.tsx webapp/src/views/BulkLinkModal.tsx webapp/src/views/SessionActions.tsx
git commit -m "feat(webapp): features views adapt — projectName, demandes/enjeux, reanalyze, projectId links"
```

---

### Task 15: Webapp — Sessions view adapt (filters, analyse button, badges)

**Files:**
- Modify: `webapp/src/views/SessionsView.tsx`
- Modify: `webapp/src/store/sessions.ts`

**Interfaces:**
- Consumes: `api.runAnalysis`, `RootState.sessions` with new fields.

- [ ] **Step 1: Update `SessionsView.tsx`**

- Project filter options now from `meta.projects` as `{id,name}`; the filter sends `projectId`.
- Add "analysed" filter: values `yes` (done), `no` (none), `pending`, `error`, or empty.
- Add a "subagents" toggle: a checkbox "Cacher subagents" default checked → adds `parentOnly=true`.
- Badge column: show `AnalysisBadge` (✓ analysée / ⏳ / ! erreur / gris non analysée) + the existing annotated badge + feature link.

Create `webapp/src/components/ui/AnalysisBadge.tsx`:

```tsx
import { Badge } from "./Badge";

export function AnalysisBadge({ status }: { status: string }) {
  switch (status) {
    case "done":
      return <Badge tone="green">✓ analysée</Badge>;
    case "pending":
    case "analyzing":
      return <Badge tone="amber">⏳ {status}</Badge>;
    case "error":
      return <Badge tone="red">! erreur</Badge>;
    default:
      return <Badge tone="gray">non analysée</Badge>;
  }
}
```

- Row action: replace "annotate / link" button with a dropdown of two actions: "Analyser" (if `analysedStatus !== 'done'`) and "Annoter / lier". Implement with two small buttons.

```tsx
<td className="whitespace-nowrap px-3 py-2 text-right">
  <div className="flex justify-end gap-1">
    {s.analysedStatus !== "done" && (
      <Button variant="ghost" onClick={() => runAnalysis(s)}>analyser</Button>
    )}
    <Button variant="ghost" onClick={() => setSingle(s)}>annotate / link</Button>
  </div>
</td>
```

where:

```tsx
const runAnalysis = async (s: SessionRow) => {
  await api.runAnalysis(s.id);
  reload();
};
```

Add `import { api } from "../api/client";`.

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm --filter @ia-dashboard/webapp typecheck` and `pnpm --filter @ia-dashboard/webapp test`.
Expected: PASS (existing `selection.spec`/`sessions.spec` may need minor updates if they assert on SessionRow fields — update them to include the new fields in fixtures).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/views/SessionsView.tsx webapp/src/components/ui/AnalysisBadge.tsx webapp/src/store/sessions.ts
git commit -m "feat(webapp): sessions — analysis badge, analyse button, projectId/analysed/parentOnly filters"
```

---

### Task 16: Webapp — App routing & sidebar finalization

**Files:**
- Modify: `webapp/src/App.tsx`

- [ ] **Step 1: Finalize routes + nav**

Ensure `App.tsx` has NavLinks and routes: `Dashboard` (`/`), `Sessions` (`/sessions`), `Projets` (`/projects`), `Features` (`/features`), and nested `/features/:id`, `/projects/:id`. Set the brand link to `/`.

- [ ] **Step 2: Run typecheck + build**

Run: `pnpm --filter @ia-dashboard/webapp typecheck` and `pnpm --filter @ia-dashboard/webapp build`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/App.tsx
git commit -m "feat(webapp): finalize routing — dashboard home, projects, features, sessions"
```

---

### Task 17: Deployment — compose mounts, env, docs

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.override.yml`
- Modify: `.env.example`
- Modify: `api/Dockerfile` (if needed to expose nothing extra — likely no change)

**Interfaces:**
- Consumes: config env vars `OPENCODE_DB_PATH`, `OPENCODE_AUTH_PATH`, `LLM_MODEL`, `LLM_BASE_URL`.

- [ ] **Step 1: Update `docker-compose.yml` api service**

Add environment and read-only mount for the OpenCode data dir (which contains `opencode.db` and `auth.json`):

```yaml
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    expose:
      - "3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-ia}:${POSTGRES_PASSWORD:-ia}@db:5432/${POSTGRES_DB:-ia_dashboard}
      OPENCODE_DB_PATH: /opencode/opencode.db
      OPENCODE_AUTH_PATH: /opencode/auth.json
      LLM_MODEL: ${LLM_MODEL:-deepseek-v4-flash}
    volumes:
      - ${OPENCODE_DATA_DIR:-${HOME}/.local/share/opencode}:/opencode:ro
    depends_on:
      db:
        condition: service_healthy
```

- [ ] **Step 2: Update `docker-compose.override.yml`** — keep the existing dev mounts; the `OPENCODE_DATA_DIR` mount is already present; add `OPENCODE_AUTH_PATH: /opencode/auth.json` to the api environment (dev).

- [ ] **Step 3: Update `.env.example`**

Add:

```bash
# OpenCode Zen LLM (session analysis) — model + key discovery
LLM_MODEL=deepseek-v4-flash
LLM_BASE_URL=https://opencode.ai/zen/v1
# Path to OpenCode auth.json containing the API key (opencode / opencode-go entry)
OPENCODE_AUTH_PATH=${HOME}/.local/share/opencode/auth.json
# Optional override (takes precedence over auth.json)
# OPENCODE_API_KEY=
# Disable the background analysis worker entirely
# ANALYSIS_DISABLED=true
```

- [ ] **Step 4: Boot the full stack and smoke-test**

Run `pnpm dev` (host) or docker compose up. Verify: dashboard loads with real numbers, `/api/projects` lists derived projects, features/proposals flow works end-to-end for a manual `POST /api/analysis/run?sessionId=...` on a recent parent session.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.override.yml .env.example
git commit -m "chore(deploy): mount opencode data + auth, configure LLM model env"
```

---

### Task 18: End-to-end verification + spec coverage check

**Files:**
- Run: full test/typecheck/build across the monorepo.

- [ ] **Step 1: Full verification**

Run (from repo root):
- `pnpm --filter @ia-dashboard/api test`
- `pnpm --filter @ia-dashboard/api typecheck`
- `pnpm --filter @ia-dashboard/webapp test`
- `pnpm --filter @ia-dashboard/webapp typecheck`
- `pnpm --filter @ia-dashboard/webapp build`

All expected to pass.

- [ ] **Step 2: Manual end-to-end**

1. Start Postgres + API + webapp (dev).
2. `GET /api/projects` → auto-derived projects (real directory basenames, no "global").
3. `GET /api/dashboard/summary?periodDays=7` → KPIs.
4. `POST /api/analysis/run` with a recent parent `sessionId` → analysis done (LLM).
5. `POST /api/analysis/run-project` with a project that has ≥2 done analyses → proposals created.
6. `GET /api/analysis/proposals?projectId=` → pending proposals.
7. `POST /api/proposals/:id/accept` → feature created + sessions linked (incl. subagents).
8. Webapp: Dashboard → click project → accept a proposal → feature appears; Features list shows it with demandes/enjeux.

- [ ] **Step 3: Spec coverage check**

Verify against `docs/superpowers/specs/2026-08-27-ia-dashboard-rework-design.md`: every section (data model, pipeline pass1/pass2, API endpoints, UI views, errors, tests, deployment, non-goals) is implemented by a task above. If any gap is found, add a follow-up task.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification of ia-dashboard rework"
```