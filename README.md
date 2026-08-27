# ia-dashboard

Local dashboard that reads the OpenCode SQLite database (read-only) and lets you
**annotate the features you built with LLM assistance — qualitatively, not just
quantitatively**. Each session (or group of sessions) maps to a feature you
annotate by hand: purpose, satisfaction, time spent, status. Cost and tokens are
snapshotted automatically from OpenCode, so you keep the numbers without typing
them.

- **API** — NestJS (TypeScript), reads `opencode.db` via better-sqlite3 (read-only,
  WAL-safe), stores features + session snapshots in Postgres via Drizzle ORM.
- **Webapp** — React + Vite + Tailwind v4 + Redux (classic). Lists sessions with an
  **annotated / not-annotated badge**, lets you annotate or link a session to a
  feature, and shows feature aggregates (cost, tokens, session count).

## Stack

- `api/` — NestJS + Drizzle ORM + Postgres + better-sqlite3 (reads OpenCode SQLite read-only)
- `webapp/` — React + Vite + Tailwind v4 + Redux (classic)
- pnpm workspace monorepo
- Docker Compose + devcontainer (Dokploy/Traefik-ready)

## Quickstart

```bash
cp .env.example .env        # adjust OPENCODE_DB_PATH, DATABASE_URL, ports
docker compose up           # Postgres + API + webapp (dev override auto-merged)
```

Then open http://localhost:5173 (webapp) — the API is on http://localhost:3001.

> **Ports on this machine:** host port `5433` maps to Postgres, `3001` to the API,
> because `5432` and `3000` are already taken by a native Postgres and Langfuse.

### Local dev (no Docker)

```bash
pnpm install
# terminal 1 — Postgres (or `docker compose up -d db`)
# terminal 2 — API
PORT=3001 DATABASE_URL=postgres://ia:ia@localhost:5433/ia_dashboard \
OPENCODE_DB_PATH=${HOME}/.local/share/opencode/opencode.db \
pnpm --filter @ia-dashboard/api start:dev
# terminal 3 — webapp
pnpm --filter @ia-dashboard/webapp dev
```

### Database migrations

```bash
pnpm --filter @ia-dashboard/api db:generate   # after schema changes
pnpm --filter @ia-dashboard/api db:migrate    # apply to Postgres (needs DATABASE_URL)
```

### Development container

Open the repo in VS Code and "Reopen in Container" — the devcontainer uses the
same compose files as `docker compose up`.

## How it works

- The API opens `opencode.db` **read-only** (`file:...?mode=ro`). If a read-only
  connection fails (locked/WAL), it copies the db + `-wal`/`-shm` to a temp dir and
  reads the copy. It **never writes** to the OpenCode database.
- Postgres holds only what you annotate: `features` and `feature_sessions`
  (a snapshot of each linked session's cost/tokens/model/title at link time).
- The session list always comes live from SQLite; a session shows the
  **annotated badge** when its id exists in Postgres.
- `project.name` is NULL in the OpenCode DB, so the project display name is derived
  from the `worktree` basename (e.g. `/home/user/gateway` → `gateway`).

## Test

```bash
pnpm test
```

## Deploy (Dokploy)

Dokploy deploys `docker-compose.yml` as-is. Services use `expose` (no host `ports`)
and Traefik handles TLS — do not add `ports:` or Caddy to the base compose file.