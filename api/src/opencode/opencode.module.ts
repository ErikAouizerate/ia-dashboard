import { Global, Module } from "@nestjs/common";
import { OpenCodeReader } from "./opencode-reader";
import { SessionSources } from "./session-sources";
import { APP_CONFIG, AppConfig } from "../config/config";

export const OPENCODE_READER = Symbol("OPENCODE_READER");
export const SESSION_SOURCES = Symbol("SESSION_SOURCES");

@Global()
@Module({
  providers: [
    {
      provide: OPENCODE_READER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new OpenCodeReader(config.dbPath),
    },
    {
      provide: SESSION_SOURCES,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new SessionSources(config.dbPath, config.vmStoreDir),
    },
  ],
  exports: [OPENCODE_READER, SESSION_SOURCES],
})
export class OpenCodeModule {}
