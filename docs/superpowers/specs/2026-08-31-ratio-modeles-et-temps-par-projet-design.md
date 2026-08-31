# Design — Ratio de modèles et temps passé par projet

Date : 2026-08-31

## Objectif

Sur le dashboard, afficher pour chaque projet le ratio des modèles utilisés
(graphiques à barres empilées par modèle) et le temps passé (durée des sessions).
Ajouter aussi le temps total sur les cartes de la liste des projets.

## Contexte

- L'API renvoie déjà des agrégats globaux : `aggregateByDirectory` (par projet :
  coût, tokens, sessions), `aggregateByModel` (par modèle). **Il n'existe pas
  d'agrégat par (répertoire × modèle)** ni de durée.
- Aucun champ « durée » n'existe dans la table `session`. Seuls `time_created`,
  `time_updated` et `time_compacting` sont disponibles. Proxy retenu :
  `time_updated − time_created`, sommé sur les **sessions parentes uniquement**
  (`parent_id IS NULL`, donc pas de double comptage des subagents), en excluant
  les durées ≤ 0.
- Bug existant : `ProjectsService.findOne` renvoie `byModel` en global
  (`aggregateByModel({})`, non filtré par répertoire) et ce champ n'est pas
  affiché dans l'UI. On en profite pour le scoper au répertoire du projet.
- Le dashboard a déjà un sélecteur de période (7/30 jours) appliqué via
  `from` à tous les agrégats.

## Approche retenue

Nouvel agrégat SQL `aggregateByDirectoryAndModel` + agrégat `timeByDirectory`,
puis enrichissement des réponses API et rendu empilé côté webapp.

### API

1. **`api/src/opencode/opencode-reader.ts`**
   - `aggregateByDirectoryAndModel({ from = 0 })` : `GROUP BY directory, model`
     avec `SUM(cost)`, `SUM(tokens_input)`, `SUM(tokens_output)`, `COUNT(*)`,
     puis fusion des doublons de modèles (même logique `parseModel` que
     `aggregateByModel`). Retourne
     `Array<{ directory, model, totalCost, tokensInput, tokensOutput, sessions }>`.
   - `timeByDirectory({ from = 0 })` : `SUM(time_updated - time_created)` où
     `parent_id IS NULL AND time_updated > time_created`, `GROUP BY directory`.
     Retourne `Array<{ directory, durationMs }>`.
2. **`api/src/dashboard/dashboard.service.ts`** — `summary()` enrichit `byProject` :
   chaque entrée reçoit `models: [{ model, totalCost, tokensInput, tokensOutput,
   sessions, share }]` (share = % des sessions du projet), reconstruit depuis
   `aggregateByDirectoryAndModel`. Ajoute `timeByProject` (même période) à partir
   de `timeByDirectory`, trié par durée décroissante.
3. **`api/src/projects/projects.service.ts`**
   - `list()` : ajoute `durationMs` à chaque carte via `timeByDirectory({})`.
   - `findOne()` : corrige `byModel` → `aggregateByDirectoryAndModel` filtré sur
     `row.directory`, renvoyé en `byModel`.

### Webapp

1. **`webapp/src/views/DashboardView.tsx`**
   - « Coût par projet » : barre empilée par modèle (segments colorés par modèle,
     tooltip avec modèle, coût et %).
   - Nouvelle carte **« Tokens par projet »** : barre empilée par modèle,
     total tokens (in+out) par modèle.
   - Nouvelle carte **« Temps passé par projet »** : format `Xh Ym`, trié
     décroissant.
2. **`webapp/src/views/ProjectsView.tsx`** — chaque carte affiche le temps total
   (`durationMs` formaté `Xh Ym`) aux côtés de sessions/coût/tokens.
3. **Types** — `webapp/src/store/dashboard.ts` : `byProject[].models`, `share`,
   `timeByProject`. `webapp/src/store/projects.ts` : `ProjectRow.durationMs`.
4. **`webapp/src/components/ui/BarList.tsx`** — généraliser si nécessaire pour
   l'empilement multi-segments et la valeur par segment (déjà utilisé pour
   l'empilement in/out de « Tokens par modèle » ; réutiliser ce mécanisme).

### Couleurs par modèle

Palette fixe indexée par position (ex. blue, emerald, amber, violet, rose, …)
attribuée dans l'ordre de part décroissante, pour rester stable entre les deux
graphiques d'un même projet. Pas de mapping global par nom de modèle.

## Tests

- `api/src/opencode/opencode-reader.spec.ts` : nouveaux cas pour
  `aggregateByDirectoryAndModel` (groupement répertoire×modèle, fusion de
  modèles JSON dupliqués) et `timeByDirectory` (exclusion subagents, exclusion
  durées ≤ 0).
- `api/src/dashboard/dashboard.service.spec.ts` : `summary` renvoie `models` avec
  `share` et `timeByProject`.
- `webapp/src/views/DashboardView.spec.tsx` : fixtures étendues, assertions sur
  les nouvelles cartes.
- `webapp/src/views/ProjectsView.spec.tsx` (si existe) : durée sur les cartes.

## Hors périmètre

- Pas de nouvelle dépendance de graphique.
- Pas de graphique temps par modèle ni par jour.
- Pas de changement sur la page détail projet (le bug `byModel` global est
  corrigé en passant, sans changement d'affichage).