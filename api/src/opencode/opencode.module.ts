import { Global, Module } from "@nestjs/common";
import { OpenCodeReader } from "./opencode-reader";
import { APP_CONFIG, AppConfig } from "../config/config";

export const OPENCODE_READER = Symbol("OPENCODE_READER");

@Global()
@Module({
  providers: [
    {
      provide: OPENCODE_READER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new OpenCodeReader(config.dbPath),
    },
  ],
  exports: [OPENCODE_READER],
})
export class OpenCodeModule {}