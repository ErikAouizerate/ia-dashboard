# ia-dashboard

Local dashboard that reads the OpenCode SQLite database (read-only) and lets the user
annotate built features qualitatively. Annotations are stored in Postgres.

## Sub-projects
- `api/` — NestJS (TypeScript) API: reads `opencode.db` via better-sqlite3 (read-only),
  stores features + session snapshots in Postgres via Drizzle ORM.
- `webapp/` — React + Vite + Tailwind v4 + Redux (classic) single-page app that consumes
  the API and shows an "annotated" badge per session.

## Tooling
- pnpm workspace monorepo (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`).
- Docker Compose + devcontainer for local dev and Dokploy/Traefik deployments.