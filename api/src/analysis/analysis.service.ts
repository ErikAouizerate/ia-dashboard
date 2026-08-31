import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { LLM_CLIENT } from "../llm/llm.module";
import { LlmClient } from "../llm/llm-client";
import { featureProposals, features, featureSessions, projects, sessionAnalyses } from "../db/schema";

const MAX_ERRORS = 3;
const ANALYSIS_SYSTEM_PROMPT =
  "Tu es un analyste de sessions d'agent de codage. " +
  "À partir d'une session, dégage : summary (résumé court en 1 phrase), " +
  "demandes (liste de {label, description} : ce que l'utilisateur a demandé), " +
  "enjeux (liste de {label, description} : points techniques ou décisionnels clés). " +
  'Réponds UNIQUEMENT en JSON : {"summary":string,"demandes":[{label,description}],"enjeux":[{label,description}]}.';

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

@Injectable()
export class AnalysisService {
  private inflight = new Map<string, Promise<any>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  private async projectIdForDirectory(directory: string): Promise<string> {
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.directory, directory))
      .then((r) => r[0]);
    if (existing) return existing.id;
    const name = directory.split("/").filter(Boolean).pop() ?? directory;
    const inserted = await this.db
      .insert(projects)
      .values({
        name,
        directory,
        firstSeen: new Date(),
        lastSeen: new Date(),
        stale: false,
      })
      .returning();
    return inserted[0].id;
  }

  async analyzeSession(sessionId: string) {
    const input = this.reader.getSessionAnalysisInput(sessionId);
    if (!input) throw new NotFoundException("Session not found in OpenCode DB");
    const inFlight = this.inflight.get(sessionId);
    if (inFlight) return inFlight;
    const promise = this.doAnalyze(sessionId, input);
    this.inflight.set(sessionId, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(sessionId);
    }
  }

  private async doAnalyze(
    sessionId: string,
    input: NonNullable<ReturnType<OpenCodeReader["getSessionAnalysisInput"]>>,
  ) {
    const session = this.reader.getSession(sessionId);
    if (!session || session.isSubagent) {
      throw new NotFoundException("Session not found or is a subagent");
    }
    const projectId = await this.projectIdForDirectory(session?.directory ?? "");
    const existing = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, sessionId))
      .then((r) => r[0]);
    if (existing?.status === "done") return existing;
    if (!existing) {
      await this.db.insert(sessionAnalyses).values({
        sessionId,
        projectId,
        title: input.title,
        model: input.model,
        status: "pending",
      }).onConflictDoNothing();
    }
    const userText = input.userMessages.map((m) => `- ${truncate(m, 2000)}`).join("\n");
    const todoText = input.todos
      .map((t) => `- [${t.status}] ${truncate(t.content, 500)}`)
      .join("\n");
    const user = [
      `Titre: ${input.title}`,
      `Modèle: ${input.model}`,
      `Agent: ${input.agent ?? "?"}`,
      `Date: ${new Date(input.timeCreated).toISOString()}`,
      `Diff: +${input.summaryAdditions} -${input.summaryDeletions} (${input.summaryFiles} fichiers)`,
      `Messages utilisateur:\n${userText}`,
      `Todos:\n${todoText || "(aucun)"}`,
    ].join("\n");
    await this.db
      .update(sessionAnalyses)
      .set({ status: "analyzing", updatedAt: new Date() })
      .where(eq(sessionAnalyses.sessionId, sessionId));
    try {
      const result = await this.llm.chatCompletion<{
        summary: string;
        demandes: { label: string; description: string }[];
        enjeux: { label: string; description: string }[];
      }>([
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: user },
      ]);
      const rows = await this.db
        .update(sessionAnalyses)
        .set({
          status: "done",
          summary: result.summary,
          demandes: result.demandes ?? [],
          enjeux: result.enjeux ?? [],
          model: input.model,
          analyzedAt: new Date(),
          error: null,
          errorCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(sessionAnalyses.sessionId, sessionId))
        .returning();
      return rows[0];
    } catch (e) {
      const prev = await this.db
        .select()
        .from(sessionAnalyses)
        .where(eq(sessionAnalyses.sessionId, sessionId))
        .then((r) => r[0]);
      const errCount = (prev?.errorCount ?? 0) + 1;
      await this.db
        .update(sessionAnalyses)
        .set({
          status: errCount >= MAX_ERRORS ? "error" : "pending",
          error: String(e),
          errorCount: errCount,
          updatedAt: new Date(),
        })
        .where(eq(sessionAnalyses.sessionId, sessionId));
      throw e;
    }
  }

  async queueBackfill(daysAgo = 2): Promise<number> {
    const from = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    const parents = this.reader.listParentSessions({ from });
    const existing = await this.db.select({ sessionId: sessionAnalyses.sessionId }).from(sessionAnalyses);
    const done = new Set(existing.map((r) => r.sessionId));
    let queued = 0;
    for (const s of parents) {
      if (done.has(s.id)) continue;
      const projectId = await this.projectIdForDirectory(s.directory);
      await this.db.insert(sessionAnalyses).values({
        sessionId: s.id,
        projectId,
        title: s.title,
        model: s.model,
        status: "pending",
      });
      queued++;
    }
    return queued;
  }

  async recoverStuck(): Promise<number> {
    const rows = await this.db
      .update(sessionAnalyses)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(sessionAnalyses.status, "analyzing"))
      .returning();
    return rows.length;
  }

  async tick(): Promise<void> {
    const next = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.status, "pending"))
      .limit(1);
    if (next.length === 0) return;
    const row = next[0];
    if (row.error && (row.errorCount ?? 0) >= MAX_ERRORS) return;
    await this.analyzeSession(row.sessionId);
  }

  async getAnalysis(sessionId: string) {
    const rows = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, sessionId));
    return rows[0] ?? null;
  }

  async listProposals(projectId?: string) {
    if (projectId) {
      return this.db
        .select()
        .from(featureProposals)
        .where(eq(featureProposals.projectId, projectId))
        .orderBy(featureProposals.createdAt);
    }
    return this.db.select().from(featureProposals).orderBy(featureProposals.createdAt);
  }

  private async linkFeatureSessions(featureId: string, sessionIds: string[]): Promise<void> {
    for (const sessionId of sessionIds) {
      const s = this.reader.getSession(sessionId);
      if (!s) continue;
      const allIds = [sessionId, ...this.reader.getSubagentIds(sessionId)];
      for (const sid of allIds) {
        const sub = this.reader.getSession(sid);
        if (!sub) continue;
        const exists = await this.db
          .select()
          .from(featureSessions)
          .where(eq(featureSessions.sessionId, sid))
          .then((r) => r[0]);
        if (exists) continue;
        await this.db.insert(featureSessions).values({
          featureId,
          sessionId: sub.id,
          title: sub.title,
          model: sub.model,
          agent: sub.agent,
          cost: sub.cost,
          tokensInput: sub.tokensInput,
          tokensOutput: sub.tokensOutput,
          tokensReasoning: sub.tokensReasoning,
          tokensCacheRead: sub.tokensCacheRead,
          tokensCacheWrite: sub.tokensCacheWrite,
          timeCreated: new Date(sub.timeCreated),
          timeUpdated: new Date(sub.timeUpdated),
          summaryAdditions: sub.summaryAdditions,
          summaryDeletions: sub.summaryDeletions,
          summaryFiles: sub.summaryFiles,
        });
      }
    }
  }

  private async analyzedSessionsForProject(projectId: string) {
    const analyses = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.projectId, projectId));
    const done = analyses.filter((a) => a.status === "done");
    const pendingProposals = await this.db
      .select()
      .from(featureProposals)
      .where(and(eq(featureProposals.projectId, projectId), eq(featureProposals.status, "pending")));
    const proposed = new Set(pendingProposals.flatMap((p) => p.sessionIds));
    const linked = new Set(
      (
        await this.db.select({ sessionId: featureSessions.sessionId }).from(featureSessions)
      ).map((r) => r.sessionId),
    );
    return done.filter((a) => !proposed.has(a.sessionId) && !linked.has(a.sessionId));
  }

  async clusterProject(projectId: string): Promise<number> {
    const candidates = await this.analyzedSessionsForProject(projectId);
    if (candidates.length < 2) return 0;
    const items = candidates
      .map((a) => ({
        session_id: a.sessionId,
        title: a.title ?? "",
        date: a.analyzedAt?.toISOString() ?? "",
        summary: a.summary ?? "",
        demandes: a.demandes,
      }))
      .sort((x, y) => (x.date < y.date ? -1 : 1));
    const prompt =
      "Regroupe ces sessions d'un même projet en features cohérentes. " +
      "Proximité temporelle ET ressemblance sémantique comptent. " +
      'Réponds UNIQUEMENT en JSON : {"proposals":[{name, purpose, session_ids[], rationale, demandes:[{label,description}], enjeux:[{label,description}]}]}.\n' +
      "Sessions:\n" +
      JSON.stringify(items);
    const result = await this.llm.chatCompletion<{
      proposals: {
        name: string;
        purpose: string;
        session_ids: string[];
        rationale: string;
        demandes: { label: string; description: string }[];
        enjeux: { label: string; description: string }[];
      }[];
    }>([
      {
        role: "system",
        content: "Tu es un outil de regroupement de sessions en features.",
      },
      { role: "user", content: prompt },
    ]);
    await this.db
      .update(featureProposals)
      .set({ status: "stale", updatedAt: new Date() })
      .where(and(eq(featureProposals.projectId, projectId), eq(featureProposals.status, "pending")));
    let created = 0;
    for (const p of result.proposals ?? []) {
      await this.db.insert(featureProposals).values({
        projectId,
        name: p.name,
        purpose: p.purpose,
        sessionIds: p.session_ids ?? [],
        demandes: p.demandes ?? [],
        enjeux: p.enjeux ?? [],
        rationale: p.rationale,
        status: "pending",
      });
      created++;
    }
    return created;
  }

  async acceptProposal(id: string, overrides?: { name?: string; purpose?: string }) {
    const prop = await this.db
      .select()
      .from(featureProposals)
      .where(eq(featureProposals.id, id))
      .then((r) => r[0]);
    if (!prop) throw new NotFoundException("Proposal not found");
    if (prop.status !== "pending") throw new NotFoundException("Proposal not pending");
    const feat = await this.db
      .insert(features)
      .values({
        projectId: prop.projectId,
        name: overrides?.name?.trim() || prop.name,
        purpose: overrides?.purpose?.trim() || prop.purpose,
        demandes: prop.demandes,
        enjeux: prop.enjeux,
        proposalId: prop.id,
      })
      .returning();
    await this.linkFeatureSessions(feat[0].id, prop.sessionIds);
    await this.db
      .update(featureProposals)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(featureProposals.id, id));
    return feat[0];
  }

  async dismissProposal(id: string) {
    await this.db
      .update(featureProposals)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(eq(featureProposals.id, id));
    return { ok: true };
  }
}