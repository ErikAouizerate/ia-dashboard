import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  real,
  timestamp,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const featureStatus = pgEnum("feature_status", [
  "planned",
  "in_progress",
  "done",
  "abandoned",
]);

export const features = pgTable("features", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  project: text("project").notNull(),
  purpose: text("purpose"),
  status: featureStatus("status").notNull().default("planned"),
  satisfaction: smallint("satisfaction"),
  comment: text("comment"),
  tags: text("tags").array().notNull().default([]),
  timeSpentMin: integer("time_spent_min"),
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