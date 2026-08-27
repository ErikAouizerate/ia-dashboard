import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { features, featureSessions } from "../db/schema";
import {
  CreateFeatureDto,
  UpdateFeatureDto,
  createFeatureSchema,
  updateFeatureSchema,
} from "./dto";

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
  ) {}

  async create(input: CreateFeatureDto) {
    const parsed = createFeatureSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const data = parsed.data;
    const rows = await this.db
      .insert(features)
      .values({ ...data, tags: data.tags ?? [] })
      .returning();
    return rows[0];
  }

  async list() {
    const rows = await this.db.select().from(features).orderBy(desc(features.updatedAt));
    const ids = rows.map((f) => f.id);
    const agg =
      ids.length === 0
        ? []
        : await this.db
            .select({
              featureId: featureSessions.featureId,
              sessionCount: count(featureSessions.id),
              totalCost: sum(featureSessions.cost),
              totalTokensInput: sum(featureSessions.tokensInput),
              totalTokensOutput: sum(featureSessions.tokensOutput),
            })
            .from(featureSessions)
            .where(inArray(featureSessions.featureId, ids))
            .groupBy(featureSessions.featureId);
    const byId = new Map(agg.map((a) => [a.featureId, a]));
    return rows.map((f) => ({
      ...f,
      sessionCount: byId.get(f.id)?.sessionCount ?? 0,
      totalCost: Number(byId.get(f.id)?.totalCost ?? 0),
      totalTokensInput: Number(byId.get(f.id)?.totalTokensInput ?? 0),
      totalTokensOutput: Number(byId.get(f.id)?.totalTokensOutput ?? 0),
    }));
  }

  async findOne(id: string) {
    const feat = await this.db
      .select()
      .from(features)
      .where(eq(features.id, id))
      .then((r) => r[0]);
    if (!feat) throw new NotFoundException("Feature not found");
    const sessions = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id))
      .orderBy(desc(featureSessions.createdAt));
    return { ...feat, sessions };
  }

  async update(id: string, patch: UpdateFeatureDto) {
    const parsed = updateFeatureSchema.safeParse(patch);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const rows = await this.db
      .update(features)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(features.id, id))
      .returning();
    if (rows.length === 0) throw new NotFoundException("Feature not found");
    return rows[0];
  }

  async remove(id: string) {
    await this.db.delete(features).where(eq(features.id, id));
    return { ok: true };
  }

  async linkSession(featureId: string, sessionId: string) {
    await this.findOne(featureId);
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const existing = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.sessionId, sessionId))
      .then((r) => r[0]);
    if (existing) throw new BadRequestException("Session already linked to a feature");
    await this.db.insert(featureSessions).values({
      featureId,
      sessionId: s.id,
      title: s.title,
      model: s.model,
      agent: s.agent,
      cost: s.cost,
      tokensInput: s.tokensInput,
      tokensOutput: s.tokensOutput,
      tokensReasoning: s.tokensReasoning,
      tokensCacheRead: s.tokensCacheRead,
      tokensCacheWrite: s.tokensCacheWrite,
      timeCreated: new Date(s.timeCreated),
      timeUpdated: new Date(s.timeUpdated),
      summaryAdditions: s.summaryAdditions,
      summaryDeletions: s.summaryDeletions,
      summaryFiles: s.summaryFiles,
    });
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
    return this.findOne(featureId);
  }

  async unlinkSession(featureId: string, sessionId: string) {
    await this.db
      .delete(featureSessions)
      .where(
        and(
          eq(featureSessions.featureId, featureId),
          eq(featureSessions.sessionId, sessionId),
        ),
      );
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
    return { ok: true };
  }

  async bulkLinkSessions(featureId: string, sessionIds: string[]) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new BadRequestException("sessionIds must be a non-empty array");
    }
    sessionIds = [...new Set(sessionIds)];
    await this.findOne(featureId);
    const linked: string[] = [];
    const skipped: string[] = [];
    const existingRows = await this.db
      .select({ sessionId: featureSessions.sessionId })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, sessionIds));
    const already = new Set(existingRows.map((r) => r.sessionId));
    for (const sessionId of sessionIds) {
      if (already.has(sessionId)) {
        skipped.push(sessionId);
        continue;
      }
      const s = this.reader.getSession(sessionId);
      if (!s) {
        skipped.push(sessionId);
        continue;
      }
      await this.db.insert(featureSessions).values({
        featureId,
        sessionId: s.id,
        title: s.title,
        model: s.model,
        agent: s.agent,
        cost: s.cost,
        tokensInput: s.tokensInput,
        tokensOutput: s.tokensOutput,
        tokensReasoning: s.tokensReasoning,
        tokensCacheRead: s.tokensCacheRead,
        tokensCacheWrite: s.tokensCacheWrite,
        timeCreated: new Date(s.timeCreated),
        timeUpdated: new Date(s.timeUpdated),
        summaryAdditions: s.summaryAdditions,
        summaryDeletions: s.summaryDeletions,
        summaryFiles: s.summaryFiles,
      });
      linked.push(sessionId);
    }
    if (linked.length > 0) {
      await this.db
        .update(features)
        .set({ updatedAt: new Date() })
        .where(eq(features.id, featureId));
    }
    return { linked, skipped };
  }

  async resyncSession(featureId: string, sessionId: string) {
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const rows = await this.db
      .update(featureSessions)
      .set({
        title: s.title,
        model: s.model,
        agent: s.agent,
        cost: s.cost,
        tokensInput: s.tokensInput,
        tokensOutput: s.tokensOutput,
        tokensReasoning: s.tokensReasoning,
        tokensCacheRead: s.tokensCacheRead,
        tokensCacheWrite: s.tokensCacheWrite,
        timeCreated: new Date(s.timeCreated),
        timeUpdated: new Date(s.timeUpdated),
        summaryAdditions: s.summaryAdditions,
        summaryDeletions: s.summaryDeletions,
        summaryFiles: s.summaryFiles,
      })
      .where(
        and(
          eq(featureSessions.featureId, featureId),
          eq(featureSessions.sessionId, sessionId),
        ),
      )
      .returning();
    if (rows.length === 0) throw new NotFoundException("Session not linked to this feature");
    return this.findOne(featureId);
  }
}