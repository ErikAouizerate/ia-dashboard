# ia-dashboard — Design

App locale qui lit la base SQLite d'OpenCode, permet d'annoter qualitativement les
features construites (projet, but, note, temps, modèle), et stocke ces annotations
dans Postgres. Objectif : du qualitatif, pas du quantitatif — relier chaque session
OpenCode (plan → build) à une évaluation personnelle.

Date : 2026-08-27. Décisions validées avec l'utilisateur par dialogue.

## Contexte & motivation

- La base SQLite OpenCode (`~/.local/share/opencode/opencode.db`, ~834 Mo, mode WAL,
  ~317 sessions, 8 356 messages, 39 057 parts) contient déjà : coûts, tokens,
  modèle, projet, timestamps, diffs, todos.
- Le besoin (blueprint `devops-ia/open-code-session-cost-feedback-mcp-blueprint`) :
  mesurer le ROI de l'usage IA, mais de façon **qualitative** — relier chaque session
  à « qu'est-ce que cette session m'a apporté ? », note de satisfaction, phase,
  temps passé. Ces champs qualitatifs **ne sont pas** dans la DB (sauf modèle/tokens/coût).
- Décision : cette fois on fait une **webapp** (front + API NestJS) avec **Postgres**,
  en déviant du blueprint qui prévoyait des annotations dans Basic Memory.

## Décisions clés (validées)

| Sujet | Choix |
|---|---|
| Stockage des annotations | **Postgres uniquement** |
| Granularité | **Feature = groupe de 1..N sessions** |
| Sync SQLite → PG | SQLite lu **en local** (source de vérité liste sessions) ; PG stocke features + **snapshots** des sessions annotées ; badge UI « annotée » = `session_id` présent dans PG |
| Infra | **Full docker-compose + devcontainer**, prêt Dokploy/Traefik |
| Accès Postgres | **Drizzle ORM** |
| Accès SQLite | **better-sqlite3** (lecture seule) |
| Frontend | React + Vite + Tailwind v4 + Redux classic |
| Package manager | pnpm (policy) |

## Architecture

```
ia-dashboard/
├── AGENTS.md                    (policies global + infra + deploy, refs memory://)
├── docker-compose.yml           (base : services db/api/webapp, expose: pas de ports)
├── docker-compose.override.yml  (dev : ports localhost, bind mounts, hot reload)
├── .devcontainer/devcontainer.json
├── pnpm-workspace.yaml          (durci : minimumReleaseAge, strictDepBuilds...)
├── .env.example
├── api/                         (renommé de backend/)
│   └── src/                     (NestJS : modules sessions, features, projects)
└── webapp/                      (React + Vite + Redux)
    └── src/
```

### Flux de données

1. Le backend lit `opencode.db` en **lecture seule** (mode `ro`, gestion WAL : fallback
   copie vers temp dir si fichiers verrouillés). Jamais d'écriture sur le SQLite.
2. La liste des sessions vient du **SQLite**. PG ne contient que les **features** et
   les **snapshots** des sessions annotées.
3. À l'annotation : écriture dans PG d'une feature + d'un snapshot de la session.
4. Badge visuel « annotée » = `session_id` présent dans PG.

## Modèle de données (Postgres, Drizzle)

### Table `features` (annotation qualitative)

| champ | type | source |
|---|---|---|
| `id` | uuid pk | auto |
| `name` | text | manuel — nom de la feature |
| `project` | text | pré-rempli depuis SQLite (éditable) |
| `purpose` | text | **manuel** — le « but » (pas dispo en DB) |
| `status` | enum planned/in_progress/done/abandoned | manuel |
| `satisfaction` | smallint 1–5 | manuel |
| `comment` | text | manuel |
| `tags` | text[] | manuel |
| `time_spent_min` | int | **manuel** — temps réel passé (la DB donne durée murale, pas le temps humain) |
| `created_at` / `updated_at` | timestamptz | auto |

### Table `feature_sessions` (liaison 1..N + snapshot)

- `id` uuid pk, `feature_id` FK → features, `session_id` text (id opencode), `unique(session_id)`
- **Snapshot** figé à l'annotation : `title`, `model`, `agent`, `cost`,
  `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`,
  `tokens_cache_write`, `time_created`, `time_updated`,
  `summary_additions`, `summary_deletions`, `summary_files`
- `created_at`

> Pas d'import complet des 834 Mo. PG ne reçoit que les sessions annotées (snapshot) + features.

## API (NestJS, module par domaine)

- `GET /api/sessions` — liste depuis SQLite (pagination, filtre projet/modèle/période,
  `annotated: bool` + `feature_id` si liée)
- `GET /api/sessions/:id` — détail session (tokens, cost, messages/todos)
- `GET /api/sessions/meta` — distinct values projets/modèles (autocomplete)
- `GET/POST/PATCH/DELETE /api/features` — CRUD features
- `GET /api/features/:id` — détail + sessions liées + agrégats (coût total, tokens, nb sessions, durée)
- `POST /api/features/:id/sessions` / `DELETE /api/features/:id/sessions/:sessionId` —
  lier/délier une session (écrit le snapshot)
- `POST /api/sync/session/:id` — resync manuel d'un snapshot

## UI (webapp)

- **Liste des sessions** (`/sessions`) : tableau paginé depuis SQLite (titre, projet,
  modèle, coût, tokens I/O, date) ; filtres projet/modèle/période/état d'annotation ;
  **badge** `● annotée` (vert, nom feature) vs `○ non annotée` (gris) ; clic → panneau
  « Annoter / créer une feature » ou « Lier à une feature existante ».
- **Liste des features** (`/features`) : nom, projet, statut, satisfaction, coût total,
  tokens totaux, nb sessions ; détail : purpose, temps passé, commentaire, tags,
  sessions liées (snapshots), agrégats.
- **Formulaire d'annotation** : project (autocomplete SQLite), name (suggéré du titre,
  éditable), purpose (texte libre), status, satisfaction 1–5, comment, tags,
  `time_spent_min` (input + hint durée murale), modèle/tokens/coût en lecture seule.
- **Redux (policy)** : stores `sessions`/`features`, actions
  `*_REQUESTED → *_START/_SUCCESS/_ERROR` via `apiMiddleware`. Routing : React Router,
  routes `/sessions`, `/features`.

## Infra

- `docker-compose.yml` : `db` (postgres:16), `api` (build, `expose:` 3000),
  `webapp` (build, `expose:` 5173) — pas de `ports:` dans le fichier de base.
- `docker-compose.override.yml` : `ports:` vers localhost, bind mounts source, hot reload,
  `OPENCODE_DB_PATH` pointant vers le SQLite hôte (monté en lecture seule dans le conteneur).
- `.devcontainer/devcontainer.json` : référence les 2 compose files, service api.
- Healthchecks + `depends_on` pour l'ordre db → api → webapp.

## Erreurs / robustesse

- Ouverture SQLite read-only (`file:...?mode=ro`) ; si verrouillé/WAL indisponible →
  fallback copie `opencode.db` + `-wal`/`-shm` vers temp dir. Jamais d'écriture sur le SQLite.
- DB absente → `503` côté API + bandeau UI « DB opencode introuvable — vérifie OPENCODE_DB_PATH ».
- PG down → erreurs JSON uniformes, retry limité, toasts UI.
- Snapshot figé à l'annotation ; `POST /api/sync/session/:id` pour rafraîchir volontairement.

## Tests

- `api/` : Jest — unit (services Drizzle + module sqlite avec fixture opencode.db),
  intégration (testcontainers Postgres : CRUD features + lien session + agrégats).
- `webapp/` : Vitest — reducers, apiMiddleware (pattern REQUESTED→START/SUCCESS/ERROR),
  composants clés.
- Script `pnpm test` à la racine.

## Scaffolding (blueprint Basic Memory)

- `AGENTS.md` racine : refs `memory://` global + infra + deploy (communication FR,
  docs, code research, infra, devcontainer, gitlab-ci).
- `api/AGENTS.md` : refs backend (pnpm, TypeScript).
- `webapp/AGENTS.md` : refs frontend (pnpm, Tailwind v4, Redux classic).
- `.env.example` : `OPENCODE_DB_PATH`, `DATABASE_URL`.
