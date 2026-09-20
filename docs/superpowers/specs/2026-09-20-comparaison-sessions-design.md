# Comparaison de sessions & capture de config agentique — Design

Objectif : comparer deux sessions OpenCode (appels, coûts, outils) pour évaluer
des configurations agentiques, y compris les sessions qui tournent dans la VM
Incus `devbox` — sans perdre l'historique quand la VM est reconstruite.

Date : 2026-09-20. Décisions validées avec l'utilisateur par dialogue.

## Contexte & motivation

- `ia-dashboard` lit déjà `~/.local/share/opencode/opencode.db` (host, lecture
  seule) au niveau **session** : coût, tokens, modèle, agent, diffs.
- La SQLite contient aussi la granularité **message assistant** (`cost`,
  `tokens`, `modelID`, `providerID`, `agent`, `mode`), **step** (`step-finish` :
  `cost` + tokens) et **appel d'outil** (`part` type `tool` : nom, statut,
  inputs/outputs, timings). Rien de tout ça n'est exploité aujourd'hui.
- Besoin : une **vision synthétique de 2 sessions** — coût, tokens par catégorie,
  nombre d'appels LLM, nombre/profil d'appels d'outils, sous-agents — pour juger
  une config d'agent.
- Les expériences de config (profils `default` / `muse-spark`) tournent dans la
  **VM jetable** `devbox` (repo `~/workspace/sandbox-opencode`), pilotées par
  `sync-opencode.sh <profile>`. La SQLite de la VM vit dans la VM → invisible du
  host, et perdue à `incus delete`.
- `ia-dashboard` a déjà `feature = groupe de 1..N sessions`, annotée **à la
  main** — cœur qualitatif conservé. Dans la pratique de l'utilisateur c'est du
  1:1, mais le modèle n'est pas modifié.

## Constats techniques (mesurés)

- **SQLite WAL sur virtiofs échoue** : test dans la VM sur un device `disk`
  Incus (virtiofs) → `journal_mode=WAL` renvoie `disk I/O error` (`DELETE` et
  `TRUNCATE` passent). Cause : WAL exige un mmap partagé du `-shm`, non supporté
  par virtiofs. `WAL + locking_mode=EXCLUSIVE` passe mais interdit tout lecteur
  concurrent. Un volume bloc ne règle rien (host+VM ne le montent pas ensemble).
  ⇒ **on n'exécute jamais SQLite directement sur virtiofs** ; on ne copie que des
  fichiers.
- **Pull validé** : DB WAL sur disque local VM, `incus file pull` de
  `opencode.db{,-wal,-shm}` pendant que la connexion VM reste ouverte → lecture
  host `integrity_check ok`, données non checkpointées présentes.
- **Les subagents sont des sessions séparées** (`parent_id` non nul) et leur coût
  **n'est pas** inclus dans le parent : 78,42 $ parents vs 5,24 $ subagents sur
  la DB host, 322/623 sessions. Comparer « une session » sans son arbre tronque
  le coût et rate les outils des sous-agents.

## Sources de données

| Source | Contenu | Durabilité |
|---|---|---|
| SQLite host | sessions host | persistante |
| Store VM (`~/.local/share/opencode-vm/<gen>/`) | snapshots des DB des vies de la VM | persistante (hors VM) |
| Sidecar config (`captures.jsonl`, `configs.json`) | config offerte par session | avec le store |

Phoenix reste le lien profond pour le **contenu brut** (spans `Turn → LLM →
TOOL → AGENT`), via l'attribut `session.id`.

## Décisions validées

| Sujet | Choix |
|---|---|
| Approche | Étendre `ia-dashboard` (SQLite exacte), pas requêter Phoenix |
| Transport VM → host | Device Incus `ia-store` (virtiofs), snapshots de **fichiers** |
| Store direct | La VM écrit les snapshots ; le store n'est jamais écrasé inter-générations |
| Unité de comparaison | **Session** = arbre parent + descendants `task` |
| Portée | Mixte host + VM, `source` affichée |
| Déclenchement snapshot | Hook `session.idle` (debounce) + script manuel host |
| Contenu config capturé | agents/`tools` offerts, MCP, plugins, **skills**, `OPENCODE_PROFILE` |
| Rétention | Tout conserver, prune manuel |
| Features | Modèle inchangé (annotation manuelle), `/compare` par sessions |

## Repos touchés & documentation

- **`ia-dashboard`** : ce spec + le plan d'implémentation ; reader multi-source,
  API `/compare`, UI `/compare`.
- **`sandbox-opencode`** : plugin `config-capture`, `snapshot.py`,
  `sync-vm-sessions.sh`, device `ia-store` (`incus-setup.sh`), injection
  `OPENCODE_PROFILE` (`sync-opencode.sh`), tests plugin.
- Un **plan unique** vit dans `ia-dashboard` avec une section « tâches
  sandbox-opencode ». En fin de chantier, ce spec est **recopié** dans
  `sandbox-opencode/docs/superpowers/specs/` pour tracer côté VM.

## Architecture

```
HOST                                          VM devbox (jetable)
~/.local/share/opencode-vm/   <-- device -->  /mnt/ia-store/
  <hostname>-<uuid4>/                            (plugin : snapshot + captures)
    opencode.db
    captures.jsonl
    configs.json
~/.local/share/opencode/opencode.db (host)
        |                                            |
   API NestJS  <----- GET /compare ---- webapp /compare
        |
   deep-link -> Phoenix (session.id)
```

- **Device Incus `ia-store`** : `incus config device add devbox ia-store disk
  source="$HOME/.local/share/opencode-vm" path=/mnt/ia-store` (dans
  `incus-setup.sh`). Le dossier source doit exister avant l'ajout.
- On n'écrit sur le store que via **copie de fichier** (jamais SQLite WAL
  directement sur virtiofs) : backup cohérent en temp **VM-local**, puis `cp`
  + `mv` (rename atomique) vers le store.

## Store VM & durabilité (générations)

- Une **génération** = une vie de VM, dossier `<hostname>-<uuid4>`. L'uuid est
  généré et persisté par le helper `snapshot.py` (`<data-dir>/ia-dashboard/gen-id`)
  au premier snapshot. VM reconstruite ⇒ data dir vide ⇒ **uuid neuf** ⇒ nouvelle
  génération ; les anciennes restent intactes.
- Le reader **unionne** toutes les générations et dédup par `session.id` : le
  snapshot au `time_updated` le plus récent gagne.
- Écriture atomique : snapshot écrit en `.tmp` dans la génération puis renommé.
  Un snapshot partiel (`.tmp`) est ignoré à la lecture.
- `ponytail: snapshot complet de la DB à chaque session.idle (debounce 15s) ;
  passe à un export incrémental par session si la DB VM grossit.`

## Plugin `config-capture.ts`

Emplacement : `sandbox-opencode/plugins/config-capture/`, poussé par
`sync-opencode.sh` dans `~/.config/opencode/plugin/` (auto-découvert, comme
`guardrails`). Aucune modification d'`opencode.json`.

`sync-opencode.sh` injecte aussi `OPENCODE_PROFILE=<profile>` dans l'env de
l'instance Incus (même mécanisme que les secrets).

Hooks utilisés :

| Hook | Payload | Rôle |
|---|---|---|
| `config(config)` | Config résolue | snapshot agents (`model`, `tools`, `permission`, `reasoningEffort`), `mcp`, `plugin`, `model`, `small_model` |
| `tool.definition(input)` | `toolID` (+ description/parameters) | **outils offerts** : accumulés par session (ensemble `offeredTools`) |
| `chat.message` / `chat.params` | `sessionID`, `agent`, `model` | lie session → agent/modèle ; calcule `configId` ; borne la session courante du catalogue |
| `event` (`session.idle`) | `sessionID` | écrit la capture (dont `offeredTools`) puis déclenche le snapshot (debounce 15 s) |

- `configId = sha1(canonicalJson({ model, smallModel, agents, mcp, plugins,
  skills }))` — **pas** de prompts. Deux sessions même `configId` = même config.
- Skills : liste des dossiers de `~/.config/opencode/skills/`.
- Écriture : `configs.json` (map `configId → config`, écrit uniquement si
  nouveau) ; `captures.jsonl` (une ligne par session, la dernière gagne :
  `sessionId`, `profile`, `agent`, `model`, `configId`, `offeredTools`, `at`).
  L'accumulation des outils se fait en mémoire (classe pure `OfferedTracker`,
  testable) et est vidée à chaque changement de session.
- `tool.definition` n'exposant pas `sessionID`, la session courante est celle du
  dernier `chat.message`/`chat.params` — heuristique à valider à l'implémentation
  (`ponytail: heuristique d'association du catalogue si le hook est global ;
  fallback vide, jamais de fausse donnée`).
- Snapshot DB : `python3` (backup API SQLite) vers temp VM-local, puis copie vers
  `/mnt/ia-store/<gen>/opencode.db`. `python3` est présent dans la VM ; `sqlite3`
  CLI ne l'est pas.

Le snapshot est un helper Python unique
(`plugins/config-capture/snapshot.py`, déployé en
`~/.config/opencode/ia-dashboard/snapshot.py`), appelé à la fois par le hook
(`child_process`/`$`) et par le script manuel (`incus exec python3 ...`). Une
seule source de vérité pour la copie cohérente.

## Script manuel `scripts/sync-vm-sessions.sh`

Host, calqué sur `sync-opencode.sh` : `incus exec` du helper de snapshot présent
dans la VM (même code que le hook), pour forcer un rafraîchissement (ex. juste
avant `incus delete`). Idempotent.

## Reader multi-source

- `OpenCodeReader` instancié par source (`host`, `vm:<gen>`), expose `source`
  sur chaque session.
- Nouvelles méthodes (par source, puis fusion) :
  - `getSessionTree(id)` → `session` + descendants `task` récursifs (ids).
  - `getSessionCalls(ids)` → messages assistant : `cost`, tokens, `model`,
    `agent`, `mode`, timestamp.
  - `getSessionSteps(ids)` → parts `step-finish` : `cost`, tokens.
  - `getSessionToolUsage(ids)` → parts `tool` : nom, statut, durée.
- Les captures config sont chargées par génération et jointes par `sessionId`.

## API

`GET /api/sessions/compare?a=<id>&b=<id>` — chaque id résolu sur toutes les
sources. Réponse :

```
{
  a: {
    session, source, profile, configId, config, offeredTools,
    totals: { cost, tokensInput, tokensOutput, tokensReasoning,
              cacheRead, cacheWrite, llmCalls, toolCalls, treeSize },
    byModel: [{ model, cost, tokensInput, tokensOutput, llmCalls }],
    tools: [{ name, count }],
    tree: [{ sessionId, parentId, agent, model, cost }]
  },
  b: { ... },
  delta: {
    cost, tokensInput, tokensOutput, tokensReasoning, cacheRead, cacheWrite,
    llmCalls, toolCalls,
    tools: [{ name, a, b, delta }],
    offeredOnlyA: [toolId], offeredOnlyB: [toolId]
  }
}
```

- `offeredTools` = ensemble **réellement offert** au LLM pour la session, capturé
  par le hook `tool.definition` (accumulé par session). `offeredOnlyA/B` = la
  différence symétrique des deux ensembles. Vide si non capturé (sessions
  d'avant le plugin).
- 404 si un id est introuvable dans toutes les sources.

## UI `/compare`

- Route `/compare`, picker 2 sessions (liste host + VM, `source` affichée,
  recherche/filtre projet).
- Deux colonnes + colonne delta. Sections : totaux, tokens par catégorie, appels
  LLM, appels d'outils (tableau trié par |delta|), breakdown par modèle, arbre
  subagents, config (profile/agent/tools offerts/MCP/skills).
- En-tête `configId`/`profile` : lecture A/B immédiate.
- Lien « Voir dans Phoenix » (recherche par `session.id`).
- Redux classic, pattern `REQUESTED → START/SUCCESS/ERROR` via `apiMiddleware`
  (conventions existantes du webapp).

## Erreurs / robustesse

- Store absent ou génération vide → ignoré silencieusement (aucune source VM).
- Device `ia-store` absent dans la VM (VM non configurée) → le plugin no-op
  (garde `existsSync('/mnt/ia-store')`), aucune erreur bloquante.
- Snapshot `.tmp` / illisible → génération marquée « illisible », non bloquante.
- DB host absente → comportement 503 actuel inchangé.
- Sidecar config absent (sessions d'avant le plugin) → `profile`/`configId` nuls,
  comparaison sur les données quantitatives seules.

## Tests

- **Valeur cœur** (le test qui casse si la logique casse) : union/dedup
  inter-générations (un même `session.id` dans 2 snapshots → le plus récent
  gagne) et agrégation de l'arbre (le coût total = parent + descendants, les
  appels d'outils des sous-agents comptés).
- Reader : méthodes calls/steps/toolUsage sur fixture SQLite.
- API : contrat `compare` (deltas, `offeredOnlyA/B`, 404).
- Webapp : reducers + rendu du tableau de deltas.
- Plugin : logique `configId` (déterminisme, insensibilité à l'ordre).

## Hors périmètre (YAGNI)

- Pas d'export incrémental par session (snapshot complet d'abord).
- Pas de daemon/watcher host (déclenchement par hook + manuel).
- Pas de lecture Phoenix côté ia-dashboard (deep-link seulement).
- Pas de changement du modèle `feature` (annotation manuelle conservée).
- Pas de prune automatique des générations.
- Pas de `durationMs` (temps actif) dans la réponse `compare` : réutiliserait la
  logique `timeByDirectory` ; reporté tant que le besoin n'est pas confirmé.
