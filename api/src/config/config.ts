import { homedir } from "node:os";
import { join } from "node:path";

export interface AppConfig {
  databaseUrl: string;
  dbPath: string;
  vmStoreDir: string;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

export const loadConfig = (): AppConfig => {
  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
    dbPath:
      process.env.OPENCODE_DB_PATH ??
      join(homedir(), ".local", "share", "opencode", "opencode.db"),
    vmStoreDir:
      process.env.OPENCODE_VM_STORE_DIR ??
      join(homedir(), ".local", "share", "opencode-vm"),
  };
};
