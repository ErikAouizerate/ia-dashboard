import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { basename } from "node:path";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { MultiSourceReader } from "../opencode/multi-source-reader";
import { offeredDiff } from "../opencode/offered";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { projects } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";
import { groupProjects } from "../projects/project-groups";
import { nominalFromId, nominalName } from "../projects/nominal-name";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: MultiSourceReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

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
    const byDir = new Map((await this.db.select().from(projects)).map((p) => [p.directory, p.id]));
    // ponytail: one capture() scan per row; batch it if a page ever feels slow
    const items = page.items.map((i) => {
      const cap = this.reader.capture(i.id);
      return {
        ...i,
        projectId: byDir.get(i.directory) ?? null,
        config: cap ? { profile: cap.profile, configId: cap.configId } : null,
      };
    });
    return { ...page, items };
  }

  async findOne(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const p = await this.db
      .select()
      .from(projects)
      .where(eq(projects.directory, session.directory))
      .then((r) => r[0] ?? null);
    return { ...session, projectId: p?.id ?? null };
  }

  private profile(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const tree = this.reader.getSessionTree(id);
    const calls = this.reader.getSessionCalls(tree);
    const steps = this.reader.getSessionSteps(tree);
    const tools = this.reader.getSessionToolUsage(tree);
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
    const capture = this.reader.capture(id);
    return {
      session,
      source: session.source,
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
        const s = this.reader.getSession(tid)!;
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

  async meta() {
    const rows = await this.db.select().from(projects).where(eq(projects.stale, false));
    return {
      projects: groupProjects(rows).map((g) => ({ id: g.id, name: g.name })),
      models: this.reader.listModels(),
      sources: this.reader.listSources(),
      configs: this.reader.listConfigs().map((c) => ({
        configId: c.configId,
        profile: c.profile,
      })),
    };
  }
}
