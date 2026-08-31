import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";
import { LLM_CLIENT } from "../llm/llm.module";
import { LlmClient } from "../llm/llm-client";
import { projects, sessionAnalyses } from "../db/schema";

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
    const session = this.reader.getSession(sessionId);
    const projectId = await this.projectIdForDirectory(session?.directory ?? "");
    const existing = await this.db
      .select()
      .from(sessionAnalyses)
      .where(eq(sessionAnalyses.sessionId, sessionId))
      .then((r) => r[0]);
    if (!existing) {
      await this.db.insert(sessionAnalyses).values({
        sessionId,
        projectId,
        title: input.title,
        model: input.model,
        status: "pending",
      });
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

  async listProposals(_projectId?: string): Promise<unknown[]> {
    return [];
  }
}