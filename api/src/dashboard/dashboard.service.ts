import { Inject, Injectable } from "@nestjs/common";
import { count, sql } from "drizzle-orm";
import { basename } from "node:path";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { SessionReader } from "../opencode/opencode.types";
import { features, projects, sessionAnalyses } from "../db/schema";
import { groupProjects, ProjectGroupMeta } from "../projects/project-groups";
import { nominalId, nominalName } from "../projects/nominal-name";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: SessionReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async summary(periodDays = 7) {
    const from = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
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
      this.db.select().from(projects),
    ]);
    const groups = groupProjects(projectRows);
    const dirToGroup = new Map<string, ProjectGroupMeta>();
    for (const g of groups) {
      for (const d of g.directories) dirToGroup.set(d, g);
    }
    const fallback = (directory: string): ProjectGroupMeta => {
      const key = nominalName(basename(directory));
      return {
        id: nominalId(key),
        name: key,
        directory,
        directories: [directory],
        stale: false,
        firstSeen: new Date(0),
        lastSeen: new Date(0),
      };
    };

    const modelRows = this.reader.aggregateByDirectoryAndModel({ from });
    const timeRows = this.reader.timeByDirectory({ from });

    const byProject = new Map<
      string,
      {
        id: string;
        name: string;
        directory: string;
        totalCost: number;
        tokensInput: number;
        tokensOutput: number;
        sessions: number;
      }
    >();
    for (const a of this.reader.aggregateByDirectory({ from })) {
      const g = dirToGroup.get(a.directory) ?? fallback(a.directory);
      const cur = byProject.get(g.name) ?? {
        id: g.id,
        name: g.name,
        directory: g.directory,
        totalCost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        sessions: 0,
      };
      cur.totalCost += a.totalCost;
      cur.tokensInput += a.tokensInput;
      cur.tokensOutput += a.tokensOutput;
      cur.sessions += a.sessions;
      byProject.set(g.name, cur);
    }

    const modelsByProject = new Map<
      string,
      Map<
        string,
        {
          model: string;
          totalCost: number;
          tokensInput: number;
          tokensOutput: number;
          sessions: number;
        }
      >
    >();
    for (const m of modelRows) {
      const g = dirToGroup.get(m.directory) ?? fallback(m.directory);
      const map = modelsByProject.get(g.name) ?? new Map();
      const cur = map.get(m.model);
      if (cur) {
        cur.totalCost += m.totalCost;
        cur.tokensInput += m.tokensInput;
        cur.tokensOutput += m.tokensOutput;
        cur.sessions += m.sessions;
      } else {
        map.set(m.model, {
          model: m.model,
          totalCost: m.totalCost,
          tokensInput: m.tokensInput,
          tokensOutput: m.tokensOutput,
          sessions: m.sessions,
        });
      }
      modelsByProject.set(g.name, map);
    }

    const timeByProject = new Map<
      string,
      { directory: string; name: string; durationMs: number; id: string }
    >();
    for (const t of timeRows) {
      const g = dirToGroup.get(t.directory) ?? fallback(t.directory);
      const cur = timeByProject.get(g.name);
      if (cur) cur.durationMs += t.durationMs;
      else
        timeByProject.set(g.name, {
          directory: g.directory,
          name: g.name,
          durationMs: t.durationMs,
          id: g.id,
        });
    }

    return {
      periodDays,
      ...all,
      sessionCount: all.sessions,
      analysedCount,
      featureCount,
      byProject: [...byProject.values()]
        .map((p) => ({
          ...p,
          models: [...(modelsByProject.get(p.name)?.values() ?? [])]
            .map((m) => ({ ...m, share: p.sessions > 0 ? m.sessions / p.sessions : 0 }))
            .sort((x, y) => y.sessions - x.sessions),
        }))
        .sort((a, b) => b.totalCost - a.totalCost),
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
      timeByProject: [...timeByProject.values()].sort(
        (a, b) => b.durationMs - a.durationMs,
      ),
    };
  }
}