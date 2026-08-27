import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { DrizzleModule } from "./db/drizzle.module";
import { OpenCodeModule } from "./opencode/opencode.module";
import { SessionsModule } from "./sessions/sessions.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [ConfigModule, DrizzleModule, OpenCodeModule, SessionsModule, HealthModule],
})
export class AppModule {}