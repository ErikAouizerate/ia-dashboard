export interface AppConfig {
  databaseUrl: string;
  dbPath: string;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

export const loadConfig = (): AppConfig => ({
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
  dbPath:
    process.env.OPENCODE_DB_PATH ??
    `${process.env.HOME ?? "."}/.local/share/opencode/opencode.db`,
});