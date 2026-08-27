import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { DrizzleModule } from "./db/drizzle.module";

@Module({
  imports: [ConfigModule, DrizzleModule],
})
export class AppModule {}