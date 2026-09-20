import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { basename } from "node:path";
import { SESSION_SOURCES } from "../opencode/opencode.module";
import { SessionSources } from "../opencode/session-sources";
import { offeredDiff } from "../opencode/offered";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { featureSessions, projects, sessionAnalyses } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";
import { groupProjects } from "../projects/project-groups";
import { nominalFromId, nominalName } from "../projects/nominal-name";

type SessionAnalysisStatus = "none" | "pending" | "analyzing" | "done" | "error";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_SOURCES) private readonly sources: SessionSources,
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
    const page = this.sources.list(filters);
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
    const session = this.sources.getSession(id);
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

  private profile(id: string) {
    const reader = this.sources.readerFor(id);
    if (!reader) return null;
    const session = reader.getSession(id);
    if (!session) return null;
    const tree = reader.getSessionTree(id);
    const calls = reader.getSessionCalls(tree);
    const steps = reader.getSessionSteps(tree);
    const tools = reader.getSessionToolUsage(tree);
    const byModel = new Map<
      string,
      { model: string; cost: number; tokensInput: number; tokensOutput: number; llmCalls: number }
    >();
    for (const c of calls) {
      const m =
        byModel.get(c.model) ??
        { model: c.model, cost: 0, tokensInput: 0, tokensOutput: 0, llmCalls: 0 };
      m.cost += c.cost;
      m.tokensInput += c.tokensInput;
      m.tokensOutput += c.tokensOutput;
      m.llmCalls++;
      byModel.set(c.model, m);
    }
    const sum = (pick: (s: (typeof steps)[number]) => number) =>
      steps.reduce((acc, s) => acc + pick(s), 0);
    const capture = this.sources.capture(id);
    return {
      session,
      source: reader.source,
      profile: capture?.profile ?? null,
      configId: capture?.configId ?? null,
      config: capture?.config ?? null,
      offeredTools: capture?.offeredTools ?? [],
      totals: {
        cost: calls.reduce((acc, c) => acc + c.cost, 0),
        tokensInput: sum((s) => s.tokensInput),
        tokensOutput: sum((s) => s.tokensOutput),
        tokensReasoning: sum((s) => s.tokensReasoning),
        cacheRead: sum((s) => s.cacheRead),
        cacheWrite: sum((s) => s.cacheWrite),
        llmCalls: calls.length,
        toolCalls: tools.reduce((acc, t) => acc + t.count, 0),
        treeSize: tree.length,
      },
      byModel: [...byModel.values()].sort((x, y) => y.cost - x.cost),
      tools,
      tree: tree.map((tid) => {
        const s = reader.getSession(tid)!;
        return { sessionId: s.id, parentId: s.parentId, agent: s.agent, model: s.model, cost: s.cost };
      }),
    };
  }

  compare(a: string, b: string) {
    const pa = this.profile(a);
    const pb = this.profile(b);
    if (!pa || !pb) return null;
    const toolMap = new Map<string, { name: string; a: number; b: number; delta: number }>();
    const all = new Set([...pa.tools.map((t) => t.tool), ...pb.tools.map((t) => t.tool)]);
    for (const name of all) {
      const av = pa.tools.find((t) => t.tool === name)?.count ?? 0;
      const bv = pb.tools.find((t) => t.tool === name)?.count ?? 0;
      toolMap.set(name, { name, a: av, b: bv, delta: bv - av });
    }
    const t = (p: typeof pa) => p.totals;
    const offered = offeredDiff(pa.offeredTools, pb.offeredTools);
    return {
      a: pa,
      b: pb,
      delta: {
        cost: t(pb).cost - t(pa).cost,
        tokensInput: t(pb).tokensInput - t(pa).tokensInput,
        tokensOutput: t(pb).tokensOutput - t(pa).tokensOutput,
        tokensReasoning: t(pb).tokensReasoning - t(pa).tokensReasoning,
        cacheRead: t(pb).cacheRead - t(pa).cacheRead,
        cacheWrite: t(pb).cacheWrite - t(pa).cacheWrite,
        llmCalls: t(pb).llmCalls - t(pa).llmCalls,
        toolCalls: t(pb).toolCalls - t(pa).toolCalls,
        tools: [...toolMap.values()].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
        offeredOnlyA: offered.onlyA,
        offeredOnlyB: offered.onlyB,
      },
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
      models: this.sources.listModels(),
    };
  }
}