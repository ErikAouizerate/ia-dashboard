import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { basename } from "node:path";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { features, featureProposals, featureSessions, projects } from "../db/schema";
import { DirectoryAggregate } from "../opencode/opencode.types";
import { groupProjects, ProjectGroupMeta } from "./project-groups";
import { nominalFromId, nominalName } from "./nominal-name";

type ProjectRow = typeof projects.$inferSelect;

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
      const prev = existing.find((e) => e.directory === d.directory);
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
            firstSeen: new Date(
              Math.min(d.firstSeen, new Date(prev?.firstSeen ?? d.firstSeen).getTime()),
            ),
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
    const rows = await this.db.select().from(projects).orderBy(desc(projects.lastSeen));
    const agg = this.reader.aggregateByDirectory({});
    const byDir = new Map(agg.map((a) => [a.directory, a]));
    const times = new Map(this.reader.timeByDirectory({}).map((t) => [t.directory, t.durationMs]));
    return groupProjects(rows)
      .map((g) => {
        let sessionCount = 0;
        let totalCost = 0;
        let tokensInput = 0;
        let tokensOutput = 0;
        let durationMs = 0;
        for (const d of g.directories) {
          const a = byDir.get(d);
          sessionCount += a?.sessions ?? 0;
          totalCost += a?.totalCost ?? 0;
          tokensInput += a?.tokensInput ?? 0;
          tokensOutput += a?.tokensOutput ?? 0;
          durationMs += times.get(d) ?? 0;
        }
        return { ...g, sessionCount, totalCost, tokensInput, tokensOutput, durationMs };
      })
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  async findOne(id: string) {
    const all = await this.db.select().from(projects);
    const group = this.resolveGroup(id, all);
    if (!group) throw new NotFoundException("Project not found");

    const agg = this.reader.aggregateByDirectory({});
    const memberAgg = group.meta.directories
      .map((d) => agg.find((x) => x.directory === d))
      .filter((x): x is DirectoryAggregate => Boolean(x));
    const sessions = memberAgg.reduce((n, a) => n + a.sessions, 0);
    const totalCost = memberAgg.reduce((n, a) => n + a.totalCost, 0);
    const tokensInput = memberAgg.reduce((n, a) => n + a.tokensInput, 0);
    const tokensOutput = memberAgg.reduce((n, a) => n + a.tokensOutput, 0);

    const byModel = new Map<
      string,
      { model: string; totalCost: number; sessions: number }
    >();
    for (const m of this.reader.aggregateByDirectoryAndModel({})) {
      if (!group.meta.directories.includes(m.directory)) continue;
      const cur = byModel.get(m.model);
      if (cur) {
        cur.totalCost += m.totalCost;
        cur.sessions += m.sessions;
      } else {
        byModel.set(m.model, {
          model: m.model,
          totalCost: m.totalCost,
          sessions: m.sessions,
        });
      }
    }
    const sortedByModel = [...byModel.values()].sort((a, b) => b.totalCost - a.totalCost);

    const memberIds = group.rows.map((r) => r.id);
    const featRows = await this.db
      .select()
      .from(features)
      .where(inArray(features.projectId, memberIds))
      .orderBy(desc(features.updatedAt));
    const propRows = await this.db
      .select()
      .from(featureProposals)
      .where(inArray(featureProposals.projectId, memberIds))
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
      id: group.meta.id,
      name: group.meta.name,
      directory: group.meta.directory,
      directories: group.meta.directories,
      stale: group.meta.stale,
      firstSeen: group.meta.firstSeen,
      lastSeen: group.meta.lastSeen,
      sessionCount: sessions,
      totalCost,
      tokensInput,
      tokensOutput,
      ungroupedSessions: Math.max(0, sessions - linkedCount - proposedCount),
      byModel: sortedByModel,
      features: featRows,
      proposals: propRows,
    };
  }

  private resolveGroup(
    id: string,
    all: ProjectRow[],
  ): { meta: ProjectGroupMeta; rows: ProjectRow[] } | null {
    const groups = groupProjects(all);
    const nominal = nominalFromId(id);
    let meta: ProjectGroupMeta | undefined;
    if (nominal !== null) {
      meta = groups.find((g) => g.id === id);
    } else {
      const row = all.find((r) => r.id === id);
      if (!row) return null;
      const key = nominalName(basename(row.directory));
      meta = groups.find((g) => g.name === key);
    }
    if (!meta) return null;
    return { meta, rows: all.filter((r) => meta.directories.includes(r.directory)) };
  }
}