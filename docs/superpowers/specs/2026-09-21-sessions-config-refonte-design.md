# Refonte sessions & config — Design (implémenté)

Date : 2026-09-21. Statut : **implémenté**, tests et typecheck verts.
Trace des chantiers A–F menés à partir de `INSTRUCTIONS.md`.

## Contexte

Le dashboard partait d'un modèle « feature » : les sessions étaient annotées
manuellement et regroupées en features analysées par LLM, avec statuts, liens et
propositions. L'usage réel est de **travailler sur les sessions** et de comparer
les **configs**. Le projet a donc été recentré : suppression du modèle feature,
et introduction de la config comme dimension de première classe.

## Décisions validées

| Réf | Décision |
|---|---|
| A1 | Suppression **complète** du modèle feature (tables, modules, worker LLM). |
| A2 | Retrait explicite du statut d'analyse **et** du statut de proposition. |
| A3 | La vue **Comparer** est conservée (basée sessions). |
| A4 | Perte des snapshots `feature_sessions` acceptée, sans archivage. |
| A5 | Menu final : Dashboard / Sessions / Projets / Config / Comparer. |
| B1 | Une config s'affiche par son **profil** (lisible), configId en secondaire. |
| B2 | Les sessions sans config forment un bucket explicite **« sans config »** (`configId = null`, clé `"none"`). |
| B3 | Menu Config : **liste + page détail**. |
| B4 | Fusion par **configId**, toutes sources confondues. |
| B5 | Dérivation **à la volée** depuis les sidecars, aucune table en base. |
| C1 | Dashboard : période par défaut **« Tout »**, non mémorisée. |
| C2 | **Légende globale unique** des modèles. |
| C3 | « Coût moyen des tokens » = **coût / 1M tokens, in+out combinés**. |
| C4 | Deux graphes : par config (segments = modèles) + par modèle. |
| C5 | KPI « Analysées / Features » retiré. |
| D1 | Source affichée en clair : `host` / `vm:<gen>`. |
| D2 | Colonne config : profil cliquable → détail config. |
| D3 | Pagination Précédent/Suivant, taille 50, en mémoire. |
| D4 | Filtres : Cacher subagents + source + config ; filtre analyse retiré. |
| E1 | Page projet **dédiée** : KPIs, sessions, découpage config. |
| E2 | Découpage config : **table + barres empilées**. |
| E3 | KPIs projet : Coût, Sessions, Tokens, Durée, Configs. |
| F1 | Nouvel endpoint `GET /api/sessions/:id/profile`. |
| F2 | Sections détail : totaux, par modèle, outils, config, subagents, appels LLM. |
| F3 | Accès au détail par **titre cliquable**. |
| F4 | Config : **vue résumée + JSON repliable**. |

## A. Suppression du modèle feature

**Migration** `api/drizzle/0002_familiar_malcolm_colcord.sql` :
`DROP TABLE feature_proposals, feature_sessions, features, session_analyses CASCADE`
puis `DROP TYPE analysis_status, proposal_status`.

`api/src/db/schema.ts` ne contient plus que la table `projects`.

**Modules supprimés** : `api/src/features/*`, `api/src/analysis/*`,
`api/src/llm/*` (client + module + specs). `app.module.ts` ne les importe plus.

**API allégée** :
- `SessionsService` : plus de `annotatedMap`, `analysisMap`, `analysisFor`, ni
  de filtres `annotated`/`analysed`. `list()` renvoie `config` (profil + configId)
  au lieu de `annotated`/`featureId`/`analysedStatus`.
- `ProjectsService.findOne` : plus de `features`/`proposals`/`ungroupedSessions`,
  renvoie `configs` et `durationMs`.
- `DashboardService` : plus d'`analysedCount`/`featureCount` ; renvoie `byConfig`.

**Webapp supprimée** : `FeaturesView`, `FeatureDetail`, `FeatureForm`,
`SessionActions`, `BulkLinkModal`, `AnalysisBadge`, stores `features`/`proposals`,
lib `selection`, routes et entrées de menu associées.
`store/store.ts` n'enregistre plus que : `sessions`, `dashboard`, `projects`,
`configs`, `sessionDetail`, `compare`.

## B. Entité « config » (socle)

Tout est dérivé à la volée dans `MultiSourceReader` (pas de table) :

- `listSources(): string[]` — sources disponibles (`host`, `vm:<gen>`).
- `listConfigs({from?, directories?}): ConfigSummary[]` — agrégat par clé
  `configId ?? "none"` (`NO_CONFIG_ID = "none"`).
- `getConfig(configId): ConfigDetail | null` — détail (la clé `"none"` cible le
  bucket sans config).
- `buildConfigs()` privé : scanne toutes les captures + sessions et construit
  `ConfigDetail` = `ConfigSummary` + `sessionList`. Renseigne `bySource` et
  `models` (par modèle : sessions, coût, tokens).

`ConfigSummary` : `configId`, `profile`, `config`, `sessions`, `totalCost`,
`tokensInput`, `tokensOutput`, `bySource`, `models`.
`ConfigDetail` ajoute `sessionList` (id, titre, source, modèle, coût, tokens,
date, projet).

**API** `api/src/configs/` : `ConfigsController` (`GET /api/configs`,
`GET /api/configs/:configId`) + `ConfigsModule`.

**Webapp** : store `configs` (`configLabel`, `configKey`, `NO_CONFIG_ID`),
routes `/configs` et `/configs/:id`, `ConfigView` (table) et `ConfigDetail`
(KPIs, modèles, JSON repliable, sessions). `lib/configSummary.ts` produit le
résumé lisible (modèle, petit modèle, nb agents/MCP/plugins/skills).

## C. Dashboard

`webapp/src/store/dashboard.ts` : `periodDays` initial = **0** (Tout).
`DashboardView` :
- légende globale unique modèle → couleur (via `buildModelColorMap`) ;
- KPI grid passé de 5 à 4 ;
- deux graphes « Coût moyen / 1M tokens » : **par config** (segments par modèle,
  lien vers `/configs/:id`) et **par modèle** ;
- helper `avgCostPerMillion(cost, tokens)` dans `lib/format.ts`.

`DashboardService.summary` renvoie `byConfig` (liste `ConfigSummary`).

## D. Liste des sessions

- `OpenCodeSession.source` exposé dans `SessionRow.source` ; colonne **Source**.
- Colonne **Config** (profil cliquable → `/configs/:id`) ; `SessionsService.list`
  joint `config: { profile, configId }` via `reader.capture(id)`.
- Filtres ajoutés : `source`, `configId` ; `parentOnly` conservé ; filtre analyse
  retiré. `meta()` renvoie `sources` et `configs` en plus de `projects`/`models`.
- **Pagination réparée** : action `SESSIONS_PAGE_SET`, `SESSIONS_LOAD_SUCCESS`
  met à jour `page`/`pageSize`, contrôles Précédent/Suivant et compteur
  `Page x / y` dans `SessionsView`.

## E. Page projet

`ProjectDetail` réécrit : KPIs (Coût, Sessions, Tokens, Durée, Configs), graphe
« Répartition des coûts par config » (barres empilées par modèle), table
« Découpage par config », table des sessions paginée (fetch direct via
`api.sessions`), accès au détail par titre. Plus aucune référence aux features.

## F. Page détail session

- Backend : `SessionsService.profile(id)` expose en plus `calls` (liste des appels
  LLM). Route `GET /api/sessions/:id/profile` (404 si inconnue).
- Frontend : route `/sessions/:id`, store `sessionDetail`, vue `SessionDetail` :
  KPIs (coût, tokens in/out/reasoning, cache read/write, appels LLM/outils),
  table par modèle, table outils + fréquence, arbre subagents, liste des appels
  LLM, lien config, résumé + JSON repliable.

## Vérification

- `api` : `jest` → **11 suites, 73 tests** verts.
- `webapp` : `vitest run` → **13 fichiers, 39 tests** verts.
- `tsc --noEmit` : **0 erreur** côté api et webapp.

## Limites assumées (`ponytail:`)

- `SessionsService.list` fait un `capture()` par ligne (marqué dans le code) ;
  batcher si une page devient lente.
- `buildConfigs` scanne toutes les sessions à chaque requête (marqué dans le
  code) ; indexer si l'historique grossit.
- Les configs ne proviennent que des snapshots VM (le mode host n'a pas de
  captures) : d'où le bucket « sans config ».
