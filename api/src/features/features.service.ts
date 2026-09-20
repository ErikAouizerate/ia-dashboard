import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { SessionReader } from "../opencode/opencode.types";
import { LLM_CLIENT } from "../llm/llm.module";
import { LlmClient } from "../llm/llm-client";
import { features, featureSessions, projects, sessionAnalyses } from "../db/schema";
import { resolvePreferredProjectRowId } from "../projects/project-id-resolver";
import { CreateFeatureDto, UpdateFeatureDto, createFeatureSchema, updateFeatureSchema } from "./dto";

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: SessionReader,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  private snapshotValues(s: {
    id: string;
    title: string;
    model: string;
    agent: string | null;
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    tokensReasoning: number;
    tokensCacheRead: number;
    tokensCacheWrite: number;
    timeCreated: number;
    timeUpdated: number;
    summaryAdditions: number;
    summaryDeletions: number;
    summaryFiles: number;
  }) {
    return {
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
    };
  }

  private async linkWithSubagents(featureId: string, sessionId: string): Promise<string[]> {
    const s = this.reader.getSession(sessionId);
    if (!s) return [];
    const ids = [sessionId, ...this.reader.getSubagentIds(sessionId)];
    const existing = await this.db
      .select({ sessionId: featureSessions.sessionId })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, ids));
    const already = new Set(existing.map((r) => r.sessionId));
    const linked: string[] = [];
    for (const sid of ids) {
      if (already.has(sid)) continue;
      const sub = sid === sessionId ? s : this.reader.getSession(sid);
      if (!sub) continue;
      await this.db.insert(featureSessions).values({
        featureId,
        sessionId: sub.id,
        ...this.snapshotValues(sub),
      });
      linked.push(sid);
    }
    return linked;
  }

  async create(input: CreateFeatureDto) {
    const parsed = createFeatureSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const projectId = await resolvePreferredProjectRowId(this.db, parsed.data.projectId);
    if (!projectId) throw new BadRequestException("projectId: unknown project");
    const rows = await this.db
      .insert(features)
      .values({ ...parsed.data, projectId, tags: parsed.data.tags ?? [] })
      .returning();
    return rows[0];
  }

  async list() {
    const rows = await this.db
      .select({
        feature: features,
        projectName: projects.name,
      })
      .from(features)
      .innerJoin(projects, eq(projects.id, features.projectId))
      .orderBy(desc(features.updatedAt));
    const ids = rows.map((r) => r.feature.id);
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
    return rows.map(({ feature, projectName }) => ({
      ...feature,
      projectName,
      sessionCount: byId.get(feature.id)?.sessionCount ?? 0,
      totalCost: Number(byId.get(feature.id)?.totalCost ?? 0),
      totalTokensInput: Number(byId.get(feature.id)?.totalTokensInput ?? 0),
      totalTokensOutput: Number(byId.get(feature.id)?.totalTokensOutput ?? 0),
    }));
  }

  async findOne(id: string) {
    const row = await this.db
      .select({ feature: features, projectName: projects.name })
      .from(features)
      .innerJoin(projects, eq(projects.id, features.projectId))
      .where(eq(features.id, id))
      .then((r) => r[0]);
    if (!row) throw new NotFoundException("Feature not found");
    const sessions = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id))
      .orderBy(desc(featureSessions.createdAt));
    return { ...row.feature, projectName: row.projectName, sessions };
  }

  async update(id: string, patch: UpdateFeatureDto) {
    const parsed = updateFeatureSchema.safeParse(patch);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const data = { ...parsed.data };
    if (data.projectId !== undefined) {
      const projectId = await resolvePreferredProjectRowId(this.db, data.projectId);
      if (!projectId) throw new BadRequestException("projectId: unknown project");
      data.projectId = projectId;
    }
    const rows = await this.db
      .update(features)
      .set({ ...data, updatedAt: new Date() })
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
    await this.linkWithSubagents(featureId, sessionId);
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
    return this.findOne(featureId);
  }

  async bulkLinkSessions(featureId: string, sessionIds: string[]) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new BadRequestException("sessionIds must be a non-empty array");
    }
    sessionIds = [...new Set(sessionIds)];
    await this.findOne(featureId);
    const linked: string[] = [];
    const skipped: string[] = [];
    for (const sessionId of sessionIds) {
      const s = this.reader.getSession(sessionId);
      if (!s) {
        skipped.push(sessionId);
        continue;
      }
      const added = await this.linkWithSubagents(featureId, sessionId);
      if (added.length > 0) linked.push(sessionId);
      else skipped.push(sessionId);
    }
    if (linked.length > 0) {
      await this.db
        .update(features)
        .set({ updatedAt: new Date() })
        .where(eq(features.id, featureId));
    }
    return { linked, skipped };
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

  async resyncSession(featureId: string, sessionId: string) {
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const rows = await this.db
      .update(featureSessions)
      .set(this.snapshotValues(s))
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

  async reanalyze(id: string) {
    const feat = await this.findOne(id);
    const analyses = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id));
    const parentIds = analyses.map((s) => s.sessionId);
    if (parentIds.length === 0) return feat;
    const stored = await this.db
      .select()
      .from(sessionAnalyses)
      .where(inArray(sessionAnalyses.sessionId, parentIds));
    const payload = stored.map((a) => ({
      session_id: a.sessionId,
      title: a.title ?? "",
      summary: a.summary ?? "",
      demandes: a.demandes,
      enjeux: a.enjeux,
    }));
    const result = await this.llm.chatCompletion<{
      demandes: { label: string; description: string }[];
      enjeux: { label: string; description: string }[];
    }>([
      {
        role: "system",
        content:
          "Synthétise les demandes et enjeux de cette feature à partir des résumés de sessions. Réponds UNIQUEMENT en JSON : {\"demandes\":[{label,description}],\"enjeux\":[{label,description}]}.",
      },
      {
        role: "user",
        content: `Feature: ${feat.name}\nSessions:\n${JSON.stringify(payload)}`,
      },
    ]);
    await this.db
      .update(features)
      .set({
        demandes: result.demandes ?? [],
        enjeux: result.enjeux ?? [],
        updatedAt: new Date(),
      })
      .where(eq(features.id, id));
    return this.findOne(id);
  }
}