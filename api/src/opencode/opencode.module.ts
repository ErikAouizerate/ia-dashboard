import { Global, Module } from "@nestjs/common";
import { MultiSourceReader } from "./multi-source-reader";
import { APP_CONFIG, AppConfig } from "../config/config";

export const OPENCODE_READER = Symbol("OPENCODE_READER");

@Global()
@Module({
  providers: [
    {
      provide: OPENCODE_READER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MultiSourceReader(config.dbPath, config.vmStoreDir),
    },
  ],
  exports: [OPENCODE_READER],
})
export class OpenCodeModule {}
