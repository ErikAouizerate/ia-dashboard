import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { APP_CONFIG, AppConfig } from "../config/config";

export const DRIZZLE = Symbol("DRIZZLE");

export type DrizzleDb = NodePgDatabase<typeof schema>;

export const drizzleProvider = {
  provide: DRIZZLE,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => {
    const pool = new Pool({ connectionString: config.databaseUrl });
    return drizzle(pool, { schema }) as DrizzleDb;
  },
};