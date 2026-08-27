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