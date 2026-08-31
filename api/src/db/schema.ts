import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  real,
  timestamp,
  boolean,
  uniqueIndex,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const analysisStatus = pgEnum("analysis_status", [
  "pending",
  "analyzing",
  "done",
  "error",
]);

export const proposalStatus = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "dismissed",
  "stale",
]);

export interface Demande {
  label: string;
  description: string;
}

export interface Enjeu {
  label: string;
  description: string;
}

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  directory: text("directory").notNull().unique(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  stale: boolean("stale").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionAnalyses = pgTable("session_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title"),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  summary: text("summary"),
  model: text("model"),
  status: analysisStatus("status").notNull().default("pending"),
  error: text("error"),
  errorCount: integer("error_count").notNull().default(0),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureProposals = pgTable("feature_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose"),
  sessionIds: jsonb("session_ids").$type<string[]>().notNull().default([]),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  rationale: text("rationale"),
  status: proposalStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const features = pgTable("features", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose"),
  satisfaction: smallint("satisfaction"),
  comment: text("comment"),
  tags: text("tags").array().notNull().default([]),
  timeSpentMin: integer("time_spent_min"),
  demandes: jsonb("demandes").$type<Demande[]>().notNull().default([]),
  enjeux: jsonb("enjeux").$type<Enjeu[]>().notNull().default([]),
  proposalId: uuid("proposal_id").references(() => featureProposals.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureSessions = pgTable(
  "feature_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    title: text("title"),
    model: text("model"),
    agent: text("agent"),
    cost: real("cost").notNull().default(0),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensReasoning: integer("tokens_reasoning").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
    summaryAdditions: integer("summary_additions").notNull().default(0),
    summaryDeletions: integer("summary_deletions").notNull().default(0),
    summaryFiles: integer("summary_files").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feature_sessions_session_id_key").on(t.sessionId)],
);