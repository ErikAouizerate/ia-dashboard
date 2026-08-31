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
    return {
      periodDays,
      ...all,
      sessionCount: all.sessions,
      analysedCount,
      featureCount,
      byProject: this.reader
        .aggregateByDirectory({ from })
        .map((a) => ({ ...a, id: idByDir.get(a.directory) ?? null })),
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
    };
  }
}