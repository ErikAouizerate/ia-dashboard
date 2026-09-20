# Reader multi-source & dimension source — Design

Objectif : faire en sorte que **tous** les services de `ia-dashboard` lisent les
sessions des **deux sources** (host + snapshots VM), pas seulement la liste des
sessions. Le dashboard, les projets, les features et l'analyse doivent compter
les sessions VM comme les sessions host. En plus, la donnée doit porter une
**dimension `source`** pour permettre, plus tard, de distinguer host vs VM dans
l'UI — sans construire cette UI maintenant.

Date : 2026-09-20. Décisions validées avec l'utilisateur par dialogue.

## Contexte

- Le reader host-only (`OpenCodeReader`, api/src/opencode/opencode-reader.ts)
  lit `~/.local/share/opencode/opencode.db`. Les snapshots des vies de VM vivent
  dans `~/.local/share/opencode-vm/<gen>/opencode.db` (voir le spec
  `2026-09-20-comparaison-sessions-design.md`).
- `SessionSources` (api/src/opencode/session-sources.ts) sait déjà scanner le
  store VM, exposer des readers par source (`host`, `vm:<gen>`), fusionner la
  liste des sessions et joindre les captures de config. **Mais seuls
  `SessionsService` l'utilise.**
- `DashboardService` (api/src/dashboard/dashboard.service.ts:14), `ProjectsService`
  (api/src/projects/projects.service.ts:14), `FeaturesService`
  (api/src/features/features.service.ts:16) et `AnalysisService`
  (api/src/analysis/analysis.service.ts:30) injectent encore `OPENCODE_READER`
  (host seul). Constat mesuré : 53 sessions VM visibles dans `/api/sessions`
  mais absentes des agrégats du dashboard.

## Décisions validées

| Sujet | Choix |
|---|---|
| Approche | **B — composite reader** : une classe unique implémente l'interface du reader et fan-out vers les sources |
| Consommateurs | Dashboard, Projects, Features, Analysis, Health deviennent multi-source **sans changement de logique** |
| Granularité source | Fusion conservée + champ `bySource` sur les agrégats |
| UI | **Aucune** modification d'UI dans ce chantier ; la donnée/API est préparée |
| Dédup | `listSessions` dédup par `session.id` (déjà) ; les agrégats somment par source (générations disjointes) |

## Vue d'ensemble

```
OPENCODE_READER (token NestJS)
        |
        v
MultiSourceReader implements SessionReader   (ex-SessionSources)
   |-- host  -> OpenCodeReader (dbPath, "host")
   `-- vm:<gen> -> OpenCodeReader (gen/opencode.db, "vm:<gen>", watchChanges)
        |
        +-- captures config (configs.json / captures.jsonl)
        |
  Dashboard, Projects, Features, Analysis, Health  -> inchangés
  SessionsService                                  -> simplifié
```

Le provider `OPENCODE_READER` fournit désormais `MultiSourceReader`. Le token
`SESSION_SOURCES` est supprimé.

## Interface `SessionReader`

Nouvelle interface (dans api/src/opencode/opencode.types.ts) reprenant **toute
la surface publique** d'`OpenCodeReader` :

`source`, `open`, `close`, `listSessions`, `getSession`, `listProjects`,
`listModels`, `getSubagentIds`, `getSessionTree`, `getSessionCalls`,
`getSessionSteps`, `getSessionToolUsage`, `listDirectories`,
`getSessionAnalysisInput`, `listParentSessions`, `aggregateAll`,
`aggregateByDirectory`, `aggregateByDirectoryAndModel`, `aggregateByModel`,
`aggregateByDay`, `timeByDirectory`.

- `OpenCodeReader implements SessionReader` (aucun changement de logique).
- L'interface est **nécessaire** : `OpenCodeReader` a des membres privés, donc
  une autre classe n'y est pas structurellement assignable (typage nominal TS).
- Les services annotent leur dépendance `SessionReader` (changement de type
  seul, pas de logique).

## `MultiSourceReader`

`api/src/opencode/session-sources.ts` devient
`api/src/opencode/multi-source-reader.ts`, classe `MultiSourceReader implements
SessionReader`, absorbant l'actuel `SessionSources` : scan du store, `refresh()`,
readers `watchChanges`, captures (`configs.json`, `captures.jsonl`), `capture(id)`.

### Routage par id

- `getSession(id)`, `getSubagentIds(id)`, `getSessionTree(id)`,
  `getSessionAnalysisInput(id)` : la source propriétaire de l'id est résolue
  puis la méthode est déléguée. Id inconnu → `null` / `[]`.
- `getSessionCalls(ids)`, `getSessionSteps(ids)`, `getSessionToolUsage(ids)` :
  les ids sont **groupés par source propriétaire**, chaque reader est appelé
  avec son sous-ensemble, les résultats sont concaténés.

### Union / fusion

- `listSessions(filters)` : logique actuelle de `SessionSources.list` — union de
  toutes les sources, dédup par `session.id` en gardant le `timeUpdated` le plus
  récent, puis pagination.
- `listDirectories()` : union, `firstSeen` min, `lastSeen` max.
- `listProjects()` : union, dédup par `id`.
- `listParentSessions({from})` : union, dédup par `id` (le plus récent gagne).
- `listModels()` : union (déjà présent).
- Agrégats (`aggregateAll`, `aggregateByDirectory`,
  `aggregateByDirectoryAndModel`, `aggregateByModel`, `aggregateByDay`,
  `timeByDirectory`) : **fusion par clé** —
  - clés : `directory` / `directory`+`model` / `model` / `day` / `directory` ;
  - somme des scalaires (`totalCost`, `tokensInput`, `tokensOutput`, `sessions`,
    `durationMs`) ;
  - `firstSeen` min, `lastSeen` max ;
  - `bySource` concaténé (une entrée par source contributrice).

`aggregateAll` : somme des totaux de chaque source, `bySource` = une entrée par
source.

### Helpers privés

- `ownerOf(id)` : source propriétaire ou `null`.
- `forEachSource(fn)` : itère les sources en ignorant celles qui échouent
  (`try/catch`) — même robustesse que `SessionSources.list` aujourd'hui.
- `mergeRows(rows, keyOf, combine)` : fusion générique (scalaires + `bySource`).

## Dimension source dans les types

```ts
export interface SourceAggregate {
  source: string;          // "host" | "vm:<gen>"
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessions: number;
}
```

- `SessionAggregate` gagne `bySource: SourceAggregate[]`, hérité par
  `DirectoryAggregate`, `DirectoryModelAggregate`, `ModelAggregate`,
  `DayAggregate`.
- `DirectoryTimeAggregate` gagne
  `bySource: { source: string; durationMs: number }[]`.
- `OpenCodeReader` renseigne `bySource` avec une entrée unique (`this.source`)
  dans chaque méthode d'agrégat. Ajout mécanique, aucune logique nouvelle.

Conséquence : les totaux fusionnés restent identiques pour les consommateurs
actuels, et chaque ligne expose la répartition host/VM.

## Consommateurs

- **Features / Analysis / Health** : logique inchangée ; seule l'annotation de
  type passe de `OpenCodeReader` à `SessionReader`. `AnalysisService` met à jour
  `ReturnType<OpenCodeReader["getSessionAnalysisInput"]>` →
  `ReturnType<SessionReader["getSessionAnalysisInput"]>`.
- **Dashboard / Projects** : annotation `SessionReader` + **seule** évolution de
  logique : propager le `bySource` des lignes d'agrégat dans les objets
  reconstruits (`byProject` / `timeByProject` pour le dashboard, projets pour
  `ProjectsService`). Aucun autre comportement modifié.
- **SessionsService** (api/src/sessions/sessions.service.ts) : seul service à
  utiliser des méthodes hors interface. Simplifié :
  - `this.sources.list(f)` → `this.reader.listSessions(f)` ;
  - `readerFor(id)` + `reader.getSessionTree(id)` → `this.reader.getSessionTree(id)` ;
  - `source: reader.source` → `source: session.source` ;
  - `capture(id)` inchangé.
- **Frontend** : aucun composant modifié. `byModel` et `byDay` sont rendus tels
  quels (DashboardView.tsx:125,156) et restent fusionnés.

## API préparée pour l'UI

- `GET /api/dashboard/summary` : `aggregateAll` est spreadé (`...all`) → le
  `bySource` global apparaît au top-level. `byProject` et `timeByProject` sont
  reconstruits dans `DashboardService` → y propager `bySource` ; `byModel` et
  `byDay` le portent déjà via les lignes d'agrégat.
- `GET /api/projects` : `bySource` par groupe de projet (groupé par nom nominal),
  donc `curriculum` host et `/workspace/curriculum` VM restent fusionnés dans
  les totaux mais distinguables.

## Cycle de vie & erreurs

- `open()` : ouvre le host (`OpendbNotFoundError` si absent → `/api/health`
  renvoie `missing` comme avant), puis tente chaque source VM en tolérant
  l'échec.
- `close()` : ferme toutes les sources.
- `refresh()` : conserve le comportement actuel — génération illisible ou
  snapshot `.tmp` ignoré, store absent → aucune source VM, jamais bloquant.
- `source` du composite = `"multi"` ; chaque session porte sa vraie `source`
  (déjà posée par `OpenCodeReader.toSession`).
- `ponytail: pas de dédup inter-sources des agrégats — les générations sont
  disjointes par construction (une vie de VM = un dossier de génération, le
  snapshot remplace atomiquement le même dossier). Ajouter la dédup par
  session.id si deux générations se recouvrent un jour.`

## Tests

- **Cœur** : deux fixtures host + VM partageant la même `directory` →
  `aggregateByDirectory` renvoie **une** ligne aux totaux additionnés, avec
  `bySource` = `[{host…}, {vm…}]` ; idem `aggregateAll`. Le test casse si la
  fusion multi-source régresse.
- `OpenCodeReader` : `bySource` = une entrée `host` sur chaque agrégat.
- `MultiSourceReader` : union/dédup `listSessions` (existant), routage
  `getSessionTree` vers la bonne source, source illisible ignorée, relève d'une
  nouvelle génération / snapshot remplacé (existant).
- Mocks des services : `DashboardService` reçoit un objet duck-typé ; les
  assertions existantes restent valides (accès `bySource` null-safe).

## Fichiers touchés

- `api/src/opencode/opencode.types.ts` — `SessionReader`, `SourceAggregate`,
  `bySource` sur les agrégats.
- `api/src/opencode/opencode-reader.ts` — `implements SessionReader`, remplir
  `bySource`.
- `api/src/opencode/session-sources.ts` → `multi-source-reader.ts` —
  `MultiSourceReader`.
- `api/src/opencode/opencode.module.ts` — provider `OPENCODE_READER` =
  `MultiSourceReader` ; suppression `SESSION_SOURCES`.
- `api/src/opencode/session-sources.spec.ts` →
  `multi-source-reader.spec.ts`.
- `api/src/sessions/sessions.service.ts` — simplification.
- `api/src/dashboard/dashboard.service.ts`, `api/src/projects/projects.service.ts`,
  `api/src/features/features.service.ts`, `api/src/analysis/analysis.service.ts`,
  `api/src/health/health.controller.ts` — annotation de type `SessionReader`
  (+ `bySource` dans le dashboard).

## Hors périmètre (YAGNI)

- Pas de composant UI de répartition host/VM dans ce chantier.
- Pas de filtre par source dans les vues.
- Pas de dédup inter-sources des agrégats.
- Pas de refonte du modèle `feature` ni du schéma Postgres.
