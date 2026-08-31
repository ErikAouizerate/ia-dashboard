# Design — Regroupement des projets versionnés (`_v<chiffres>`)

Date : 2026-08-31

## Objectif

Dans l'application ia-dashboard, les projets dont le nom de répertoire porte un
suffixe de version (`infrastructure`, `infrastructure_v2`, `gateway_v3`, …)
doivent être **considérés comme un seul projet** sous leur **nom nominal** (sans
la version). Règle générale : tout suffixe `_v` suivi d'un nombre en fin de
basename est retiré.

## Contexte

- L'app dérive un projet par répertoire OpenCode : `ProjectsService.syncProjects()`
  crée une ligne `projects` par `directory` (unique), `name = basename(directory)`.
  Les agrégats (`aggregateByDirectory`, `aggregateByDirectoryAndModel`,
  `timeByDirectory`) sont calculés par répertoire.
- L'utilisateur travaille avec des répertoires versionnés (ex. `infrastructure`
  et `infrastructure_v2` comme clones de versions successives). Ils apparaissent
  aujourd'hui comme deux projets distincts dans la liste, le détail et le dashboard.
- Décision utilisateur : **regroupement à la lecture** uniquement — aucun
  changement de schéma, aucune migration, features/sessions/analyses restent
  liées à leur répertoire d'origine. Réversible à tout moment.
- Décision utilisateur : un répertoire versionné **isolé** (ex. seulement
  `infrastructure_v2`, sans `infrastructure`) est quand même regroupé sous son
  nom nominal `infrastructure`.

## Approche retenue

Couche de normalisation dans l'API : un helper `nominalName()` + un service de
regroupement utilisé par **tous** les endpoints (liste, détail, dashboard,
sessions, meta). Le webapp reste data-driven et quasi inchangé.

### Règle de nom nominal

- Sur le **basename** uniquement (pas le chemin complet).
- Retire **itérativement** tout suffixe `_v<1+ chiffres>` en fin de chaîne :
  `infrastructure_v2` → `infrastructure`, `gateway_v3` → `gateway`,
  `infrastructure_v2_v3` → `infrastructure`.
- Non affectés : `vue3` (pas de `_v`), `mon_projet`, `sans_suffixe`.
- Id synthétique stable : `nominal:<nom nominal>` (ex. `nominal:infrastructure`),
  indépendant de l'existence d'une ligne `projects` de base.

### API

1. **`api/src/projects/nominal-name.ts`** (nouveau)
   - `nominalName(basename: string): string` — strip itératif du suffixe.
   - `nominalId(name: string): string` — renvoie `nominal:<name>`.
   - `isNominalId(id: string): boolean` — détecte `nominal:<...>`.
2. **`api/src/projects/projects.service.ts`**
   - `list()` : groupe les lignes par nom nominal.
     - Agrégats sommés sur les répertoires membres : sessions, coût, tokens
       in/out, durée.
     - `firstSeen` = min des membres, `lastSeen` = max des membres.
     - `stale` = vrai **seulement si tous** les membres sont stale.
     - `id` = id synthétique du groupe ; champ additionnel `directories: string[]`
       (répertoires membres). Nombre de projets renvoyé = nombre de groupes.
     - `directory` (champ existant) : répertoire membre dont le basename == nom
       nominal si existant, sinon premier membre ; `directories` liste tous les
       membres.
     - Tri : `lastSeen` (groupe) décroissant.
   - `findOne(id)` : accepte un id réel (comportement actuel) **ou** un id
     synthétique.
     - Pour un groupe : `directory` = répertoire membre dont le basename == nom
       nominal si existant, sinon premier membre ; `directories` liste tous les
       membres.
     - features et propositions fusionnées depuis **tous** les
       répertoires membres (dédupliquées par id), `byModel` sommé par modèle sur
       les membres, `ungroupedSessions` recalculé sur le groupe.
     - Id inconnu → `NotFoundException` (inchangé).
3. **`api/src/opencode/opencode-reader.ts` + `opencode.types.ts`**
   - `listSessions(filters)` : le filtre `project`/`directory` accepte une **liste**
     de répertoires (`IN`) au lieu d'un seul — rétrocompatible avec la forme actuelle
     (chaîne unique / correspondance suffixe `%/<project>`).
4. **`api/src/sessions/sessions.service.ts`**
   - `list({ projectId })` : si `projectId` est un id synthétique, résolution vers
     **tous les répertoires membres** → filtre multi-répertoires. Sinon
     comportement actuel (répertoire unique).
   - `meta()` : renvoie les projets **groupés** (id synthétique + nom nominal),
     pour les filtres de la vue sessions.
5. **`api/src/dashboard/dashboard.service.ts`**
   - `summary()` : `byProject` et `timeByProject` groupés par nom nominal —
     même règle de fusion, `models` sommés par modèle avec `share` recalculé,
     `id` = id synthétique du groupe.

### Webapp

1. **`webapp/src/views/ProjectsView.tsx`** (+ spec)
   - Sous-titre des cartes : répertoire nominal + répertoires membres si
     différents (ex. `infrastructure` + `infrastructure_v2`).
   - Compteur de projets = nombre de groupes.
2. Aucun changement de routage ni de store (le détail continue de consommer
   `GET /api/projects/:id` avec l'id synthétique).

## Cas limites

- `infrastructure_v2` isolé → groupe `nominal:infrastructure` quand même.
- `global` : inchangé (sessions sans répertoire, déjà traitées à part).
- Collision basename réel / id synthétique : impossible en pratique (un basename
  ne contient pas `:`), non géré.
- `syncProjects()` : **inchangé** — les lignes DB restent par répertoire ; le
  regroupement n'est qu'une vue de lecture.

## Erreurs

- `GET /projects/nominal:inconnu` → `NotFoundException`.
- Contrat API : les champs existants d'un projet restent identiques ; un groupe
  ajoute `directories: string[]`.

## Tests

- `api/src/projects/nominal-name.spec.ts` : table de cas (`_v2`, `_v10`,
  `_v2_v3`, `vue3`, `mon_projet`, `sans_suffixe`, `nominalId`, `isNominalId`).
- `api/src/projects/projects.service.spec.ts` : regroupement de `list()`,
  fusion des agrégats, stale, id synthétique ; `findOne()` sur id synthétique
  (features/propositions fusionnées, déduplication, `byModel` sommé).
- `api/src/sessions/sessions.service.spec.ts` : filtre multi-répertoires avec
  id synthétique ; `meta()` groupée.
- `api/src/dashboard/dashboard.service.spec.ts` : `byProject`/`timeByProject`
  groupés, `share` recalculé.
- `webapp/src/views/ProjectsView.spec.tsx` : compteur groupé et sous-titres
  avec répertoires membres.

## Fichiers touchés

- API : `src/projects/nominal-name.ts` (nouveau) + spec,
  `src/projects/projects.service.ts`, `src/dashboard/dashboard.service.ts`,
  `src/sessions/sessions.service.ts`, `src/opencode/opencode-reader.ts`,
  `src/opencode/opencode.types.ts`.
- Webapp : `src/views/ProjectsView.tsx` + spec.

## Hors périmètre

- Aucune migration de schéma, aucune fusion physique en base.
- Aucun changement de `syncProjects()`.
- Pas de normalisation côté stockage OpenCode (l'app reste une vue de lecture).