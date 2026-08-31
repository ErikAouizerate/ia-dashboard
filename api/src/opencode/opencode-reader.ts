import { mkdtempSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import Database from "better-sqlite3";
import {
  DayAggregate,
  DirectoryAggregate,
  ModelAggregate,
  OpenCodeProject,
  OpenCodeSession,
  OpendbNotFoundError,
  SessionAggregate,
  SessionAnalysisInput,
  SessionListFilters,
  SessionPage,
} from "./opencode.types";

interface Row {
  id: string;
  project_id: string;
  project_name: string | null;
  project_worktree: string | null;
  directory: string;
  path: string | null;
  parent_id: string | null;
  time_compacting: number | null;
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

const SESSION_COLS = `s.id, s.project_id, s.directory, s.path, s.parent_id, s.time_compacting,
       p.name AS project_name, p.worktree AS project_worktree, s.title, s.model, s.agent,
       s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
       s.tokens_cache_read, s.tokens_cache_write,
       s.summary_additions, s.summary_deletions, s.summary_files,
       s.time_created, s.time_updated`;

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
        "(s.directory = @project OR s.directory LIKE '%/' || @project OR (@project = 'global' AND (s.directory IS NULL OR s.directory = '')))",
      );
      params.project = filters.project;
    }
    if (filters.directory) {
      where.push("s.directory = @directory");
      params.directory = filters.directory;
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
    if (filters.parentOnly) {
      where.push("s.parent_id IS NULL");
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
        `SELECT ${SESSION_COLS}
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
        `SELECT ${SESSION_COLS}
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
      name: this.projectName(r.id, r.name, r.worktree, null),
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
      const id = this.parseModel(r.model);
      if (id) set.add(id);
    }
    return [...set].sort();
  }

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
        `SELECT ${SESSION_COLS}
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
      .all({ from }) as {
      model: string;
      totalCost: number;
      tokensInput: number;
      tokensOutput: number;
      sessions: number;
    }[];
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
        out.push({
          model: id,
          totalCost: r.totalCost,
          tokensInput: r.tokensInput,
          tokensOutput: r.tokensOutput,
          sessions: r.sessions,
        });
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
      .all({ from }) as {
      time_created: number;
      cost: number;
      tokensInput: number;
      tokensOutput: number;
    }[];
    const map = new Map<string, DayAggregate>();
    for (const r of rows) {
      const day = new Date(r.time_created).toISOString().slice(0, 10);
      const agg = map.get(day) ?? {
        day,
        totalCost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        sessions: 0,
      };
      agg.totalCost += r.cost;
      agg.tokensInput += r.tokensInput;
      agg.tokensOutput += r.tokensOutput;
      agg.sessions += 1;
      map.set(day, agg);
    }
    return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
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

  private extractPartText(data: string): string | null {
    try {
      const parsed = JSON.parse(data) as { text?: string };
      return typeof parsed.text === "string" && parsed.text.trim()
        ? parsed.text
        : null;
    } catch {
      return null;
    }
  }

  private parseModel(model: string): string | null {
    if (!model) return null;
    try {
      return (JSON.parse(model) as { id?: string })?.id ?? null;
    } catch {
      return model || null;
    }
  }

  private toSession(r: Row): OpenCodeSession {
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: this.projectName(r.project_id, r.project_name, r.project_worktree, r.directory),
      directory: r.directory,
      path: r.path,
      parentId: r.parent_id,
      isSubagent: r.parent_id != null,
      title: r.title,
      model: this.parseModel(r.model) ?? "",
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
      timeCompacting: r.time_compacting,
    };
  }

  private projectName(
    id: string,
    name: string | null,
    worktree: string | null,
    directory: string | null,
  ): string {
    if (directory) return basename(directory);
    if (id === "global") return "global";
    if (name) return name;
    if (worktree) return basename(worktree);
    return id;
  }
}