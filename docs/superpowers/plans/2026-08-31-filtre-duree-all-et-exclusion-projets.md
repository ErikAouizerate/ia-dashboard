# Filtre durée "all" + exclusion de projets — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton « Tout » (aucune limite de temps) au dashboard et masquer des projets d'une liste en dur côté front dans les listes projets du dashboard.

**Architecture:** Côté API, `periodDays=0` devient « toutes les sessions » (`from=0` dans le reader OpenCode, déjà géré en SQL). Côté webapp, une constante `EXCLUDED_PROJECT_NAMES` + helper `isExcludedProject(name)` filtre `summary.byProject` et `summary.timeByProject` dans `DashboardView`. Les KPI, `byModel` et `byDay` restent inchangés (exclusion visuelle uniquement, dashboard uniquement).

**Tech Stack:** NestJS (API, tests Jest), React + Vite + TypeScript + Redux (webapp, tests Vitest), pnpm.

## Global Constraints

- **TypeScript uniquement** — pas de JS brut.
- **pnpm** : les commandes se lancent dans `api/` ou `webapp/` (`pnpm test`, `pnpm typecheck`).
- **Test-first** : écrire le test qui échoue → vérifier l'échec → implémenter le minimum → vérifier le passage → commit.
- **Exclusion visuelle seulement** : KPI, `byModel`, `byDay`, et les vues sessions/projets/features sont inchangés.
- **`periodDays=0` = all** ; absent/NaN → `7` (comportement actuel conservé).
- Libellés UI en français (bouton `Tout`, sous-titre `Tout`).

---

### Task 1: API — `periodDays=0` signifie « toutes les sessions »

**Files:**
- Modify: `api/src/dashboard/dashboard.service.ts:18-19`
- Modify: `api/src/dashboard/dashboard.controller.ts:8-12`
- Test: `api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Consumes: `DashboardService.summary(periodDays: number)` (existant) ; `OpenCodeReader.aggregateAll/aggregateByDirectory/aggregateByDirectoryAndModel/aggregateByModel/aggregateByDay/timeByDirectory({ from })` — `from: 0` renvoie toutes les sessions.
- Produces: `GET /api/dashboard/summary?periodDays=0` → `summary(0)` avec `periodDays: 0` et `from: 0` dans tous les appels reader.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter en fin de `describe("DashboardService", ...)` dans `api/src/dashboard/dashboard.service.spec.ts` :

```ts
it("summary with periodDays 0 aggregates everything (from=0)", async () => {
  const db = mkDb([{ c: 0 }], [{ c: 0 }], []);
  const svc = new DashboardService(readerMock as any, db as any);
  const out = await svc.summary(0);
  expect(out.periodDays).toBe(0);
  expect(readerMock.aggregateAll).toHaveBeenCalledWith({ from: 0 });
  expect(readerMock.aggregateByDirectory).toHaveBeenCalledWith({ from: 0 });
  expect(readerMock.aggregateByModel).toHaveBeenCalledWith({ from: 0 });
  expect(readerMock.aggregateByDay).toHaveBeenCalledWith({ from: 0 });
  expect(readerMock.timeByDirectory).toHaveBeenCalledWith({ from: 0 });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm test dashboard` (dans `api/`)
Expected: FAIL — `summary(0)` calcule `from = Date.now()` (les assertions `{ from: 0 }` échouent).

- [ ] **Step 3: Implémenter le minimum**

Dans `api/src/dashboard/dashboard.service.ts`, remplacer la ligne de calcul de `from` :

```ts
const from = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
```

Dans `api/src/dashboard/dashboard.controller.ts`, remplacer le corps de `summary()` :

```ts
@Get("summary")
summary(@Query("periodDays") periodDays?: string) {
  const raw = Number(periodDays);
  const days = Number.isFinite(raw) ? Math.max(0, raw) : 7;
  return this.svc.summary(days);
}
```

(`Number(undefined)` → `NaN` → `7` ; `"0"` → `0` ; `"abc"` → `NaN` → `7`.)

- [ ] **Step 4: Vérifier le passage**

Run: `pnpm test dashboard` (dans `api/`)
Expected: PASS (le nouveau test + les 3 existants)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck` (dans `api/`)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/dashboard/dashboard.service.ts api/src/dashboard/dashboard.controller.ts api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat(api): periodDays=0 returns all sessions in dashboard summary"
```

---

### Task 2: Webapp — constante d'exclusion + helper

**Files:**
- Create: `webapp/src/lib/excludedProjects.ts`
- Create: `webapp/src/lib/excludedProjects.spec.ts`

**Interfaces:**
- Consumes: rien (première tâche webapp).
- Produces: `EXCLUDED_PROJECT_NAMES: string[]` et `isExcludedProject(name: string): boolean`, utilisés par Task 3.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `webapp/src/lib/excludedProjects.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { EXCLUDED_PROJECT_NAMES, isExcludedProject } from "./excludedProjects";

describe("excludedProjects", () => {
  it("contains the initial exclusion list", () => {
    expect(EXCLUDED_PROJECT_NAMES).toEqual([
      "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
      "vps-setup",
      "test-oral",
      "tmp",
    ]);
  });

  it("isExcludedProject matches listed names and rejects others", () => {
    expect(isExcludedProject("vps-setup")).toBe(true);
    expect(isExcludedProject("test-oral")).toBe(true);
    expect(isExcludedProject("tmp")).toBe(true);
    expect(
      isExcludedProject(
        "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
      ),
    ).toBe(true);
    expect(isExcludedProject("gateway")).toBe(false);
    expect(isExcludedProject("infrastructure_v2")).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm vitest run src/lib/excludedProjects.spec.ts` (dans `webapp/`)
Expected: FAIL — le module `./excludedProjects` n'existe pas.

- [ ] **Step 3: Implémenter le minimum**

Créer `webapp/src/lib/excludedProjects.ts` :

```ts
export const EXCLUDED_PROJECT_NAMES = [
  "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
  "vps-setup",
  "test-oral",
  "tmp",
];

export function isExcludedProject(name: string): boolean {
  return EXCLUDED_PROJECT_NAMES.includes(name);
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `pnpm vitest run src/lib/excludedProjects.spec.ts` (dans `webapp/`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/excludedProjects.ts webapp/src/lib/excludedProjects.spec.ts
git commit -m "feat(webapp): add excluded projects list and helper"
```

---

### Task 3: Webapp — bouton « Tout » et filtrage des listes projets

**Files:**
- Modify: `webapp/src/views/DashboardView.tsx`
- Test: `webapp/src/views/DashboardView.spec.tsx`

**Interfaces:**
- Consumes: `isExcludedProject` (Task 2), `summary.byProject[].name`, `summary.timeByProject[].name` (dashboard store).
- Produces: dashboard avec bouton « Tout » et listes projets filtrées. Aucun changement de store ni de route.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `webapp/src/views/DashboardView.spec.tsx`, modifier `makeStore` pour accepter `periodDays` :

```tsx
function makeStore(summary: any, loading = false, periodDays = 7) {
  return configureStore({
    reducer: { dashboard: dashboardReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      dashboard: {
        periodDays,
        loading,
        error: null,
        summary,
      },
    },
  });
}
```

Ajouter ces tests dans le `describe("DashboardView", ...)` :

```tsx
it("renders a Tout button for the all-time filter", () => {
  const html = renderToStaticMarkup(
    <Provider store={makeStore(summary)}>
      <MemoryRouter initialEntries={["/"]}>
        <DashboardView />
      </MemoryRouter>
    </Provider>,
  );
  expect(html).toContain("Tout");
});

it("hides excluded projects from the project lists", () => {
  const withExcluded = {
    ...summary,
    byProject: [
      ...summary.byProject,
      {
        id: "nominal:tmp",
        name: "tmp",
        totalCost: 1,
        sessions: 1,
        tokensInput: 10,
        tokensOutput: 10,
        models: [],
      },
    ],
    timeByProject: [
      ...summary.timeByProject,
      { directory: "/p/tmp", name: "tmp", durationMs: 60000, id: "nominal:tmp" },
    ],
  };
  const html = renderToStaticMarkup(
    <Provider store={makeStore(withExcluded)}>
      <MemoryRouter initialEntries={["/"]}>
        <DashboardView />
      </MemoryRouter>
    </Provider>,
  );
  expect(html).toContain("gateway");
  expect(html).not.toContain("tmp");
});

it("renders Tout as the sessions KPI subtitle when the all-time filter is active", () => {
  const html = renderToStaticMarkup(
    <Provider store={makeStore({ ...summary, periodDays: 0 }, false, 0)}>
      <MemoryRouter initialEntries={["/"]}>
        <DashboardView />
      </MemoryRouter>
    </Provider>,
  );
  expect(html).toContain("Tout");
  expect(html).not.toContain("0 jours");
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm vitest run src/views/DashboardView.spec.tsx` (dans `webapp/`)
Expected: FAIL — `"tmp"` est présent dans le HTML rendu ; « Tout » absent.

- [ ] **Step 3: Implémenter le minimum**

Dans `webapp/src/views/DashboardView.tsx` :

1. Ajouter l'import :
```tsx
import { isExcludedProject } from "../lib/excludedProjects";
```

2. Ajouter le bouton « Tout » en tête du groupe de boutons (avant « 7 jours ») :
```tsx
<Button
  variant={days === 0 ? "primary" : "secondary"}
  onClick={() => load(0)}
>
  Tout
</Button>
```

3. Filtrer les listes projets juste après le bloc `{summary && (` (dans le corps du composant, avant le JSX retourné) :
```tsx
const visibleByProject = summary.byProject.filter((r) => !isExcludedProject(r.name));
const visibleTimeByProject = summary.timeByProject.filter((r) => !isExcludedProject(r.name));
```

4. Remplacer `rows={summary.byProject}` par `rows={visibleByProject}` dans les deux `BarList` « Coût par projet » et « Tokens par projet », et `rows={summary.timeByProject}` par `rows={visibleTimeByProject}` dans « Temps passé par projet ».

5. KPI « Sessions » : remplacer `sub={`${summary.periodDays} jours`}` par :
```tsx
sub={days === 0 ? "Tout" : `${summary.periodDays} jours`}
```

Note : placer les `const visibleByProject`/`visibleTimeByProject` avant le `return` du composant pour respecter les règles des hooks ; `summary` est non-null dans cette branche.

- [ ] **Step 4: Vérifier le passage**

Run: `pnpm vitest run src/views/DashboardView.spec.tsx` (dans `webapp/`)
Expected: PASS (4 nouveaux tests + les tests existants)

- [ ] **Step 5: Typecheck + tests webapp**

Run: `pnpm typecheck` puis `pnpm test` (dans `webapp/`)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add webapp/src/views/DashboardView.tsx webapp/src/views/DashboardView.spec.tsx
git commit -m "feat(webapp): add all-time filter and hide excluded projects in dashboard"
```

---

## Vérification finale

Après les 3 tâches :

- [ ] `pnpm test` (dans `api/`) : PASS
- [ ] `pnpm typecheck` (dans `api/`) : PASS
- [ ] `pnpm test` (dans `webapp/`) : PASS
- [ ] `pnpm typecheck` (dans `webapp/`) : PASS
- [ ] Vérification manuelle : `GET /api/dashboard/summary?periodDays=0` renvoie `periodDays: 0` et tous les agrégats.