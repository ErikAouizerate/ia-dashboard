import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppConfig {
  databaseUrl: string;
  dbPath: string;
  vmStoreDir: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  authPath: string;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

function readAuthKey(authPath: string): string {
  const env = process.env.OPENCODE_API_KEY;
  if (env) return env;
  if (!existsSync(authPath)) return "";
  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf8")) as Record<
      string,
      { type?: string; key?: string }
    >;
    return parsed.opencode?.key ?? parsed["opencode-go"]?.key ?? "";
  } catch {
    return "";
  }
}

export const loadConfig = (): AppConfig => {
  const authPath =
    process.env.OPENCODE_AUTH_PATH ??
    join(homedir(), ".local", "share", "opencode", "auth.json");
  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
    dbPath:
      process.env.OPENCODE_DB_PATH ??
      join(homedir(), ".local", "share", "opencode", "opencode.db"),
    vmStoreDir:
      process.env.OPENCODE_VM_STORE_DIR ??
      join(homedir(), ".local", "share", "opencode-vm"),
    llmBaseUrl: process.env.LLM_BASE_URL ?? "https://opencode.ai/zen/v1",
    llmApiKey: readAuthKey(authPath),
    llmModel: process.env.LLM_MODEL ?? "deepseek-v4-flash",
    authPath,
  };
};