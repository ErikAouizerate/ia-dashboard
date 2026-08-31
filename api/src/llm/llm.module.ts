import { Global, Module } from "@nestjs/common";
import { LlmClient } from "./llm-client";
import { APP_CONFIG, AppConfig } from "../config/config";

export const LLM_CLIENT = Symbol("LLM_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new LlmClient({
          baseUrl: config.llmBaseUrl,
          apiKey: config.llmApiKey,
          model: config.llmModel,
        }),
    },
  ],
  exports: [LLM_CLIENT],
})
export class LlmModule {}