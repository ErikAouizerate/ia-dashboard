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
      this.db
        .select({ c: count() })
        .from(sessionAnalyses)
        .where(sql`status = 'done'`)
        .then((r) => Number(r[0]?.c ?? 0)),
      this.db
        .select({ c: count() })
        .from(features)
        .then((r) => Number(r[0]?.c ?? 0)),
      this.db.select({ id: projects.id, directory: projects.directory }).from(projects),
    ]);
    const idByDir = new Map(projectRows.map((p) => [p.directory, p.id]));
    const modelRows = this.reader.aggregateByDirectoryAndModel({ from });
    const timeRows = this.reader.timeByDirectory({ from });
    const byProject = this.reader
      .aggregateByDirectory({ from })
      .map((a) => {
        const models = modelRows
          .filter((m) => m.directory === a.directory)
          .map((m) => ({ ...m, share: a.sessions > 0 ? m.sessions / a.sessions : 0 }))
          .sort((x, y) => y.sessions - x.sessions);
        return { ...a, id: idByDir.get(a.directory) ?? null, models };
      });
    const timeByProject = timeRows
      .map((t) => ({
        ...t,
        name: t.directory.split("/").filter(Boolean).pop() ?? t.directory,
        id: idByDir.get(t.directory) ?? null,
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
    return {
      periodDays,
      ...all,
      sessionCount: all.sessions,
      analysedCount,
      featureCount,
      byProject,
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
      timeByProject,
    };
  }
}