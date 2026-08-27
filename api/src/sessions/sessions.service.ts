import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { featureSessions } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async annotatedMap(sessionIds: string[]): Promise<Record<string, string | null>> {
    if (sessionIds.length === 0) return {};
    const rows = await this.db
      .select({
        sessionId: featureSessions.sessionId,
        featureId: featureSessions.featureId,
      })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, sessionIds));
    const map: Record<string, string | null> = {};
    for (const id of sessionIds) map[id] = null;
    for (const r of rows) map[r.sessionId] = r.featureId;
    return map;
  }

  list(filters: SessionListFilters) {
    return this.reader.listSessions(filters);
  }

  async findOne(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const rows = await this.db
      .select({ featureId: featureSessions.featureId })
      .from(featureSessions)
      .where(eq(featureSessions.sessionId, id));
    return {
      ...session,
      annotated: rows.length > 0,
      featureId: rows[0]?.featureId ?? null,
    };
  }

  meta() {
    return {
      projects: this.reader.listProjects().map((p) => p.name),
      models: this.reader.listModels(),
    };
  }
}