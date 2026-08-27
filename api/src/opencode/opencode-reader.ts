import { mkdtempSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import Database from "better-sqlite3";
import {
  OpenCodeProject,
  OpenCodeSession,
  OpendbNotFoundError,
  SessionListFilters,
  SessionPage,
} from "./opencode.types";

interface Row {
  id: string;
  project_id: string;
  project_name: string | null;
  project_worktree: string | null;
  title: string;
  model: string;
  agent: string | null;
  cost: number;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  summary_additions: number;
  summary_deletions: number;
  summary_files: number;
  time_created: number;
  time_updated: number;
}

export class OpenCodeReader {
  private db: Database.Database | null = null;
  private tmpDir: string | null = null;

  constructor(private readonly dbPath: string) {}

  open(): void {
    if (!existsSync(this.dbPath)) throw new OpendbNotFoundError(this.dbPath);
    try {
      this.db = new Database(this.dbPath, { readonly: true });
    } catch {
      this.tmpDir = mkdtempSync(join(tmpdir(), "opencode-"));
      const dest = join(this.tmpDir, "opencode.db");
      copyFileSync(this.dbPath, dest);
      for (const suffix of ["-wal", "-shm"]) {
        const src = this.dbPath + suffix;
        if (existsSync(src)) copyFileSync(src, dest + suffix);
      }
      this.db = new Database(dest);
    }
  }

  listSessions(filters: SessionListFilters = {}): SessionPage {
    const db = this.requireDb();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.project) {
      where.push(
        "(p.name = @project OR p.id = @project OR p.worktree LIKE '%/' || @project OR (@project = 'global' AND s.project_id = 'global'))",
      );
      params.project = filters.project;
    }
    if (filters.model) {
      where.push("json_extract(s.model, '$.id') = @model");
      params.model = filters.model;
    }
    if (filters.from) {
      where.push("s.time_created >= @from");
      params.from = new Date(filters.from).getTime();
    }
    if (filters.to) {
      where.push("s.time_created <= @to");
      params.to = new Date(filters.to).getTime();
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM session s LEFT JOIN project p ON p.id = s.project_id ${whereSql}`,
        )
        .get(params) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT s.id, s.project_id, p.name AS project_name, p.worktree AS project_worktree, s.title, s.model, s.agent,
                s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
                s.tokens_cache_read, s.tokens_cache_write,
                s.summary_additions, s.summary_deletions, s.summary_files,
                s.time_created, s.time_updated
         FROM session s LEFT JOIN project p ON p.id = s.project_id
         ${whereSql}
         ORDER BY s.time_created DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];

    return {
      items: rows.map((r) => this.toSession(r)),
      total,
      page,
      pageSize,
    };
  }

  getSession(id: string): OpenCodeSession | null {
    const db = this.requireDb();
    const r = db
      .prepare(
        `SELECT s.id, s.project_id, p.name AS project_name, p.worktree AS project_worktree, s.title, s.model, s.agent,
                s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
                s.tokens_cache_read, s.tokens_cache_write,
                s.summary_additions, s.summary_deletions, s.summary_files,
                s.time_created, s.time_updated
         FROM session s LEFT JOIN project p ON p.id = s.project_id
         WHERE s.id = ?`,
      )
      .get(id) as Row | undefined;
    return r ? this.toSession(r) : null;
  }

  listProjects(): OpenCodeProject[] {
    const db = this.requireDb();
    const rows = db
      .prepare(
        `SELECT id, COALESCE(NULLIF(name,''), '') AS name, worktree
         FROM project ORDER BY worktree`,
      )
      .all() as { id: string; name: string; worktree: string | null }[];
    return rows.map((r) => ({
      id: r.id,
      name: this.projectName(r.id, r.name, r.worktree),
    }));
  }

  listModels(): string[] {
    const db = this.requireDb();
    const rows = db
      .prepare(
        `SELECT DISTINCT model FROM session WHERE model IS NOT NULL AND model != ''`,
      )
      .all() as { model: string }[];
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const id = (JSON.parse(r.model) as { id?: string })?.id;
        if (id) set.add(id);
      } catch {
        /* skip unparseable */
      }
    }
    return [...set].sort();
  }

  close(): void {
    this.db?.close();
    this.db = null;
    if (this.tmpDir) {
      rmSync(this.tmpDir, { recursive: true, force: true });
      this.tmpDir = null;
    }
  }

  private requireDb(): Database.Database {
    if (!this.db) this.open();
    return this.db!;
  }

  private toSession(r: Row): OpenCodeSession {
    let model = "";
    try {
      model = (JSON.parse(r.model) as { id?: string })?.id ?? "";
    } catch {
      model = r.model;
    }
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: this.projectName(r.project_id, r.project_name, r.project_worktree),
      title: r.title,
      model,
      agent: r.agent,
      cost: r.cost,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      tokensReasoning: r.tokens_reasoning,
      tokensCacheRead: r.tokens_cache_read,
      tokensCacheWrite: r.tokens_cache_write,
      summaryAdditions: r.summary_additions,
      summaryDeletions: r.summary_deletions,
      summaryFiles: r.summary_files,
      timeCreated: r.time_created,
      timeUpdated: r.time_updated,
    };
  }

  private projectName(id: string, name: string | null, worktree: string | null): string {
    if (id === "global") return "global";
    if (name) return name;
    if (worktree) return basename(worktree);
    return id;
  }
}