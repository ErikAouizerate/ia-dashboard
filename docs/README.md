# ia-dashboard

Local dashboard that reads the OpenCode SQLite database (read-only) and reports
cost, tokens and activity per session, project and model.

See the root [README](../README.md) for setup and usage.

## Project artifacts
- [Design spec](superpowers/specs/2026-08-27-ia-dashboard-design.md)
- [Implementation plan](superpowers/plans/2026-08-27-ia-dashboard.md)

## Sub-projects
- `api/` — NestJS (TypeScript) API: reads `opencode.db` via better-sqlite3 (read-only),
  keeps project rows in Postgres via Drizzle ORM.
- `webapp/` — React + Vite + Tailwind v4 + Redux (classic) single-page app that consumes
  the API.

## Tooling
- pnpm workspace monorepo (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`).
- Docker Compose + devcontainer for local dev and Dokploy/Traefik deployments.