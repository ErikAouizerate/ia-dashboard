# ia-dashboard — Rework : découpage des sessions par demande (features auto)

Rework majeur : on abandonne la ventilation manuelle des sessions dans des
projets/features pour un découpage **automatique de l'ensemble des sessions par
demande** ("feature"). Les projets sont dérivés du répertoire de travail, un outil
LLM extrait les **demandes** et **enjeux** de chaque session, et des **propositions
de features** sont générées automatiquement (validables par l'utilisateur).

Date : 2026-08-27. Décisions validées avec l'utilisateur par dialogue.

## Contexte & motivation

- Ancien modèle : `features` + `feature_sessions` en PG, annotation manuelle
  (créer une feature, lier des sessions une à une). Le dashboard n'avait de sens
  que pour les sessions annotées.
- L'utilisateur veut : dégager les **demandes** et **principaux enjeux** de chaque
  session, **relier automatiquement** les sessions d'un même projet (nom de
  projet = répertoire), avoir **par défaut** le coût et le nombre de tokens par
  projet, puis **découper par feature** dans chaque projet, avec des
  **propositions automatiques**.
- Bug OpenCode identifié : `project_id` est résolu par hash du remote git, sinon
  hash du premier commit racine, sinon `"global"` (pas de remote + session créée
  avant le premier commit). Les sessions ia-dashboard sont "global" à cause de ça.
  La colonne fiable est **`session.directory`** (répertoire absolu de travail) —
  on s'en sert pour dériver le projet (`basename(directory)`).
- L'utilisateur autorise la **destruction complète de la base PG** (pas de celle
  d'opencode).

## Décisions clés (validées)

| Sujet | Choix |
|---|---|
| Moteur LLM | **OpenCode Zen** — `https://opencode.ai/zen/v1/chat/completions`, modèle `deepseek-v4-flash` (env `LLM_MODEL`). Clé lue dans `~/.local/share/opencode/auth.json` (champ `opencode`/`opencode-go`) ou env `OPENCODE_API_KEY` en override |
| Déclenchement analyse | **Hybride** : batch au boot (sessions parent des **2 derniers jours**) + bouton manuel par session / par projet |
| Propositions | **Clustering LLM par ressemblance** + **proximité temporelle** (sessions proches = même feature), séparé par projet |
| Champs features | `name`, `purpose`, `satisfaction`, `comment`, `tags`, `time_spent_min`, `demandes`, `enjeux` (agrégés). **Pas de `status`** |
| Sessions subagent | **Non analysées** (parent_id ≠ null). Elles héritent de la feature de leur parent et agrègent leur coût/tokens dedans |
| Navigation | **Dashboard chiffré en accueil** (coût/tokens par projet/modèle/période) → drill-down projets → features → sessions |
| Flux de données | **Live depuis SQLite** pour les agrégats ; **analyses + propositions + features en PG** (cache, jamais refaites) |
| Pipeline | **Approche A — 2 passes** : (1) analyse par session, (2) clustering par projet. Worker intégré NestJS, 1 appel LLM à la fois (throttle) |
| PG | Reset complet : drop `features`/`feature_sessions` existants, nouveau schéma |

## Architecture

```
ia-dashboard/
└── api/src/
    ├── llm/            (client OpenAI-compatible → OpenCode Zen)
    ├── analysis/       (worker analyse par session + clustering par projet)
    ├── projects/       (projets auto-dérivés, agrégats live)
    ├── proposals/      (propositions de features)
    ├── features/       (réécrit : sans status, + demandes/enjeux, + re-synthèse)
    ├── sessions/       (étendu : directory, subagents, analysed)
    ├── dashboard/      (agrégats accueil)
    ├── opencode/       (lecteur SQLite étendu : directory, parent_id, messages)
    └── db/             (schéma Drizzle réécrit)
```

### Flux de données

1. Le backend lit `opencode.db` (lecture seule) ; chaque session a un `directory`.
2. `projects` sont dérivés/upsertés depuis les `directory` distincts (`basename`).
3. Le worker analyse les sessions parent non encore analysées (2 derniers jours
   au boot, sinon bouton manuel) → `session_analyses` en PG (cache, jamais refait).
4. Par projet, le clustering propose des features → `feature_proposals` (PG).
5. L'utilisateur valide (accept / dismiss / rename) → `features` + `feature_sessions`.
6. Les agrégats (dashboard, projets) sont calculés **live** depuis SQLite à la requête.

## Modèle de données (Postgres, Drizzle — reset complet)

### Table `projects` (auto-dérivée)

| champ | type | notes |
|---|---|---|
| `id` | uuid pk | auto |
| `name` | text unique | `basename(directory)` |
| `directory` | text unique | répertoire absolu |
| `first_seen` / `last_seen` | timestamptz | dérivés des sessions |
| `stale` | bool default false | directory disparu du disque |
| `created_at` / `updated_at` | timestamptz | auto |

> Synchro : à chaque boot + à chaque `GET /api/projects`, upsert depuis
> `SELECT DISTINCT directory FROM session`. Si directory manquant/inexistant sur
> disque → projet `(inconnu)` groupé par hash du path.

### Table `session_analyses` (cache LLM)

| champ | type | notes |
|---|---|---|
| `id` | uuid pk | auto |
| `session_id` | text unique | id opencode |
| `project_id` | uuid fk | → projects |
| `title` | text | titre opencode |
| `demandes` | jsonb | `[{label, description}]` |
| `enjeux` | jsonb | `[{label, description}]` |
| `summary` | text | résumé court |
| `model` | text | modèle LLM utilisé |
| `status` | enum `pending/analyzing/done/error` | |
| `error` | text | message d'erreur |
| `analyzed_at` | timestamptz | |

> Seules les sessions **parent** (parent_id null) ont une ligne. Une session
> `done` n'est jamais ré-analysée.

### Table `features`

| champ | type | notes |
|---|---|---|
| `id` | uuid pk | auto |
| `project_id` | uuid fk | → projects |
| `name` | text | éditable |
| `purpose` | text | généré LLM, éditable |
| `satisfaction` | smallint 1–5 | manuel |
| `comment` | text | manuel |
| `tags` | text[] | manuel |
| `time_spent_min` | int | manuel |
| `demandes` | jsonb | synthèse LLM agrégée |
| `enjeux` | jsonb | synthèse LLM agrégée |
| `proposal_id` | uuid fk nullable | → feature_proposals (traçabilité) |
| `created_at` / `updated_at` | timestamptz | auto |

> Pas de `status`. La synthèse demandes/enjeux est régénérée quand l'ensemble des
> sessions de la feature change (`POST /api/features/:id/reanalyze`).

### Table `feature_proposals`

| champ | type | notes |
|---|---|---|
| `id` | uuid pk | auto |
| `project_id` | uuid fk | → projects |
| `name` | text | |
| `purpose` | text | |
| `session_ids` | jsonb | `[session_id...]` |
| `demandes` | jsonb | |
| `enjeux` | jsonb | |
| `rationale` | text | justification du groupement |
| `status` | enum `pending/accepted/dismissed/stale` | |
| `created_at` | timestamptz | |

> Actions user : **accepter** (→ crée une feature + lie les sessions + marque
> accepted), **écarter** (→ sessions redevenables), **renommer avant d'accepter**.
> Une proposition dont le cluster change (nouvelle session analysée) passe en
> `stale` et est régénérée. Une session proposée (`pending`) n'est pas re-proposée.

### Table `feature_sessions`

| champ | type | notes |
|---|---|---|
| `id` | uuid pk | auto |
| `feature_id` | uuid fk | → features |
| `session_id` | text unique | id opencode (parent ET subagents) |
| snapshot | ... | title, model, agent, cost, tokens_* (I/O/reasoning/cache), time_created/updated, summary_additions/deletions/files |
| `created_at` | timestamptz | |

> Lier une session = lier aussi ses subagents (récursif par `parent_id`).

## Pipeline LLM

### Client (`api/src/llm/llm-client.ts`)

- OpenAI-compatible → `POST https://opencode.ai/zen/v1/chat/completions`
- Auth : `Authorization: Bearer <key>` ; clé lue depuis `auth.json`
  (`~/.local/share/opencode/auth.json`, champs `opencode`/`opencode-go`) avec
  override env `OPENCODE_API_KEY`
- Modèle : env `LLM_MODEL` (défaut `deepseek-v4-flash`)
- Timeout 60s, retry ×2 avec backoff, `response_format: json_object`
- Retour typé `{ summary, demandes, enjeux }` ; réponse non-JSON → retry puis error

### Analyse par session (pass 1, `api/src/analysis/`)

- Worker dans le process NestJS : tick toutes les 30s, prend les sessions parent
  `pending`/`error` (< 3 échecs) dans l'ordre chronologique. 1 appel LLM à la fois.
- Backfill au boot : sessions parent des **2 derniers jours** uniquement (les plus
  anciennes au bouton manuel).
- Payload : titre, model/agent, date, messages utilisateur (tronqués), todos
  (content/status), résumé diffs (additions/deletions/files). Jamais les parts brutes.
- Prompt : « dégage les demandes (ce que l'utilisateur a demandé) et les enjeux
  (points techniques/décisionnels clés) ».
- Statuts : `pending → analyzing → done|error`.

### Clustering par projet (pass 2)

- Quand un projet a ≥ 2 sessions analysées non encore proposées → appel LLM par
  projet : reçoit `[{session_id, title, date, summary, demandes}]` trié par date →
  renvoie `[{name, purpose, session_ids[], rationale, demandes[], enjeux[]}]`.
- Le prompt intègre : ressemblance sémantique + proximité temporelle +
  séparation stricte par projet.
- Résultats → `feature_proposals` (status `pending`). Sessions isolées → proposition
  mono-session possible si pertinente. Sessions dont l'analyse a échoué → exclues + signalées.

### Boutons manuels

- `POST /api/analysis/run?sessionId=` — analyse immédiate (même file)
- `POST /api/analysis/run-project?projectId=` — recluster un projet

## API (NestJS)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects` | Liste projets (auto-dérivés) + agrégats live : nb sessions, coût, tokens, période |
| `GET` | `/api/projects/:id` | Détail : features (proposées + acceptées), sessions non groupées, agrégats par modèle |
| `GET` | `/api/dashboard/summary` | KPIs accueil : coût total, tokens, par projet/modèle/jour (7/30j), nb sessions analysées |
| `GET` | `/api/sessions` | Filtres `projectId`, `analysed`, période, modèle ; champs `directory`, `isSubagent`, `analysed` |
| `GET` | `/api/sessions/:id/analysis` | Analyse LLM de la session (si faite) |
| `POST` | `/api/analysis/run` | Analyse manuelle d'une session |
| `POST` | `/api/analysis/run-project` | Recluster un projet |
| `GET` | `/api/analysis/proposals?projectId=` | Propositions pending du projet |
| `POST` | `/api/proposals/:id/accept` | Valider → crée feature + lie sessions (body overrides `name`/`purpose`) |
| `POST` | `/api/proposals/:id/dismiss` | Écarter → sessions redevenables |
| `GET/POST/PATCH/DELETE` | `/api/features` | CRUD (sans status) |
| `GET` | `/api/features/:id` | Sessions liées (avec subagents), demandes/enjeux agrégés, coût/tokens totaux |
| `POST` | `/api/features/:id/sessions` | Lier session + subagents (snapshot) |
| `DELETE` | `/api/features/:id/sessions/:sessionId` | Délier |
| `POST` | `/api/features/:id/reanalyze` | Régénérer la synthèse agrégée |

### Lecteur SQLite étendu (`opencode-reader.ts`)

- SELECT sessions ajoute : `directory`, `path`, `parent_id`, `time_compacting`
- `listSessions` : filtre `directory` (pas `project_id`), expose
  `projectName = basename(directory)`, `isSubagent = parent_id != null`
- `getSessionMessages` (nouveau) : messages utilisateur + todos + résumé diffs
  (payload LLM)
- Filtres projet existants : sur basename du directory

## UI (webapp)

### Dashboard (accueil) — `DashboardView.tsx`

- KPI cards : coût total, tokens I/O, nb sessions, nb features, toggle 7/30j
- Coût par projet (barres) ; coût par modèle ; sessions/jour (mini bar-chart)
- Drill-down : clic projet → page projet ; clic modèle → sessions filtrées
- Données : `GET /api/dashboard/summary` (live SQLite)

### Projets — `ProjectsView.tsx` + `ProjectDetailView.tsx`

- Table projets : nom, directory, nb sessions, coût, tokens, dernière activité
- Détail : features acceptées + propositions pending (cartes Accepter / Écarter /
  Renommer), sessions non groupées, agrégats par modèle, bouton Reclustering

### Features — `FeaturesView.tsx` + `FeatureDetailView.tsx`

- Filtre projet ; liste avec satisfaction/tags, coût/tokens agrégés
- Détail : purpose éditable, satisfaction 1–5, comment, tags, temps, demandes/enjeux
  agrégés, sessions liées (subagents repliables), lier/délier, Re-synthétiser

### Sessions — `SessionsView.tsx` (adapté)

- Filtres : projet (basename directory), modèle, période, analysé/non analysé
- Colonnes : titre, projet, modèle, coût, tokens, date, badge analysée (✓/⏳/erreur),
  badge feature si liée
- Action « Analyser » par session (si non analysée) ; subagents cachés par défaut
- Demandes/enjeux au clic (drawer étendu)

### Redux

- Nouveaux slices : `dashboard`, `projects`, `proposals` ; `features`/`sessions`
  adaptés (champs projets/analyses)
- Thunks loading/error ; rafraîchissement périodique léger sur projets/features

### Composants

- Réutilise les primitives `components/ui/` ; ajouts : `KpiCard`, `BarList`,
  `ProposalCard`, `AnalysisBadge`

## Erreurs / robustesse

- LLM : timeout 60s, retry ×2, erreurs persistées (`session_analyses.error`),
  re-tenté au tick si < 3 échecs sinon bouton manuel
- Réponse non-JSON LLM : retry puis error avec texte brut stocké
- SQLite verrouillé (WAL) : retry sur `SQLITE_BUSY`, lecture jamais bloquante
- PG down : l'API démarre (dashboard live SQLite OK) ; writes analyses → 503
- Projets dérivés : directory supprimé du disque → projet marqué `stale`
- Clustering : pas de proposition si < 2 sessions analysées ; échecs d'analyse
  exclus + signalés

## Tests

- api (Jest + supertest) :
  - `llm` : mock client (nock) — parsing JSON, retries, timeout, erreurs
  - `analysis` : payload construit, statuts pending→done/error, reprise
    (jamais re-analysé une session done), backfill 2 jours
  - `clustering` : propositions, accept → feature + liens (avec subagents),
    dismiss → redéployable, stale
  - `sessions` : filtres directory/projet/analysé, subagents, fixture opencode.db
  - `projects` : dérivation/upsert depuis directories, agrégats live
  - `features` : CRUD sans status, liens + snapshots, synthèse agrégée
- webapp (Vitest + RTL) : rendu dashboard (KPIs), actions proposer/valider, filtres

## Déploiement

- Inchangé : Dokploy + docker-compose + devcontainer (policies Basic Memory)
- SQLite OpenCode + `auth.json` : montés en volume host read-only dans le container
- Migration Drizzle : reset (drop anciennes tables + nouveau schéma)

## Non-goals

- Pas de parallélisme LLM (1 appel à la fois)
- Pas d'import massif des sessions en PG (toujours live SQLite)
- Pas de `status` sur les features
- Pas d'analyse des sessions subagent
- Pas de BullMQ/Redis