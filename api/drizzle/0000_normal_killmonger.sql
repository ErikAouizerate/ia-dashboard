CREATE TYPE "public"."feature_status" AS ENUM('planned', 'in_progress', 'done', 'abandoned');--> statement-breakpoint
CREATE TABLE "feature_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"title" text,
	"model" text,
	"agent" text,
	"cost" real DEFAULT 0 NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"tokens_reasoning" integer DEFAULT 0 NOT NULL,
	"tokens_cache_read" integer DEFAULT 0 NOT NULL,
	"tokens_cache_write" integer DEFAULT 0 NOT NULL,
	"time_created" timestamp with time zone,
	"time_updated" timestamp with time zone,
	"summary_additions" integer DEFAULT 0 NOT NULL,
	"summary_deletions" integer DEFAULT 0 NOT NULL,
	"summary_files" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project" text NOT NULL,
	"purpose" text,
	"status" "feature_status" DEFAULT 'planned' NOT NULL,
	"satisfaction" smallint,
	"comment" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"time_spent_min" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_sessions" ADD CONSTRAINT "feature_sessions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_sessions_session_id_key" ON "feature_sessions" USING btree ("session_id");