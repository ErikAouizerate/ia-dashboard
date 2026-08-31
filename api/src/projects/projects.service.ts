import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { features, featureProposals, featureSessions, projects } from "../db/schema";
import { DirectoryAggregate } from "../opencode/opencode.types";

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
        durationMs: times.get(p.directory) ?? 0,
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
      byModel: this.reader
        .aggregateByDirectoryAndModel({})
        .filter((m) => m.directory === row.directory)
        .map(({ model, totalCost, sessions }) => ({ model, totalCost, sessions })),
      features: featRows,
      proposals: propRows,
    };
  }
}