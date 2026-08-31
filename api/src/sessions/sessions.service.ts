import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { basename } from "node:path";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { featureSessions, projects, sessionAnalyses } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";
import { groupProjects } from "../projects/project-groups";
import { nominalFromId, nominalName } from "../projects/nominal-name";

type SessionAnalysisStatus = "none" | "pending" | "analyzing" | "done" | "error";

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
      const nominal = nominalFromId(filters.projectId);
      if (nominal !== null) {
        const all = await this.db.select().from(projects);
        const dirs = all
          .filter((r) => nominalName(basename(r.directory)) === nominal)
          .map((r) => r.directory);
        if (dirs.length > 0) filters.directories = dirs;
      } else {
        const p = await this.db
          .select()
          .from(projects)
          .where(eq(projects.id, filters.projectId))
          .then((r) => r[0]);
        filters.directory = p?.directory ?? filters.directory;
      }
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
    else if (filters.analysed === "pending")
      items = items.filter((i) => i.analysedStatus === "pending" || i.analysedStatus === "analyzing");
    else if (filters.analysed === "error") items = items.filter((i) => i.analysedStatus === "error");
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
      projects: groupProjects(rows).map((g) => ({ id: g.id, name: g.name })),
      models: this.reader.listModels(),
    };
  }
}