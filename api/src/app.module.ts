import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { DrizzleModule } from "./db/drizzle.module";
import { OpenCodeModule } from "./opencode/opencode.module";
import { SessionsModule } from "./sessions/sessions.module";
import { ProjectsModule } from "./projects/projects.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ConfigsModule } from "./configs/configs.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule,
    DrizzleModule,
    OpenCodeModule,
    SessionsModule,
    ProjectsModule,
    DashboardModule,
    ConfigsModule,
    HealthModule,
  ],
})
export class AppModule {}