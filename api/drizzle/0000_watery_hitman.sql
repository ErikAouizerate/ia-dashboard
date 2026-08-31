DROP TABLE IF EXISTS "feature_sessions";--> statement-breakpoint
DROP TABLE IF EXISTS "features";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."feature_status";--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'analyzing', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'dismissed', 'stale');--> statement-breakpoint
CREATE TABLE "feature_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"session_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"demandes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enjeux" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"satisfaction" smallint,
	"comment" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"time_spent_min" integer,
	"demandes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enjeux" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"directory" text NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name"),
	CONSTRAINT "projects_directory_unique" UNIQUE("directory")
);
--> statement-breakpoint
CREATE TABLE "session_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text,
	"demandes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enjeux" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"model" text,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_analyses_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "feature_proposals" ADD CONSTRAINT "feature_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_sessions" ADD CONSTRAINT "feature_sessions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_proposal_id_feature_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."feature_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_analyses" ADD CONSTRAINT "session_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_sessions_session_id_key" ON "feature_sessions" USING btree ("session_id");