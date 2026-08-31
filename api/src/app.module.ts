import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { DrizzleModule } from "./db/drizzle.module";
import { OpenCodeModule } from "./opencode/opencode.module";
import { LlmModule } from "./llm/llm.module";
import { SessionsModule } from "./sessions/sessions.module";
import { FeaturesModule } from "./features/features.module";
import { ProjectsModule } from "./projects/projects.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule,
    DrizzleModule,
    OpenCodeModule,
    LlmModule,
    SessionsModule,
    FeaturesModule,
    ProjectsModule,
    AnalysisModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}