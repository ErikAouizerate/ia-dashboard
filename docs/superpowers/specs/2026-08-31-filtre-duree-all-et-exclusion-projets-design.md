# Design — Filtre de durée "all" + exclusion de projets côté front

Date : 2026-08-31

## Objectif

Deux évolutions du dashboard :

1. **Filtre de durée "all"** : pouvoir afficher les agrégats sur **toute la
   période** (aucune limite de temps), en plus des boutons actuels `7 jours` /
   `30 jours`.
2. **Exclusion de projets côté front** : masquer certains projets des listes du
   dashboard (coût par projet, tokens par projet, temps passé par projet) via une
   liste de noms en dur côté webapp. Liste initiale : `data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000`,
   `vps-setup`, `test-oral`, `tmp`.

## Contexte

- `GET /api/dashboard/summary?periodDays=N` : le controller borne `N` à `>= 1`
  et défaut `7`. Le service calcule `from = Date.now() - periodDays * 86400000`.
- Le reader OpenCode (`open-code-reader`) filtre par `time_created >= @from` ;
  **`from = 0` donne donc toutes les sessions** — aucun cas particulier requis
  côté SQL.
- Décisions utilisateur :
  - Exclusion **dashboard uniquement** (sessions, projets, features inchangés).
  - Exclusion **visuelle seulement** : on masque les barres du projet dans les
    listes `byProject` / `timeByProject` ; les KPI (coût total, tokens, sessions)
    et les graphiques `byModel` / `byDay` restent calculés sur tout.
  - Liste d'exclusion **en dur** (constante dans le code webapp), pas d'UI
    éditable.
  - Correspondance **par nom de projet** (le `name` nominal du dashboard,
    regroupé des variantes `_v<chiffres>`).

## Approche retenue

`periodDays=0` signifie « tout » côté API ; exclusion purement côté vue
(`DashboardView`).

### API

1. **`api/src/dashboard/dashboard.service.ts`**
   - `summary(periodDays = 7)` : `const from = periodDays > 0 ? Date.now() - periodDays * 86400000 : 0;`
   - Le champ renvoyé `periodDays` reste `0` pour « all ».
2. **`api/src/dashboard/dashboard.controller.ts`**
   - Retirer le plancher bloquant : `Math.max(1, Number(periodDays))`.
   - Comportement : `periodDays` absent → `7` (inchangé) ; `periodDays=0` → `0`
     (all) ; sinon `Math.max(0, Number(periodDays))`.

### Webapp

1. **`webapp/src/lib/excludedProjects.ts`** (nouveau)
   - `export const EXCLUDED_PROJECT_NAMES = ["data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000", "vps-setup", "test-oral", "tmp"];`
   - `export function isExcludedProject(name: string): boolean` — renvoie
     `EXCLUDED_PROJECT_NAMES.includes(name)`. Helper unique, testable.
2. **`webapp/src/views/DashboardView.tsx`**
   - Bouton `Tout` à côté de `7 jours` / `30 jours` : `load(0)`, actif quand
     `days === 0`.
   - `load(d)` inchangé (dispatch `DASHBOARD_LOAD_REQUESTED` avec `periodDays: d`,
     path `/api/dashboard/summary?periodDays=${d}`).
   - `summary.byProject` et `summary.timeByProject` filtrés via
     `isExcludedProject(r.name)` avant rendu des `BarList`.
   - KPI « Sessions » : sous-titre `0 jours` → `Tout` quand `days === 0`.
3. Aucun changement de store (`periodDays` reste un `number`, `0` = all).

## Cas limites

- `periodDays` absent / invalide (NaN) → `7` (inchangé).
- `periodDays=0` : `from=0` → toutes les sessions, y compris les plus anciennes ;
  requêtes potentiellement plus coûteuses, accepté.
- Exclusion d'un projet absent du dashboard : sans effet (filtre par `name`).
- Un nom exclu correspond aussi aux variantes versionnées via le `name` nominal.

## Erreurs

- Aucune nouvelle erreur : `from=0` est un cas du reader déjà utilisé par
  d'autres endpoints (défaut de `from`).

## Tests

- `api/src/dashboard/dashboard.service.spec.ts` : `summary(0)` renvoie tous les
  agrégats (from=0) et `periodDays=0` ; les cas existants conservés.
- `webapp/src/lib/excludedProjects.spec.ts` (nouveau) : liste attendue et
  `isExcludedProject` (vrai pour les 4 valeurs, faux sinon).
- `webapp/src/views/DashboardView.spec.tsx` : bouton « Tout » ; projets exclus
  absents de `byProject`/`timeByProject` rendus ; sous-titre « Tout ».

## Fichiers touchés

- API : `src/dashboard/dashboard.service.ts`, `src/dashboard/dashboard.controller.ts`,
  `src/dashboard/dashboard.service.spec.ts`.
- Webapp : `src/lib/excludedProjects.ts` (nouveau) + spec,
  `src/views/DashboardView.tsx`, `src/views/DashboardView.spec.tsx`.

## Hors périmètre

- Aucune exclusion sur les vues sessions / projets / features / détail projet.
- Aucun recalcul des KPI, `byModel`, `byDay` sur les projets exclus.
- Pas d'UI éditable pour la liste d'exclusion, pas de persistance.
- Pas de changement du store dashboard ni de l'API reader.