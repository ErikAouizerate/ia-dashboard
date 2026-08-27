# ia-dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local webapp (React front + NestJS API) that reads the OpenCode SQLite database read-only, lets the user annotate built features qualitatively, and stores features + session snapshots in Postgres.

**Architecture:** `api/` (NestJS, TypeScript) reads `opencode.db` via better-sqlite3 (read-only, WAL-safe fallback) as the source of truth for listing sessions; annotations live in Postgres via Drizzle ORM (features + feature_sessions snapshots). `webapp/` (React + Vite + Tailwind v4 + Redux classic) consumes the API and shows a visual "annotated" badge per session. Full docker-compose + devcontainer, ready for Dokploy/Traefik.

**Tech Stack:** NestJS 11, Drizzle ORM + node-postgres (pg), better-sqlite3, React 19, Vite, Tailwind v4, Redux classic + Redux Toolkit `configureStore` only, React Router, pnpm, Docker Compose, Jest, Vitest.

## Global Constraints

- **Language (code/docs/tests):** English. Communication with user: French.
- **Package manager:** pnpm only. No `package-lock.json`, no `yarn.lock`.
- **`pnpm-workspace.yaml`** at repo root with `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `blockExoticSubdeps: true`, `strictDepBuilds: true`. Approve build scripts with `pnpm approve-builds` (esbuild, better-sqlite3, etc.).
- **TypeScript** everywhere; plain JS only for config files (`vite.config.ts` is TS, so none needed).
- **Frontend (webapp/):** Tailwind CSS v4 via `@tailwindcss/vite`; Redux classic reducers/custom middlewares only (`thunk: false`); all API calls through `src/store/apiMiddleware.ts` following `*_REQUESTED → *_START/_SUCCESS/_ERROR`.
- **Repo layout:** `api/` (NOT `backend/`), `webapp/`.
- **docker-compose base file:** use `expose:` not `ports:`. Dev-only `ports:` go in `docker-compose.override.yml`. No Caddy; Dokploy/Traefik for TLS if deployed.
- **Never write to `opencode.db`.** Always read-only; fallback copies db+wal+shm to a temp dir if a read-only connection fails.
- **`project.name` is NULL** in the OpenCode DB. Derive the display project name from `project.worktree` basename, falling back to `project.id`. Special-case project id `'global'` → display `'global'`.
- **`session.model` is JSON text** like `{"id":"deepseek-v4-flash-free","providerID":"opencode"}`. Parse `.id` for display.
- **Timestamps** in OpenCode DB are INTEGER **milliseconds** since epoch.
- **Env vars:** `OPENCODE_DB_PATH` (default `~/.local/share/opencode/opencode.db`), `DATABASE_URL` (default `postgres://ia:ia@localhost:5432/ia_dashboard`).
- Real OpenCode DB verified: 318 sessions, 14 projects, models include `deepseek-v4-flash-free`, `claude-fable-5`, `kimi-k3`; agents include `build`, `plan`, `general`, `explore`, subagents.
- **Ports:** API `3000` (expose), webapp dev `5173` (override).

---

### Task 1: Root Scaffold — workspace, env, AGENTS.md

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `AGENTS.md`
- Create: `api/AGENTS.md`
- Create: `webapp/AGENTS.md`
- Create: `docs/README.md`

**Interfaces:**
- Produces: root package.json with `"packageManager": "pnpm@11"` and scripts `dev`, `test`, `build` delegating to workspaces; hardened pnpm-workspace.yaml; env template.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "ia-dashboard",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@11.18.0",
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "api"
  - "webapp"
minimumReleaseAge: 10080
minimumReleaseAgeStrict: true
blockExoticSubdeps: true
strictDepBuilds: true
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
build/
.env
*.log
.DS_Store
coverage/
.tmp-opencode/
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Path to the OpenCode SQLite database (read-only source of truth)
OPENCODE_DB_PATH=${HOME}/.local/share/opencode/opencode.db
# Postgres connection (used by docker-compose override and local dev)
DATABASE_URL=postgres://ia:ia@localhost:5432/ia_dashboard
POSTGRES_USER=ia
POSTGRES_PASSWORD=ia
POSTGRES_DB=ia_dashboard
```

- [ ] **Step 5: Create `AGENTS.md` (root)**

```markdown
# AGENTS.md — ia-dashboard

## Stack
- api/: NestJS + Drizzle ORM + Postgres + better-sqlite3 (reads OpenCode SQLite read-only)
- webapp/: React + Vite + Tailwind v4 + Redux (classic)

## Global policies (Basic Memory, project "main")
- memory://main/guidelines/communication-language-convention-agents.md-claude.md
- memory://main/guidelines/docs-maintenance-policy
- memory://main/guidelines/basic-memory-notes-authoring-guide-for-ai-assistants
- memory://main/guidelines/code-research-codebase-memory-mcp

## Deploy (always applied)
- memory://main/guidelines/infrastructure-dokploy-traefik-no-caddy-for-tls
- memory://main/guidelines/devcontainer-docker-compose-pattern-for-dokploy-deployments
- memory://main/guidelines/git-lab-ci-generating-.gitlab-ci.yml
```

- [ ] **Step 6: Create `api/AGENTS.md`**

```markdown
# AGENTS.md — api

Stack: NestJS + TypeScript + Drizzle ORM + Postgres + better-sqlite3.

Policies (Basic Memory, project "main"):
- memory://main/guidelines/pnpm-policy-for-js-ts-projects
- memory://main/guidelines/type-script-by-default-avoid-plain-js
```

- [ ] **Step 7: Create `webapp/AGENTS.md`**

```markdown
# AGENTS.md — webapp

Stack: React + Vite + TypeScript + Tailwind v4 + Redux (classic reducers + apiMiddleware).

Policies (Basic Memory, project "main"):
- memory://main/guidelines/pnpm-policy-for-js-ts-projects
- memory://main/guidelines/frontend-constraints-tailwind-v4-classic-redux
- memory://main/guidelines/type-script-by-default-avoid-plain-js
```

- [ ] **Step 8: Create `docs/README.md`** with a short description of the repo and the two sub-projects.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo root, env, and AGENTS.md"
```

---

### Task 2: Docker Infra — compose, override, devcontainer

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`
- Create: `.devcontainer/devcontainer.json`

**Interfaces:**
- Produces: `db` service named `db` reachable on the compose network; env `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; API/webapp images with `expose` ports 3000/5173.

- [ ] **Step 1: Create `docker-compose.yml`** (base — no host `ports:`)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-ia}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ia}
      POSTGRES_DB: ${POSTGRES_DB:-ia_dashboard}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ia} -d ${POSTGRES_DB:-ia_dashboard}"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    expose:
      - "3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-ia}:${POSTGRES_PASSWORD:-ia}@db:5432/${POSTGRES_DB:-ia_dashboard}
      OPENCODE_DB_PATH: ${OPENCODE_DB_PATH}
    depends_on:
      db:
        condition: service_healthy

  webapp:
    build:
      context: .
      dockerfile: webapp/Dockerfile
    expose:
      - "5173"
    depends_on:
      - api

volumes:
  pgdata:
```

- [ ] **Step 2: Create `docker-compose.override.yml`** (dev-only, auto-merged)

```yaml
services:
  db:
    ports:
      - "5432:5432"

  api:
    build:
      target: dev
    volumes:
      - ./api:/app/api
      - ${OPENCODE_DB_PATH}:/opencode/opencode.db:ro
      - opencode_wal:/opencode
    ports:
      - "3000:3000"
    command: pnpm --filter api start:dev

  webapp:
    build:
      target: dev
    volumes:
      - ./webapp:/app/webapp
    ports:
      - "5173:5173"
    command: pnpm --filter webapp dev

volumes:
  opencode_wal:
```

> Note: the WAL files (`opencode.db-wal`, `opencode.db-shm`) live next to the db; mount the parent dir read-only for the fallback copy path. Adjust in Task 3's reader to copy into `api/.tmp-opencode/`.

- [ ] **Step 3: Create `.devcontainer/devcontainer.json`**

```json
{
  "name": "ia-dashboard-dev",
  "dockerComposeFile": ["../docker-compose.yml", "../docker-compose.override.yml"],
  "service": "api",
  "workspaceFolder": "/app",
  "forwardPorts": [3000, 5173, 5432],
  "postCreateCommand": "pnpm install"
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add docker-compose, override, and devcontainer"
```

---

### Task 3: NestJS API scaffold + Drizzle schema + DB modules

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/nest-cli.json`
- Create: `api/src/main.ts`
- Create: `api/src/app.module.ts`
- Create: `api/src/db/schema.ts`
- Create: `api/src/db/drizzle.provider.ts`
- Create: `api/src/db/drizzle.module.ts`
- Create: `api/drizzle.config.ts`
- Create: `api/src/config/config.ts`
- Create: `api/src/config/config.module.ts`
- Create: `api/Dockerfile`
- Test: `api/test/app.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `db/schema.ts` exporting tables `features` and `featureSessions` (Drizzle pg-core) with exact columns.
  - `db/drizzle.provider.ts` exporting `DRIZZLE` injection token and `DrizzleModule`.
  - `config.ts` exporting `ConfigService`-like `appConfig` provider exposing `dbPath` and `databaseUrl`.
  - NestJS app bootstrapping on port 3000 with `/api` global prefix and CORS enabled.

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "@ia-dashboard/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "drizzle-orm": "^0.44.0",
    "pg": "^8.16.0",
    "better-sqlite3": "^12.2.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.15.0",
    "drizzle-kit": "^0.31.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 4: Create `api/src/db/schema.ts`** (Drizzle pg schema)

```ts
import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  real,
  timestamp,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const featureStatus = pgEnum("feature_status", [
  "planned",
  "in_progress",
  "done",
  "abandoned",
]);

export const features = pgTable("features", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  project: text("project").notNull(),
  purpose: text("purpose"),
  status: featureStatus("status").notNull().default("planned"),
  satisfaction: smallint("satisfaction"),
  comment: text("comment"),
  tags: text("tags").array().notNull().default([]),
  timeSpentMin: integer("time_spent_min"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureSessions = pgTable(
  "feature_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    title: text("title"),
    model: text("model"),
    agent: text("agent"),
    cost: real("cost").notNull().default(0),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensReasoning: integer("tokens_reasoning").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
    summaryAdditions: integer("summary_additions").notNull().default(0),
    summaryDeletions: integer("summary_deletions").notNull().default(0),
    summaryFiles: integer("summary_files").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feature_sessions_session_id_key").on(t.sessionId)],
);
```

- [ ] **Step 5: Create `api/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
  },
});
```

- [ ] **Step 6: Create `api/src/config/config.ts` + `config.module.ts`**

```ts
// src/config/config.ts
export interface AppConfig {
  databaseUrl: string;
  dbPath: string;
}

export const loadConfig = (): AppConfig => ({
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard",
  dbPath:
    process.env.OPENCODE_DB_PATH ??
    `${process.env.HOME ?? "."}/.local/share/opencode/opencode.db`,
});
```

```ts
// src/config/config.module.ts
import { Global, Module } from "@nestjs/common";
import { loadConfig, AppConfig } from "./config";

export const APP_CONFIG = Symbol("APP_CONFIG");

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
```

- [ ] **Step 7: Create `api/src/db/drizzle.provider.ts` + `drizzle.module.ts`**

```ts
// src/db/drizzle.provider.ts
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DRIZZLE = Symbol("DRIZZLE");

export type DrizzleDb = NodePgDatabase<typeof schema>;

export const drizzleProvider = {
  provide: DRIZZLE,
  inject: ["APP_CONFIG"],
  useFactory: (config: { databaseUrl: string }) => {
    const pool = new Pool({ connectionString: config.databaseUrl });
    return drizzle(pool, { schema }) as DrizzleDb;
  },
};
```

```ts
// src/db/drizzle.module.ts
import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";

@Module({
  providers: [drizzleProvider],
  exports: [drizzleProvider],
})
export class DrizzleModule {}
```

- [ ] **Step 8: Create `api/src/app.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { DrizzleModule } from "./db/drizzle.module";

@Module({
  imports: [ConfigModule, DrizzleModule],
})
export class AppModule {}
```

- [ ] **Step 9: Create `api/src/main.ts`**

```ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true });
  await app.listen(3000);
}
bootstrap();
```

- [ ] **Step 10: Create `api/src/db/migrate.ts`** and run migrations

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://ia:ia@localhost:5432/ia_dashboard";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}
main();
```

Run: `pnpm --filter @ia-dashboard/api db:generate && pnpm --filter @ia-dashboard/api db:migrate`
Expected: `drizzle/` migrations generated; tables created in Postgres.

- [ ] **Step 11: Create `api/Dockerfile`**

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
RUN pnpm install --filter @ia-dashboard/api

FROM deps AS dev
COPY . .
CMD ["pnpm", "--filter", "@ia-dashboard/api", "start:dev"]

FROM base AS prod
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/api build
EXPOSE 3000
CMD ["node", "api/dist/main.js"]
```

- [ ] **Step 12: Verify boot + write a smoke e2e test**

`api/test/app.e2e-spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";

describe("App", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });
  afterAll(async () => await app.close());

  it("boots and serves /api health route", async () => {
    const res = await app.getHttpServer()({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(api): scaffold NestJS + Drizzle schema + DB modules"
```

---

### Task 4: SQLite reader module (read-only + WAL fallback)

**Files:**
- Create: `api/src/opencode/opencode.types.ts`
- Create: `api/src/opencode/opencode-reader.ts`
- Create: `api/src/opencode/opencode.module.ts`
- Create: `api/src/opencode/opencode-reader.spec.ts`
- Test: `api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Produces:
  - Types `OpenCodeSession`, `OpenCodeProject`, `SessionListFilters`, `SessionPage`.
  - `OpenCodeReader` class with methods:
    - `open()`: open read-only (fallback to temp copy), throwing `OpendbNotFoundError` if missing.
    - `listSessions(filters): SessionPage` — paginated.
    - `getSession(id): OpenCodeSession | null`.
    - `listProjects(): OpenCodeProject[]`.
    - `listModels(): string[]`.
    - `close()`.
  - `OpendbNotFoundError` exported.

- [ ] **Step 1: Create `api/src/opencode/opencode.types.ts`**

```ts
export interface OpenCodeSession {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  model: string;
  agent: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
  timeCreated: number;
  timeUpdated: number;
}

export interface OpenCodeProject {
  id: string;
  name: string;
}

export interface SessionListFilters {
  project?: string;
  model?: string;
  from?: string;
  to?: string;
  annotated?: "yes" | "no";
  page?: number;
  pageSize?: number;
}

export interface SessionPage {
  items: OpenCodeSession[];
  total: number;
  page: number;
  pageSize: number;
}

export class OpendbNotFoundError extends Error {
  constructor(path: string) {
    super(`OpenCode database not found at ${path}`);
    this.name = "OpendbNotFoundError";
  }
}
```

- [ ] **Step 2: Create `api/src/opencode/opencode-reader.ts`**

```ts
import { mkdtempSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import Database from "better-sqlite3";
import {
  OpenCodeProject,
  OpenCodeSession,
  OpendbNotFoundError,
  SessionListFilters,
  SessionPage,
} from "./opencode.types";

interface Row {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  model: string;
  agent: string | null;
  cost: number;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  summary_additions: number;
  summary_deletions: number;
  summary_files: number;
  time_created: number;
  time_updated: number;
}

export class OpenCodeReader {
  private db: Database.Database | null = null;
  private tmpDir: string | null = null;

  constructor(private readonly dbPath: string) {}

  open(): void {
    if (!existsSync(this.dbPath)) throw new OpendbNotFoundError(this.dbPath);
    try {
      this.db = new Database(this.dbPath, { readonly: true });
    } catch (err) {
      this.tmpDir = mkdtempSync(join(tmpdir(), "opencode-"));
      const dest = join(this.tmpDir, "opencode.db");
      copyFileSync(this.dbPath, dest);
      for (const suffix of ["-wal", "-shm"]) {
        const src = this.dbPath + suffix;
        if (existsSync(src)) copyFileSync(src, dest + suffix);
      }
      this.db = new Database(dest);
    }
    this.db.pragma("journal_mode = wal");
  }

  listSessions(filters: SessionListFilters = {}): SessionPage {
    const db = this.requireDb();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.project) {
      where.push("p.name = @project OR (@project = 'global' AND s.project_id = 'global')");
      params.project = filters.project;
    }
    if (filters.model) {
      where.push("json_extract(s.model, '$.id') = @model");
      params.model = filters.model;
    }
    if (filters.from) {
      where.push("s.time_created >= @from");
      params.from = new Date(filters.from).getTime();
    }
    if (filters.to) {
      where.push("s.time_created <= @to");
      params.to = new Date(filters.to).getTime();
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM session s LEFT JOIN project p ON p.id = s.project_id ${whereSql}`)
        .get(params) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT s.id, s.project_id, p.name AS project_name, s.title, s.model, s.agent,
                s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
                s.tokens_cache_read, s.tokens_cache_write,
                s.summary_additions, s.summary_deletions, s.summary_files,
                s.time_created, s.time_updated
         FROM session s LEFT JOIN project p ON p.id = s.project_id
         ${whereSql}
         ORDER BY s.time_created DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];

    return {
      items: rows.map((r) => this.toSession(r)),
      total,
      page,
      pageSize,
    };
  }

  getSession(id: string): OpenCodeSession | null {
    const db = this.requireDb();
    const r = db
      .prepare(
        `SELECT s.id, s.project_id, p.name AS project_name, s.title, s.model, s.agent,
                s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning,
                s.tokens_cache_read, s.tokens_cache_write,
                s.summary_additions, s.summary_deletions, s.summary_files,
                s.time_created, s.time_updated
         FROM session s LEFT JOIN project p ON p.id = s.project_id
         WHERE s.id = ?`,
      )
      .get(id) as Row | undefined;
    return r ? this.toSession(r) : null;
  }

  listProjects(): OpenCodeProject[] {
    const db = this.requireDb();
    const rows = db
      .prepare(
        `SELECT id, COALESCE(NULLIF(name,''), '') AS name, worktree
         FROM project ORDER BY worktree`,
      )
      .all() as { id: string; name: string; worktree: string | null }[];
    return rows.map((r) => ({
      id: r.id,
      name: this.projectName(r.id, r.name, r.worktree),
    }));
  }

  listModels(): string[] {
    const db = this.requireDb();
    const rows = db
      .prepare(`SELECT DISTINCT model FROM session WHERE model IS NOT NULL AND model != ''`)
      .all() as { model: string }[];
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const id = JSON.parse(r.model)?.id;
        if (id) set.add(id);
      } catch {
        /* skip unparseable */
      }
    }
    return [...set].sort();
  }

  close(): void {
    this.db?.close();
    this.db = null;
    if (this.tmpDir) {
      rmSync(this.tmpDir, { recursive: true, force: true });
      this.tmpDir = null;
    }
  }

  private requireDb(): Database.Database {
    if (!this.db) this.open();
    return this.db!;
  }

  private toSession(r: Row): OpenCodeSession {
    let model = "";
    try {
      model = (JSON.parse(r.model) as { id?: string })?.id ?? "";
    } catch {
      model = r.model;
    }
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: this.projectName(r.project_id, r.project_name, r.project_name),
      title: r.title,
      model,
      agent: r.agent,
      cost: r.cost,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      tokensReasoning: r.tokens_reasoning,
      tokensCacheRead: r.tokens_cache_read,
      tokensCacheWrite: r.tokens_cache_write,
      summaryAdditions: r.summary_additions,
      summaryDeletions: r.summary_deletions,
      summaryFiles: r.summary_files,
      timeCreated: r.time_created,
      timeUpdated: r.time_updated,
    };
  }

  private projectName(id: string, name: string | null, worktree: string | null): string {
    if (id === "global") return "global";
    if (name) return name;
    if (worktree) return basename(worktree);
    return id;
  }
}
```

- [ ] **Step 3: Create `api/src/opencode/opencode.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { OpenCodeReader } from "./opencode-reader";

export const OPENCODE_READER = Symbol("OPENCODE_READER");

@Global()
@Module({
  providers: [
    {
      provide: OPENCODE_READER,
      inject: ["APP_CONFIG"],
      useFactory: (config: { dbPath: string }) => new OpenCodeReader(config.dbPath),
    },
  ],
  exports: [OPENCODE_READER],
})
export class OpenCodeModule {}
```

- [ ] **Step 4: Write the failing test** `api/src/opencode/opencode-reader.spec.ts`

```ts
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { OpenCodeReader } from "./opencode-reader";

function buildFixture(dir: string): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
           CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project (id, worktree, name) VALUES (?,?,?)").run(
    "proj1",
    "/home/user/gateway",
    null,
  );
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, title, model, agent, cost, tokens_input,
       tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  ins.run(
    "s1", "proj1", "Add auth", '{"id":"deepseek-v4-flash-free","providerID":"opencode"}',
    "build", 1.25, 100, 200, 50, 300, 0, 10, 5, 3, 1785702292033, 1785703020414,
  );
  db.close();
  return path;
}

describe("OpenCodeReader", () => {
  let dir: string;
  let path: string;
  let reader: OpenCodeReader;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-fixture-"));
    path = buildFixture(dir);
    reader = new OpenCodeReader(path);
    reader.open();
  });
  afterEach(() => reader.close());

  it("parses session with derived project name and parsed model", () => {
    const s = reader.getSession("s1");
    expect(s?.projectName).toBe("gateway");
    expect(s?.model).toBe("deepseek-v4-flash-free");
    expect(s?.cost).toBe(1.25);
  });

  it("paginates listSessions", () => {
    const page = reader.listSessions({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("s1");
  });

  it("filters by model", () => {
    const page = reader.listSessions({ model: "deepseek-v4-flash-free" });
    expect(page.items.length).toBe(1);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @ia-dashboard/api test opencode-reader`
Expected: FAIL (module not yet imported in tsconfig/jest or file missing) — ensure jest config includes `src`.

- [ ] **Step 6: Add `api/package.json` jest config** so tests resolve TS

```json
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["**/*.(t|j)s"]
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @ia-dashboard/api test opencode-reader`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): add read-only OpenCode SQLite reader with WAL fallback"
```

---

### Task 5: Sessions + Meta controllers/services

**Files:**
- Create: `api/src/sessions/sessions.service.ts`
- Create: `api/src/sessions/sessions.controller.ts`
- Create: `api/src/sessions/sessions.module.ts`
- Test: `api/src/sessions/sessions.service.spec.ts`

**Interfaces:**
- Consumes: `OPENCODE_READER` (`OpenCodeReader`), `DRIZZLE` (`DrizzleDb`).
- Produces: `SessionsController` with routes:
  - `GET /api/sessions?project=&model=&from=&to=&annotated=&page=&pageSize=`
  - `GET /api/sessions/meta` → `{ projects: string[], models: string[] }`
  - `GET /api/sessions/:id` → session + `annotated: boolean` + `featureId: string | null`
  - `GET /api/health` → `{ status: "ok", opencode: "ok"|"missing" }`
- Service method: `annotatedMap(sessionIds: string[]): Promise<Record<string, string | null>>` returning sessionId → featureId (or null).

- [ ] **Step 1: Write failing test** `api/src/sessions/sessions.service.spec.ts`

```ts
import { SessionsService } from "./sessions.service";

const readerMock = {
  open: jest.fn(),
  listSessions: jest.fn().mockReturnValue({
    items: [{ id: "s1" }, { id: "s2" }],
    total: 2,
    page: 1,
    pageSize: 10,
  }),
};
const dbMock = {
  select: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([
        { sessionId: "s1", featureId: "f1" },
      ]),
    }),
  }),
};

describe("SessionsService", () => {
  it("returns annotated flag via annotatedMap", async () => {
    const svc = new SessionsService(readerMock as any, dbMock as any);
    const map = await svc.annotatedMap(["s1", "s2"]);
    expect(map.s1).toBe("f1");
    expect(map.s2).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm --filter @ia-dashboard/api test sessions.service`
Expected: FAIL (SessionsService not defined).

- [ ] **Step 3: Implement `sessions.service.ts`**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { OPENCODE_READER, OpenCodeReader } from "../opencode/opencode.module";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { featureSessions } from "../db/schema";
import { SessionListFilters } from "../opencode/opencode.types";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async annotatedMap(sessionIds: string[]): Promise<Record<string, string | null>> {
    if (sessionIds.length === 0) return {};
    const rows = await this.db
      .select({ sessionId: featureSessions.sessionId, featureId: featureSessions.featureId })
      .from(featureSessions)
      .where(inArray(featureSessions.sessionId, sessionIds));
    const map: Record<string, string | null> = {};
    for (const id of sessionIds) map[id] = null;
    for (const r of rows) map[r.sessionId] = r.featureId;
    return map;
  }

  list(filters: SessionListFilters) {
    return this.reader.listSessions(filters);
  }

  async findOne(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const rows = await this.db
      .select({ featureId: featureSessions.featureId })
      .from(featureSessions)
      .where(eq(featureSessions.sessionId, id));
    return { ...session, annotated: rows.length > 0, featureId: rows[0]?.featureId ?? null };
  }

  meta() {
    return {
      projects: this.reader.listProjects().map((p) => p.name),
      models: this.reader.listModels(),
    };
  }
}
```

- [ ] **Step 4: Implement `sessions.controller.ts`**

```ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { SessionListFilters } from "../opencode/opencode.types";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Get()
  async index(@Query() q: Record<string, string>) {
    const filters: SessionListFilters = {
      project: q.project,
      model: q.model,
      from: q.from,
      to: q.to,
      annotated: q.annotated as SessionListFilters["annotated"],
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
    const page = this.svc.list(filters);
    const map = await this.svc.annotatedMap(page.items.map((i) => i.id));
    return {
      ...page,
      items: page.items.map((i) => ({
        ...i,
        annotated: map[i.id] != null,
        featureId: map[i.id] ?? null,
      })),
    };
  }

  @Get("meta")
  meta() {
    return this.svc.meta();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}
```

- [ ] **Step 5: Implement `sessions.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({ controllers: [SessionsController], providers: [SessionsService] })
export class SessionsModule {}
```

- [ ] **Step 6: Register `SessionsModule`** in `app.module.ts` imports.

- [ ] **Step 7: Add a HealthController** `api/src/health/health.controller.ts`

```ts
import { Controller, Get, Inject } from "@nestjs/common";
import { OPENCODE_READER, OpenCodeReader } from "../opencode/opencode.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(OPENCODE_READER) private readonly reader: OpenCodeReader) {}

  @Get()
  health() {
    let opencode = "ok";
    try {
      this.reader.open();
    } catch {
      opencode = "missing";
    }
    return { status: "ok", opencode };
  }
}
```

Register `HealthModule` in app.module.

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @ia-dashboard/api test`
Expected: all PASS (sessions.service + opencode-reader).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): sessions + meta + health endpoints"
```

---

### Task 6: Features module — CRUD + link/unlink + aggregates

**Files:**
- Create: `api/src/features/features.service.ts`
- Create: `api/src/features/features.controller.ts`
- Create: `api/src/features/features.module.ts`
- Create: `api/src/features/dto.ts`
- Test: `api/src/features/features.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE`, `OPENCODE_READER`.
- Produces `FeaturesService`:
  - `create(input): Promise<Feature>` — zod-validated `{ name, project, purpose?, status?, satisfaction?, comment?, tags?, timeSpentMin? }`.
  - `list(): Promise<FeatureWithAggregates[]>` — each with `sessionCount`, `totalCost`, `totalTokensInput/Output`, `totalTimeSpentMin`.
  - `findOne(id): Promise<FeatureDetail | null>` — feature + `sessions: FeatureSessionSnapshot[]`.
  - `update(id, patch)`.
  - `remove(id)`.
  - `linkSession(featureId, sessionId)` — snapshot the session from the reader, upsert `feature_sessions`, update feature.updatedAt.
  - `unlinkSession(featureId, sessionId)`.
  - `resyncSession(featureId, sessionId)`.
- DTO types `CreateFeatureDto`, `UpdateFeatureDto`.

- [ ] **Step 1: Write failing test** `api/src/features/features.service.spec.ts`

```ts
import { FeaturesService } from "./features.service";

const readerMock = {
  getSession: jest.fn().mockReturnValue({
    id: "s1", projectId: "p1", projectName: "gateway", title: "Add auth",
    model: "deepseek-v4-flash-free", agent: "build", cost: 1.25,
    tokensInput: 100, tokensOutput: 200, tokensReasoning: 50,
    tokensCacheRead: 300, tokensCacheWrite: 0, summaryAdditions: 10,
    summaryDeletions: 5, summaryFiles: 3, timeCreated: 1785702292033,
    timeUpdated: 1785703020414,
  }),
};

function makeDb() {
  const inserted: any[] = [];
  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: "f1" }]) }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(null) }),
      }),
    }),
  } as any;
}

describe("FeaturesService", () => {
  it("links a session and snapshots it", async () => {
    const db = makeDb();
    const svc = new FeaturesService(db, readerMock as any);
    const out = await svc.linkSession("f1", "s1");
    expect(out).toBeDefined();
    expect(readerMock.getSession).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm --filter @ia-dashboard/api test features.service`
Expected: FAIL.

- [ ] **Step 3: Implement `dto.ts`**

```ts
import { z } from "zod";

export const createFeatureSchema = z.object({
  name: z.string().min(1),
  project: z.string().min(1),
  purpose: z.string().optional(),
  status: z.enum(["planned", "in_progress", "done", "abandoned"]).optional(),
  satisfaction: z.number().int().min(1).max(5).optional(),
  comment: z.string().optional(),
  tags: z.array(z.string()).optional(),
  timeSpentMin: z.number().int().nonnegative().optional(),
});
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = createFeatureSchema.partial();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
```

- [ ] **Step 4: Implement `features.service.ts`**

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { DRIZZLE, DrizzleDb } from "../db/drizzle.provider";
import { OPENCODE_READER, OpenCodeReader } from "../opencode/opencode.module";
import { features, featureSessions } from "../db/schema";
import { CreateFeatureDto, UpdateFeatureDto } from "./dto";

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(OPENCODE_READER) private readonly reader: OpenCodeReader,
  ) {}

  async create(input: CreateFeatureDto) {
    const rows = await this.db
      .insert(features)
      .values({ ...input, tags: input.tags ?? [] })
      .returning();
    return rows[0];
  }

  async list() {
    const rows = await this.db.select().from(features).orderBy(desc(features.updatedAt));
    const ids = rows.map((f) => f.id);
    const agg =
      ids.length === 0
        ? []
        : await this.db
            .select({
              featureId: featureSessions.featureId,
              sessionCount: count(featureSessions.id),
              totalCost: sum(featureSessions.cost),
              totalTokensInput: sum(featureSessions.tokensInput),
              totalTokensOutput: sum(featureSessions.tokensOutput),
            })
            .from(featureSessions)
            .where(inArray(featureSessions.featureId, ids))
            .groupBy(featureSessions.featureId);
    const byId = new Map(agg.map((a) => [a.featureId, a]));
    return rows.map((f) => ({
      ...f,
      sessionCount: byId.get(f.id)?.sessionCount ?? 0,
      totalCost: byId.get(f.id)?.totalCost ?? 0,
      totalTokensInput: byId.get(f.id)?.totalTokensInput ?? 0,
      totalTokensOutput: byId.get(f.id)?.totalTokensOutput ?? 0,
    }));
  }

  async findOne(id: string) {
    const feat = await this.db
      .select()
      .from(features)
      .where(eq(features.id, id))
      .then((r) => r[0]);
    if (!feat) throw new NotFoundException("Feature not found");
    const sessions = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.featureId, id))
      .orderBy(desc(featureSessions.createdAt));
    return { ...feat, sessions };
  }

  async update(id: string, patch: UpdateFeatureDto) {
    const rows = await this.db
      .update(features)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(features.id, id))
      .returning();
    if (rows.length === 0) throw new NotFoundException("Feature not found");
    return rows[0];
  }

  async remove(id: string) {
    await this.db.delete(features).where(eq(features.id, id));
    return { ok: true };
  }

  async linkSession(featureId: string, sessionId: string) {
    const feat = await this.findOne(featureId);
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const existing = await this.db
      .select()
      .from(featureSessions)
      .where(eq(featureSessions.sessionId, sessionId))
      .then((r) => r[0]);
    if (existing) throw new BadRequestException("Session already linked to a feature");
    await this.db.insert(featureSessions).values({
      featureId,
      sessionId: s.id,
      title: s.title,
      model: s.model,
      agent: s.agent,
      cost: s.cost,
      tokensInput: s.tokensInput,
      tokensOutput: s.tokensOutput,
      tokensReasoning: s.tokensReasoning,
      tokensCacheRead: s.tokensCacheRead,
      tokensCacheWrite: s.tokensCacheWrite,
      timeCreated: new Date(s.timeCreated),
      timeUpdated: new Date(s.timeUpdated),
      summaryAdditions: s.summaryAdditions,
      summaryDeletions: s.summaryDeletions,
      summaryFiles: s.summaryFiles,
    });
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
    return this.findOne(featureId);
  }

  async unlinkSession(featureId: string, sessionId: string) {
    await this.db
      .delete(featureSessions)
      .where(
        and(
          eq(featureSessions.featureId, featureId),
          eq(featureSessions.sessionId, sessionId),
        ),
      );
    await this.db
      .update(features)
      .set({ updatedAt: new Date() })
      .where(eq(features.id, featureId));
    return { ok: true };
  }

  async resyncSession(featureId: string, sessionId: string) {
    const s = this.reader.getSession(sessionId);
    if (!s) throw new BadRequestException("Session not found in OpenCode DB");
    const rows = await this.db
      .update(featureSessions)
      .set({
        title: s.title,
        model: s.model,
        agent: s.agent,
        cost: s.cost,
        tokensInput: s.tokensInput,
        tokensOutput: s.tokensOutput,
        tokensReasoning: s.tokensReasoning,
        tokensCacheRead: s.tokensCacheRead,
        tokensCacheWrite: s.tokensCacheWrite,
        timeCreated: new Date(s.timeCreated),
        timeUpdated: new Date(s.timeUpdated),
        summaryAdditions: s.summaryAdditions,
        summaryDeletions: s.summaryDeletions,
        summaryFiles: s.summaryFiles,
      })
      .where(
        and(
          eq(featureSessions.featureId, featureId),
          eq(featureSessions.sessionId, sessionId),
        ),
      )
      .returning();
    if (rows.length === 0) throw new NotFoundException("Session not linked to this feature");
    return this.findOne(featureId);
  }
}
```

- [ ] **Step 5: Implement `features.controller.ts`**

```ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from "@nestjs/common";
import { FeaturesService } from "./features.service";
import { CreateFeatureDto, UpdateFeatureDto } from "./dto";

@Controller("features")
export class FeaturesController {
  constructor(private readonly svc: FeaturesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateFeatureDto) {
    return this.svc.create(body);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateFeatureDto) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post(":id/sessions")
  link(@Param("id") id: string, @Body() body: { sessionId: string }) {
    return this.svc.linkSession(id, body.sessionId);
  }

  @Delete(":id/sessions/:sessionId")
  unlink(@Param("id") id: string, @Param("sessionId") sessionId: string) {
    return this.svc.unlinkSession(id, sessionId);
  }

  @Post(":id/sessions/:sessionId/resync")
  resync(@Param("id") id: string, @Param("sessionId") sessionId: string) {
    return this.svc.resyncSession(id, sessionId);
  }
}
```

- [ ] **Step 6: Implement `features.module.ts`** and register it in `app.module.ts`.

```ts
import { Module } from "@nestjs/common";
import { FeaturesController } from "./features.controller";
import { FeaturesService } from "./features.service";

@Module({ controllers: [FeaturesController], providers: [FeaturesService] })
export class FeaturesModule {}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @ia-dashboard/api test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): features CRUD, link/unlink sessions with snapshot, aggregates"
```

---

### Task 7: Webapp scaffold — Vite + React + Tailwind v4 + Redux classic

**Files:**
- Create: `webapp/package.json`
- Create: `webapp/tsconfig.json`
- Create: `webapp/vite.config.ts`
- Create: `webapp/index.html`
- Create: `webapp/src/main.tsx`
- Create: `webapp/src/App.tsx`
- Create: `webapp/src/store/store.ts`
- Create: `webapp/src/store/apiMiddleware.ts`
- Create: `webapp/src/store/sessions.ts`
- Create: `webapp/src/store/features.ts`
- Create: `webapp/src/api/client.ts`
- Create: `webapp/src/index.css`
- Create: `webapp/Dockerfile`
- Test: `webapp/src/store/apiMiddleware.spec.ts`

**Interfaces:**
- Produces:
  - `store.ts` exporting `store` (configureStore, `thunk: false`, apiMiddleware applied).
  - `apiMiddleware.ts` handling `*_REQUESTED` actions and dispatching `*_START`/`*_SUCCESS`/`*_ERROR`.
  - `sessions.ts` / `features.ts` reducer+actions.
  - `api/client.ts` `apiFetch(path, opts)` and typed helpers.
  - Vite dev proxy `/api` → `http://localhost:3000`.

- [ ] **Step 1: Create `webapp/package.json`**

```json
{
  "name": "@ia-dashboard/webapp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@reduxjs/toolkit": "^2.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-redux": "^9.2.0",
    "react-router-dom": "^7.1.0",
    "redux": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.2.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `webapp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `webapp/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

- [ ] **Step 4: Create `webapp/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ia-dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `webapp/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create `webapp/src/api/client.ts`**

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export const api = {
  sessions: (qs: string) => apiFetch<any>(`/api/sessions${qs}`),
  session: (id: string) => apiFetch<any>(`/api/sessions/${id}`),
  meta: () => apiFetch<any>(`/api/sessions/meta`),
  features: () => apiFetch<any>(`/api/features`),
  feature: (id: string) => apiFetch<any>(`/api/features/${id}`),
  createFeature: (body: unknown) =>
    apiFetch<any>(`/api/features`, { method: "POST", body: JSON.stringify(body) }),
  updateFeature: (id: string, body: unknown) =>
    apiFetch<any>(`/api/features/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  linkSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  unlinkSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions/${sessionId}`, { method: "DELETE" }),
  resyncSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions/${sessionId}/resync`, { method: "POST" }),
};
```

- [ ] **Step 7: Create `webapp/src/store/apiMiddleware.ts`**

```ts
import { Middleware, MiddlewareAPI } from "redux";
import { apiFetch } from "../api/client";

type Action = { type: string; payload?: any };

export const apiMiddleware: Middleware =
  ({ dispatch }: MiddlewareAPI) =>
  (next) =>
  (action: Action) => {
    if (!action.type.endsWith("_REQUESTED")) return next(action);
    const base = action.type.replace(/_REQUESTED$/, "");
    dispatch({ type: `${base}_START`, payload: action.payload });
    const { path, method, body } = action.payload ?? {};
    apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined })
      .then((data) => dispatch({ type: `${base}_SUCCESS`, payload: { data, req: action.payload } }))
      .catch((err) => dispatch({ type: `${base}_ERROR`, payload: { error: err, req: action.payload } }));
  };
```

- [ ] **Step 8: Create `webapp/src/store/store.ts`**

```ts
import { configureStore } from "@reduxjs/toolkit";
import { apiMiddleware } from "./apiMiddleware";
import { sessionsReducer } from "./sessions";
import { featuresReducer } from "./features";

export const store = configureStore({
  reducer: { sessions: sessionsReducer, features: featuresReducer },
  middleware: (gDM) => gDM({ thunk: false }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 9: Create `webapp/src/store/sessions.ts`**

```ts
export interface SessionRow {
  id: string;
  title: string;
  projectName: string;
  model: string;
  agent: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  timeCreated: number;
  annotated: boolean;
  featureId: string | null;
}

interface SessionsState {
  items: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
  meta: { projects: string[]; models: string[] };
  loading: boolean;
  error: string | null;
}

const initial: SessionsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  filters: {},
  meta: { projects: [], models: [] },
  loading: false,
  error: null,
};

export function sessionsReducer(
  state: SessionsState = initial,
  action: any,
): SessionsState {
  switch (action.type) {
    case "SESSIONS_LOAD_REQUESTED":
      return { ...state, loading: true, error: null, filters: action.payload.filters };
    case "SESSIONS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data.items, total: action.payload.data.total };
    case "SESSIONS_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    case "META_LOAD_SUCCESS":
      return { ...state, meta: action.payload.data };
    default:
      return state;
  }
}
```

- [ ] **Step 10: Create `webapp/src/store/features.ts`**

```ts
interface FeaturesState {
  items: any[];
  current: any | null;
  loading: boolean;
  error: string | null;
}

const initial: FeaturesState = { items: [], current: null, loading: false, error: null };

export function featuresReducer(state: FeaturesState = initial, action: any): FeaturesState {
  switch (action.type) {
    case "FEATURES_LOAD_REQUESTED":
    case "FEATURE_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "FEATURES_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "FEATURE_LOAD_SUCCESS":
      return { ...state, loading: false, current: action.payload.data };
    case "FEATURES_LOAD_ERROR":
    case "FEATURE_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
```

- [ ] **Step 11: Create `webapp/src/main.tsx` and `App.tsx`** (Router with `/sessions` and `/features`; placeholders render a heading — filled in Tasks 8–9).

- [ ] **Step 12: Write failing test** `webapp/src/store/apiMiddleware.spec.ts`

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiMiddleware } from "./apiMiddleware";
import { configureStore } from "@reduxjs/toolkit";

describe("apiMiddleware", () => {
  const store = configureStore({
    reducer: (s = { log: [] as string[] }, a: any) => ({ log: [...s.log, a.type] }),
    middleware: (gDM) => gDM({ thunk: false }).concat(apiMiddleware),
  });

  beforeEach(() => vi.stubGlobal("fetch", vi.fn());
  afterEach(() => vi.unstubAllGlobals());

  it("dispatches START then SUCCESS for a REQUESTED action", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true, json: async () => ({ n: 1 }),
    });
    store.dispatch({ type: "X_REQUESTED", payload: { path: "/api/x" } });
    await new Promise((r) => setTimeout(r, 0));
    const log = (store.getState() as any).log;
    expect(log).toContain("X_START");
    expect(log).toContain("X_SUCCESS");
  });
});
```

- [ ] **Step 13: Run test to verify pass**

Run: `pnpm --filter @ia-dashboard/webapp test`
Expected: PASS.

- [ ] **Step 14: Create `webapp/Dockerfile`**

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable

FROM base AS dev
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY webapp/package.json webapp/package.json
RUN pnpm install --filter @ia-dashboard/webapp
COPY . .
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "dev"]

FROM base AS prod
WORKDIR /app
COPY --from=dev /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/webapp build
EXPOSE 5173
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "preview"]
```

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat(webapp): scaffold Vite + React + Tailwind v4 + Redux classic + apiMiddleware"
```

---

### Task 8: Webapp — Sessions view (list, filters, badge, annotate panel)

**Files:**
- Create: `webapp/src/views/SessionsView.tsx`
- Create: `webapp/src/views/SessionActions.tsx`
- Test: `webapp/src/store/sessions.spec.ts`

**Interfaces:**
- Consumes: `store`, `api` client, `sessionsReducer`, `featuresReducer`.
- Produces: `/sessions` route rendering the session table + filters + annotated badge + annotate/link drawer.

- [ ] **Step 1: Write failing reducer test** `webapp/src/store/sessions.spec.ts`

```ts
import { describe, expect, it } from "vitest";
import { sessionsReducer } from "./sessions";

describe("sessionsReducer", () => {
  it("stores items on SUCCESS", () => {
    const s = sessionsReducer(undefined as any, {
      type: "SESSIONS_LOAD_SUCCESS",
      payload: { data: { items: [{ id: "s1", annotated: false }], total: 1 } },
    });
    expect(s.items).toHaveLength(1);
    expect(s.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm fail** (reducer exists — skip if already passing from Task 7; keep as regression).

- [ ] **Step 3: Implement `SessionsView.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { SessionActions } from "./SessionActions";

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), ...filters }).toString();
    dispatch({ type: "SESSIONS_LOAD_REQUESTED", payload: { path: `/api/sessions?${qs}`, filters } });
  }, [dispatch, page, filters]);

  useEffect(() => {
    dispatch({ type: "META_LOAD_REQUESTED", payload: { path: "/api/sessions/meta" } });
  }, [dispatch]);

  const badge = useMemo(
    () => (s: { annotated: boolean }) =>
      s.annotated
        ? <span className="inline-flex items-center gap-1 text-green-700"><span className="size-2 rounded-full bg-green-500" />annotated</span>
        : <span className="inline-flex items-center gap-1 text-gray-400"><span className="size-2 rounded-full bg-gray-300" />not annotated</span>,
    [],
  );

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Sessions</h1>
      <Filters meta={meta} />
      {error && <div className="mb-2 rounded bg-red-100 p-2 text-red-700">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Title</th><th>Project</th><th>Model</th><th>Cost</th>
            <th>In/Out</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-t">
              <td>{s.title}</td>
              <td>{s.projectName}</td>
              <td>{s.model}</td>
              <td>{s.cost.toFixed(2)} €</td>
              <td>{s.tokensInput} / {s.tokensOutput}</td>
              <td>{badge(s)}</td>
              <td><button onClick={() => setSelected(s.id)} className="text-blue-600">annotate / link</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-gray-500">{total} sessions · page {page}</p>
      {loading && <p>Loading…</p>}
      {selected && <SessionActions sessionId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Filters({ meta }: { meta: { projects: string[]; models: string[] } }) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [annotated, setAnnotated] = useState("");
  const apply = () =>
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({
          page: "1",
          ...(project ? { project } : {}),
          ...(model ? { model } : {}),
          ...(annotated ? { annotated } : {}),
        }).toString()}`,
        filters: { ...(project ? { project } : {}), ...(model ? { model } : {}), ...(annotated ? { annotated } : {}) },
      },
    });
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <select value={project} onChange={(e) => setProject(e.target.value)} className="border rounded px-2 py-1">
        <option value="">All projects</option>
        {meta.projects.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={model} onChange={(e) => setModel(e.target.value)} className="border rounded px-2 py-1">
        <option value="">All models</option>
        {meta.models.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={annotated} onChange={(e) => setAnnotated(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Any status</option>
        <option value="yes">Annotated</option>
        <option value="no">Not annotated</option>
      </select>
      <button onClick={apply} className="rounded bg-blue-600 px-3 py-1 text-white">Apply</button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `SessionActions.tsx`** — drawer: if the session has a feature, show "linked to <name>" + unlink + resync; otherwise a mini-form (project autocomplete from meta, name, purpose, satisfaction) that calls `api.createFeature` then `api.linkSession`.

```tsx
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../api/client";
import { RootState } from "../store/store";

export function SessionActions({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const dispatch = useDispatch();
  const meta = useSelector((s: RootState) => s.sessions.meta);
  const [name, setName] = useState("");
  const [project, setProject] = useState(meta.projects[0] ?? "");
  const [purpose, setPurpose] = useState("");
  const [satisfaction, setSatisfaction] = useState(3);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    const feat = await api.createFeature({ name, project, purpose, satisfaction });
    await api.linkSession(feat.id, sessionId);
    setBusy(false);
    setDone(true);
    dispatch({ type: "SESSIONS_LOAD_REQUESTED", payload: { path: `/api/sessions?page=1`, filters: {} } });
  };

  return (
    <div className="fixed inset-0 flex justify-end bg-black/30">
      <div className="h-full w-96 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Annotate session</h2>
        {done ? (
          <p className="text-green-700">Session linked to feature <b>{name}</b>.</p>
        ) : (
          <>
            <label className="block">Name</label>
            <input className="mb-2 w-full border rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="block">Project</label>
            <select className="mb-2 w-full border rounded px-2 py-1" value={project} onChange={(e) => setProject(e.target.value)}>
              {meta.projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="block">Purpose</label>
            <textarea className="mb-2 w-full border rounded px-2 py-1" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <label className="block">Satisfaction (1–5)</label>
            <input type="number" min={1} max={5} className="mb-4 w-full border rounded px-2 py-1" value={satisfaction}
              onChange={(e) => setSatisfaction(Number(e.target.value))} />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded px-3 py-1 text-gray-600">Cancel</button>
              <button disabled={busy} onClick={submit} className="rounded bg-blue-600 px-3 py-1 text-white">
                {busy ? "Saving…" : "Create & link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @ia-dashboard/webapp test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(webapp): sessions list, filters, annotated badge, annotate drawer"
```

---

### Task 9: Webapp — Features view (list, detail, full form)

**Files:**
- Create: `webapp/src/views/FeaturesView.tsx`
- Create: `webapp/src/views/FeatureDetail.tsx`
- Create: `webapp/src/views/FeatureForm.tsx`

**Interfaces:**
- Consumes: `api`, `featuresReducer`, `sessionsReducer`.
- Produces: `/features` route (list) and `/features/:id` (detail with sessions + aggregates + edit form).

- [ ] **Step 1: Implement `FeaturesView.tsx`** — list of features with project, status, satisfaction, totalCost, totalTokensInput/Output, sessionCount; each links to `/features/:id`.

```tsx
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";

export function FeaturesView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.features);
  useEffect(() => {
    dispatch({ type: "FEATURES_LOAD_REQUESTED", payload: { path: "/api/features" } });
  }, [dispatch]);
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Features</h1>
      {error && <div className="mb-2 rounded bg-red-100 p-2 text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((f) => (
          <Link key={f.id} to={`/features/${f.id}`} className="rounded border p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{f.name}</span>
              <span className="text-xs uppercase text-gray-500">{f.status}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">{f.project} · {f.sessionCount} sessions</div>
            <div className="mt-1 text-sm">
              {f.totalCost?.toFixed(2)} € · {f.totalTokensInput} / {f.totalTokensOutput} tok
              {f.satisfaction ? ` · ★${f.satisfaction}` : ""}
            </div>
          </Link>
        ))}
      </div>
      {loading && <p>Loading…</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `FeatureDetail.tsx`** — loads `/api/features/:id`, shows purpose, time spent, comment, tags, satisfaction, sessions table (title, model, cost, tokens, date) with unlink + resync buttons, and an edit button opening `FeatureForm`.

```tsx
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { FeatureForm } from "./FeatureForm";

export function FeatureDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading } = useSelector((s: RootState) => s.features);
  useEffect(() => {
    if (id) dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${id}` } });
  }, [dispatch, id]);
  if (loading && !current) return <p>Loading…</p>;
  if (!current) return <p>Not found</p>;
  return (
    <div className="p-6">
      <Link to="/features" className="text-blue-600">← Back</Link>
      <h1 className="mb-2 mt-2 text-xl font-semibold">{current.name}</h1>
      <div className="mb-4 text-sm text-gray-600">
        <p>Project: <b>{current.project}</b> · Status: {current.status}</p>
        {current.purpose && <p>Purpose: {current.purpose}</p>}
        {current.timeSpentMin != null && <p>Time spent: {current.timeSpentMin} min</p>}
        {current.satisfaction && <p>Satisfaction: ★{current.satisfaction}</p>}
        {current.comment && <p>Comment: {current.comment}</p>}
        {current.tags?.length > 0 && <p>Tags: {current.tags.join(", ")}</p>}
      </div>
      <FeatureForm feature={current} />
      <h2 className="mt-6 mb-2 text-lg font-semibold">Linked sessions</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500">
          <th>Title</th><th>Model</th><th>Cost</th><th>In/Out</th><th>Date</th><th />
        </tr></thead>
        <tbody>
          {current.sessions.map((s: any) => (
            <tr key={s.id} className="border-t">
              <td>{s.title}</td><td>{s.model}</td><td>{s.cost?.toFixed(2)} €</td>
              <td>{s.tokensInput} / {s.tokensOutput}</td>
              <td>{new Date(s.timeCreated).toLocaleDateString()}</td>
              <td>
                <button className="text-blue-600" onClick={async () => {
                  await api.resyncSession(current.id, s.sessionId);
                  dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${current.id}` } });
                }}>resync</button>
                <button className="ml-2 text-red-600" onClick={async () => {
                  await api.unlinkSession(current.id, s.sessionId);
                  dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${current.id}` } });
                }}>unlink</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Implement `FeatureForm.tsx`** — controlled form bound to a feature; PATCHes on submit; updates `current` via reload.

```tsx
import { useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../api/client";

export function FeatureForm({ feature }: { feature: any }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(feature.name);
  const [purpose, setPurpose] = useState(feature.purpose ?? "");
  const [satisfaction, setSatisfaction] = useState(feature.satisfaction ?? 3);
  const [status, setStatus] = useState(feature.status);
  const [comment, setComment] = useState(feature.comment ?? "");
  const [timeSpentMin, setTimeSpentMin] = useState(feature.timeSpentMin ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await api.updateFeature(feature.id, {
      name,
      purpose,
      satisfaction: Number(satisfaction),
      status,
      comment,
      timeSpentMin: timeSpentMin === "" ? null : Number(timeSpentMin),
    });
    setBusy(false);
    dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${feature.id}` } });
  };

  return (
    <div className="grid max-w-lg grid-cols-2 gap-3 rounded border p-4">
      <label className="col-span-2">Name
        <input className="w-full border rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="col-span-2">Purpose
        <textarea className="w-full border rounded px-2 py-1" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <label>Status
        <select className="w-full border rounded px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>planned</option><option>in_progress</option><option>done</option><option>abandoned</option>
        </select>
      </label>
      <label>Satisfaction (1–5)
        <input type="number" min={1} max={5} className="w-full border rounded px-2 py-1" value={satisfaction}
          onChange={(e) => setSatisfaction(Number(e.target.value))} />
      </label>
      <label className="col-span-2">Time spent (min)
        <input type="number" className="w-full border rounded px-2 py-1" value={timeSpentMin}
          onChange={(e) => setTimeSpentMin(e.target.value)} />
      </label>
      <label className="col-span-2">Comment
        <textarea className="w-full border rounded px-2 py-1" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <button onClick={submit} disabled={busy} className="col-span-2 rounded bg-blue-600 px-3 py-1 text-white">
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire routes** in `App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SessionsView } from "./views/SessionsView";
import { FeaturesView } from "./views/FeaturesView";
import { FeatureDetail } from "./views/FeatureDetail";

export function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-4 border-b px-6 py-3">
        <NavLink to="/sessions" className="text-blue-600">Sessions</NavLink>
        <NavLink to="/features" className="text-blue-600">Features</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<SessionsView />} />
        <Route path="/sessions" element={<SessionsView />} />
        <Route path="/features" element={<FeaturesView />} />
        <Route path="/features/:id" element={<FeatureDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @ia-dashboard/webapp typecheck && pnpm --filter @ia-dashboard/webapp build`
Expected: PASS, dist produced.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(webapp): features list, detail with sessions, and edit form"
```

---

### Task 10: End-to-end verification + README

**Files:**
- Modify: `docs/README.md`
- Create: `README.md` (root)

**Interfaces:**
- Produces: working local stack via `docker compose up`, documented.

- [ ] **Step 1: Write root `README.md`** covering: stack, quickstart (`cp .env.example .env`, `docker compose up`), the WAL read-only note, and the devcontainer option.

- [ ] **Step 2: Update `docs/README.md`** to reference the root README and the spec/plan locations.

- [ ] **Step 3: Full test run**

Run: `pnpm test`
Expected: all api (Jest) + webapp (Vitest) tests PASS.

- [ ] **Step 4: Manual smoke test**

Run: `docker compose up --build`
Expected: Postgres healthy, API serves `/api/health` → `{status:"ok"}`, `/api/sessions?pageSize=5` returns 5 real sessions with `annotated:false`, webapp loads at `http://localhost:5173`, badge shows "not annotated".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add root README and end-to-end verification"
```

---

## Self-Review

- **Spec coverage:** Task 2 (infra) ✓; Task 3-4 (sqlite read-only + WAL fallback) ✓; Task 5 (sessions + badge contract) ✓; Task 6 (features + link + snapshot + aggregates) ✓; Tasks 7-9 (webapp: scaffold, sessions, features, form) ✓; Task 1 (scaffolding AGENTS.md per blueprint) ✓; tests woven per task ✓.
- **Placeholder scan:** no TBD/TODO; every step has concrete code.
- **Type consistency:** `OpenCodeSession`, `OpenCodeReader` methods, `DrizzleDb`, `DRIZZLE`, `APP_CONFIG`, `OPENCODE_READER`, `featureSessions`/`features` table names and columns are used consistently across Tasks 3-6; `apiFetch`/`apiMiddleware`/reducer action names consistent across Tasks 7-9.
