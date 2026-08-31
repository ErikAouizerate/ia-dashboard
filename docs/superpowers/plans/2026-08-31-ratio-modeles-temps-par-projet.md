# Ratio de modèles et temps passé par projet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur le dashboard le ratio des modèles par projet (barres empilées par modèle) et le temps passé par projet, plus la durée sur les cartes de la liste des projets.

**Architecture:** Deux nouveaux agrégats SQL dans `OpenCodeReader` (`aggregateByDirectoryAndModel`, `timeByDirectory`), enrichissement de `DashboardService.summary` (models + share + timeByProject) et `ProjectsService` (durationMs sur les cartes, correction du byModel global dans findOne), puis rendu empilé côté webapp via `BarList.stackOf` (déjà présent) + deux nouvelles cartes.

**Tech Stack:** NestJS + Drizzle + better-sqlite3 (lecture SQLite OpenCode), React + Vite + Tailwind v4 + Redux, Jest (api), Vitest (webapp).

## Global Constraints

- TypeScript strict, pas de JS brut.
- Pas de nouvelle dépendance (ni graph, ni lib de formatage).
- Suite du feature « Tokens par modèle » (travail non commité présent dans `BarList.tsx`, `store/dashboard.ts`, `DashboardView.tsx`, `DashboardView.spec.tsx`). Ne pas réécrire ce qui existe déjà : `BarList` a déjà `formatValue` et `stackOf`.
- Durée proxy = `time_updated − time_created`, sessions parentes uniquement (`parent_id IS NULL`), durées ≤ 0 exclues.
- `share` = fraction (0..1) des sessions du projet, formatée en % côté UI.
- Couleurs par modèle : palette indexée par position dans `models` (déjà trié par sessions décroissante), stable entre les deux graphiques.
- Commandes : api `pnpm test`, `pnpm typecheck` ; webapp `pnpm test`, `pnpm typecheck`.

---

### Task 1: Reader — types + `aggregateByDirectoryAndModel`

**Files:**
- Modify: `api/src/opencode/opencode.types.ts` (append interfaces)
- Modify: `api/src/opencode/opencode-reader.ts` (après `aggregateByDirectory`, ligne ~287)
- Test: `api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Produces:
  - `DirectoryModelAggregate { directory: string; model: string; totalCost: number; tokensInput: number; tokensOutput: number; sessions: number }`
  - `aggregateByDirectoryAndModel({ from = 0 } = {}): DirectoryModelAggregate[]` — trié par `totalCost` décroissant, modèles JSON fusionnés via `parseModel`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `opencode-reader.spec.ts` une fonction de fixture multi-modèles, puis un test. Insérer après `buildFixture` :

```ts
function buildMultiModelFixture(dir: string): string {
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE session (
             id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
             title TEXT, model TEXT, agent TEXT,
             cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
             tokens_cache_read INTEGER, tokens_cache_write INTEGER,
             summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
             time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);`);
  const ins = db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, path, title, model, agent, cost,
       tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
       summary_additions, summary_deletions, summary_files, time_created, time_updated, time_compacting)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // gateway : parent + subagent deepseek, parent claude, parent deepseek (mergé)
  ins.run("g1", null, null, "/home/user/gateway", null, "A",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    1.0, 100, 200, 0, 0, 0, 0, 0, 0, 1000, 5000, null);
  ins.run("g1-sub", null, "g1", "/home/user/gateway", null, "sub",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "general",
    0.5, 10, 20, 0, 0, 0, 0, 0, 0, 1500, 2500, null);
  ins.run("g2", null, null, "/home/user/gateway", null, "B",
    '{"id":"claude-sonnet-4-20250514","providerID":"anthropic"}', "build",
    2.0, 50, 60, 0, 0, 0, 0, 0, 0, 2000, 3000, null);
  ins.run("g3", null, null, "/home/user/gateway", null, "C",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    3.0, 300, 400, 0, 0, 0, 0, 0, 0, 3000, 4000, null);
  // api : parent claude, parent deepseek à durée négative
  ins.run("a1", null, null, "/home/user/api", null, "D",
    '{"id":"claude-sonnet-4-20250514","providerID":"anthropic"}', "build",
    4.0, 700, 800, 0, 0, 0, 0, 0, 0, 1000, 2000, null);
  ins.run("a2", null, null, "/home/user/api", null, "E",
    '{"id":"deepseek-v4-flash-free","providerID":"opencode"}', "build",
    0.1, 1, 1, 0, 0, 0, 0, 0, 0, 5000, 4000, null);
  db.close();
  return path;
}
```

Puis, à l'intérieur du `describe`, ajouter ce bloc de test (nouveau `beforeEach`/`afterEach` dans un sous-`describe`) :

```ts
describe("multi-model fixture", () => {
  let reader: OpenCodeReader;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-multi-"));
    path = buildMultiModelFixture(dir);
    reader = new OpenCodeReader(path);
    reader.open();
  });
  afterEach(() => reader.close());

  it("aggregates by directory and model, merging duplicate JSON model ids", () => {
    const rows = reader.aggregateByDirectoryAndModel({});
    const gateway = rows.filter((r) => r.directory === "/home/user/gateway");
    const ds = gateway.find((r) => r.model === "deepseek-v4-flash-free");
    // g1 + g1-sub + g3 : l'agrégat modèle inclut les subagents (comme aggregateByModel)
    expect(ds?.sessions).toBe(3);
    expect(ds?.totalCost).toBeCloseTo(4.5); // 1.0 + 0.5 + 3.0
    expect(ds?.tokensInput).toBe(410); // 100 + 10 + 300
    const claude = gateway.find((r) => r.model === "claude-sonnet-4-20250514");
    expect(claude?.sessions).toBe(1);
    expect(rows.filter((r) => r.directory === "/home/user/api").length).toBe(2);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd api && pnpm test opencode-reader`
Expected: FAIL — `TypeError: reader.aggregateByDirectoryAndModel is not a function`

- [ ] **Step 3: Ajouter le type**

Dans `api/src/opencode/opencode.types.ts`, après `DirectoryAggregate` :

```ts
export interface DirectoryModelAggregate extends SessionAggregate {
  directory: string;
  model: string;
}
```

- [ ] **Step 4: Implémenter**

Dans `api/src/opencode/opencode-reader.ts`, ajouter l'import de type :

```ts
import {
  DayAggregate,
  DirectoryAggregate,
  DirectoryModelAggregate,
  ModelAggregate,
  ...
} from "./opencode.types";
```

Et la méthode, juste après `aggregateByDirectory` (ligne ~287) :

```ts
aggregateByDirectoryAndModel({ from = 0 }: { from?: number } = {}): DirectoryModelAggregate[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT directory, model,
              COALESCE(SUM(cost),0) AS totalCost,
              COALESCE(SUM(tokens_input),0) AS tokensInput,
              COALESCE(SUM(tokens_output),0) AS tokensOutput,
              COUNT(*) AS sessions
       FROM session
       WHERE time_created >= @from AND directory IS NOT NULL AND directory != ''
       GROUP BY directory, model`,
    )
    .all({ from }) as {
    directory: string;
    model: string;
    totalCost: number;
    tokensInput: number;
    tokensOutput: number;
    sessions: number;
  }[];
  const out: DirectoryModelAggregate[] = [];
  for (const r of rows) {
    const id = this.parseModel(r.model);
    if (!id) continue;
    const existing = out.find((m) => m.directory === r.directory && m.model === id);
    if (existing) {
      existing.totalCost += r.totalCost;
      existing.tokensInput += r.tokensInput;
      existing.tokensOutput += r.tokensOutput;
      existing.sessions += r.sessions;
    } else {
      out.push({
        directory: r.directory,
        model: id,
        totalCost: r.totalCost,
        tokensInput: r.tokensInput,
        tokensOutput: r.tokensOutput,
        sessions: r.sessions,
      });
    }
  }
  return out.sort((a, b) => b.totalCost - a.totalCost);
}
```

- [ ] **Step 5: Vérifier que le test passe**

Run: `cd api && pnpm test opencode-reader`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/opencode/opencode.types.ts api/src/opencode/opencode-reader.ts api/src/opencode/opencode-reader.spec.ts
git commit -m "feat(api): aggregate sessions by directory and model"
```

---

### Task 2: Reader — `timeByDirectory`

**Files:**
- Modify: `api/src/opencode/opencode.types.ts`
- Modify: `api/src/opencode/opencode-reader.ts`
- Test: `api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Produces:
  - `DirectoryTimeAggregate { directory: string; durationMs: number }`
  - `timeByDirectory({ from = 0 } = {}): DirectoryTimeAggregate[]` — trié par `durationMs` décroissant, parents uniquement, durées ≤ 0 exclues.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans le sous-`describe("multi-model fixture", ...)` :

```ts
it("sums parent session duration per directory, excluding subagents and non-positive", () => {
  const rows = reader.timeByDirectory({});
  const gateway = rows.find((r) => r.directory === "/home/user/gateway");
  // g1 (5000-1000=4000) + g2 (3000-2000=1000) + g3 (4000-3000=1000) ; subagent g1-sub exclu
  expect(gateway?.durationMs).toBe(6000);
  const api = rows.find((r) => r.directory === "/home/user/api");
  // a1 (2000-1000=1000) ; a2 durée négative exclue
  expect(api?.durationMs).toBe(1000);
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd api && pnpm test opencode-reader`
Expected: FAIL — `reader.timeByDirectory is not a function`

- [ ] **Step 3: Ajouter le type**

Dans `api/src/opencode/opencode.types.ts`, après `DirectoryModelAggregate` :

```ts
export interface DirectoryTimeAggregate {
  directory: string;
  durationMs: number;
}
```

- [ ] **Step 4: Implémenter**

Dans `api/src/opencode/opencode-reader.ts` :
- ajouter `DirectoryTimeAggregate` à l'import de types ;
- ajouter la méthode après `aggregateByDirectoryAndModel` :

```ts
timeByDirectory({ from = 0 }: { from?: number } = {}): DirectoryTimeAggregate[] {
  const db = this.requireDb();
  const rows = db
    .prepare(
      `SELECT directory, SUM(time_updated - time_created) AS durationMs
       FROM session
       WHERE time_created >= @from
         AND directory IS NOT NULL AND directory != ''
         AND parent_id IS NULL
         AND time_updated > time_created
       GROUP BY directory`,
    )
    .all({ from }) as { directory: string; durationMs: number }[];
  return rows
    .map((r) => ({ directory: r.directory, durationMs: r.durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs);
}
```

- [ ] **Step 5: Vérifier que le test passe**

Run: `cd api && pnpm test opencode-reader`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/opencode/opencode.types.ts api/src/opencode/opencode-reader.ts api/src/opencode/opencode-reader.spec.ts
git commit -m "feat(api): aggregate parent session duration per directory"
```

---

### Task 3: DashboardService — enrichir `summary`

**Files:**
- Modify: `api/src/dashboard/dashboard.service.ts`
- Test: `api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Consumes: `aggregateByDirectoryAndModel({ from })`, `timeByDirectory({ from })` (Task 1–2).
- Produces:
  - `summary.byProject[].models: Array<{ model; totalCost; tokensInput; tokensOutput; sessions; share }>` (trié par `sessions` décroissant, `share = sessions / byProject[].sessions`)
  - `summary.timeByProject: Array<{ directory; name; durationMs; id }>` (trié par `durationMs` décroissant, `name` = basename du répertoire, `id` = id du projet ou null)

- [ ] **Step 1: Étendre le mock et le test**

Dans `api/src/dashboard/dashboard.service.spec.ts`, ajouter aux mocks du reader :

```ts
aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
  {
    directory: "/p/gateway",
    model: "deepseek-v4-flash",
    totalCost: 6,
    tokensInput: 5,
    tokensOutput: 5,
    sessions: 1,
  },
  {
    directory: "/p/gateway",
    model: "claude-sonnet",
    totalCost: 4,
    tokensInput: 3,
    tokensOutput: 3,
    sessions: 1,
  },
]),
timeByDirectory: jest.fn().mockReturnValue([
  { directory: "/p/gateway", durationMs: 3600000 },
]),
```

Et dans le test existant `summary aggregates live metrics plus analysed/feature counts`, changer le mock `aggregateByDirectory` pour qu'il renvoie `sessions: 2` :

```ts
aggregateByDirectory: jest.fn().mockReturnValue([
  { directory: "/p/gateway", name: "gateway", totalCost: 10, sessions: 2 },
]),
```

Ajouter les assertions à la fin du test :

```ts
expect(out.byProject[0].models).toEqual([
  {
    directory: "/p/gateway",
    model: "deepseek-v4-flash",
    totalCost: 6,
    tokensInput: 5,
    tokensOutput: 5,
    sessions: 1,
    share: 0.5,
  },
  {
    directory: "/p/gateway",
    model: "claude-sonnet",
    totalCost: 4,
    tokensInput: 3,
    tokensOutput: 3,
    sessions: 1,
    share: 0.5,
  },
]);
expect(out.timeByProject).toEqual([
  { directory: "/p/gateway", name: "gateway", durationMs: 3600000, id: "p1" },
]);
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd api && pnpm test dashboard.service`
Expected: FAIL — `byProject[0].models` undefined

- [ ] **Step 3: Implémenter**

Dans `api/src/dashboard/dashboard.service.ts`, remplacer la construction du retour :

```ts
    const idByDir = new Map(projectRows.map((p) => [p.directory, p.id]));
    const modelRows = this.reader.aggregateByDirectoryAndModel({ from });
    const timeRows = this.reader.timeByDirectory({ from });
    const byProject = this.reader
      .aggregateByDirectory({ from })
      .map((a) => {
        const models = modelRows
          .filter((m) => m.directory === a.directory)
          .map((m) => ({ ...m, share: a.sessions > 0 ? m.sessions / a.sessions : 0 }))
          .sort((x, y) => y.sessions - x.sessions);
        return { ...a, id: idByDir.get(a.directory) ?? null, models };
      });
    const timeByProject = timeRows
      .map((t) => ({
        ...t,
        name: t.directory.split("/").filter(Boolean).pop() ?? t.directory,
        id: idByDir.get(t.directory) ?? null,
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
    return {
      periodDays,
      ...all,
      sessionCount: all.sessions,
      analysedCount,
      featureCount,
      byProject,
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
      timeByProject,
    };
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `cd api && pnpm test dashboard.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/dashboard/dashboard.service.ts api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat(api): dashboard summary exposes per-project model share and time spent"
```

---

### Task 4: ProjectsService — `durationMs` en liste + fix `byModel` de `findOne`

**Files:**
- Modify: `api/src/projects/projects.service.ts`
- Test: `api/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes: `timeByDirectory({})`, `aggregateByDirectoryAndModel({})` (Task 1–2).
- Produces:
  - `list()[].durationMs: number`
  - `findOne().byModel: Array<{ model; totalCost; sessions }>` scopé au répertoire du projet (corrige le bug global actuel).

- [ ] **Step 1: Étendre le mock et les tests**

Dans `api/src/projects/projects.service.spec.ts`, ajouter au readerMock :

```ts
timeByDirectory: jest.fn().mockReturnValue([
  { directory: "/home/user/gateway", durationMs: 7200000 },
]),
aggregateByDirectoryAndModel: jest.fn().mockReturnValue([
  {
    directory: "/home/user/gateway",
    model: "deepseek-v4-flash",
    totalCost: 5,
    tokensInput: 10,
    tokensOutput: 20,
    sessions: 2,
  },
]),
```

Dans le test `list returns projects with live aggregates`, ajouter :

```ts
expect(rows[0].durationMs).toBe(7200000);
```

Dans le test `findOne returns features and proposals`, ajouter une assertion que `byModel` est bien scopé au répertoire (le mock ne renvoie que `/home/user/gateway` ; si le filtre répertoire est absent, `byModel` resterait vide) :

```ts
expect(detail.byModel).toEqual([{ model: "deepseek-v4-flash", totalCost: 5, sessions: 2 }]);
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `cd api && pnpm test projects.service`
Expected: FAIL — `durationMs` undefined et `byModel` différent de l'attendu (actuellement renvoyé par `aggregateByModel`).

- [ ] **Step 3: Implémenter**

Dans `api/src/projects/projects.service.ts` :

Dans `list()` :
```ts
  async list() {
    await this.syncProjects();
    const rows = await this.db.select().from(projects).orderBy(desc(projects.lastSeen));
    const agg = this.reader.aggregateByDirectory({});
    const byDir = new Map(agg.map((a) => [a.directory, a]));
    const times = new Map(this.reader.timeByDirectory({}).map((t) => [t.directory, t.durationMs]));
    return rows.map((p) => {
      const a: DirectoryAggregate | undefined = byDir.get(p.directory);
      return {
        id: p.id,
        name: p.name,
        directory: p.directory,
        stale: p.stale,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        sessionCount: a?.sessions ?? 0,
        totalCost: a?.totalCost ?? 0,
        tokensInput: a?.tokensInput ?? 0,
        tokensOutput: a?.tokensOutput ?? 0,
        durationMs: times.get(p.directory) ?? 0,
      };
    });
  }
```

Dans `findOne()`, remplacer `byModel: this.reader.aggregateByModel({})` par :

```ts
      byModel: this.reader
        .aggregateByDirectoryAndModel({})
        .filter((m) => m.directory === row.directory)
        .map(({ model, totalCost, sessions }) => ({ model, totalCost, sessions })),
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd api && pnpm test projects.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/projects/projects.service.ts api/src/projects/projects.service.spec.ts
git commit -m "feat(api): project list duration and project-scoped byModel"
```

---

### Task 5: Webapp — types store + helper `formatDuration`

**Files:**
- Create: `webapp/src/lib/format.ts`
- Create: `webapp/src/lib/format.spec.ts`
- Modify: `webapp/src/store/dashboard.ts`
- Modify: `webapp/src/store/projects.ts`

**Interfaces:**
- Produces:
  - `formatDuration(ms: number): string` — `"0m"`, `"1h"`, `"1h 30m"` (arrondi à la minute, heures si ≥ 60 min).
  - `DashboardSummary.byProject[].models: Array<{ model; totalCost; tokensInput; tokensOutput; sessions; share }>`
  - `DashboardSummary.timeByProject: Array<{ directory; name; durationMs; id }>`
  - `ProjectRow.durationMs: number`

- [ ] **Step 1: Écrire le helper + test**

`webapp/src/lib/format.ts` :
```ts
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

`webapp/src/lib/format.spec.ts` :
```ts
import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats sub-hour durations in minutes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(30000)).toBe("1m");
    expect(formatDuration(3599999)).toBe("1h");
  });
  it("formats hour durations", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(5400000)).toBe("1h 30m");
    expect(formatDuration(7200000)).toBe("2h");
  });
});
```

- [ ] **Step 2: Vérifier que le test passe**

Run: `cd webapp && pnpm test format`
Expected: PASS

- [ ] **Step 3: Mettre à jour les types du store**

`webapp/src/store/dashboard.ts`, dans `DashboardSummary` :
```ts
  byProject: {
    id: string | null;
    name: string;
    totalCost: number;
    sessions: number;
    tokensInput: number;
    tokensOutput: number;
    models: {
      model: string;
      totalCost: number;
      tokensInput: number;
      tokensOutput: number;
      sessions: number;
      share: number;
    }[];
  }[];
  ...
  timeByProject: { directory: string; name: string; durationMs: number; id: string | null }[];
```

`webapp/src/store/projects.ts`, dans `ProjectRow`, ajouter :
```ts
  durationMs: number;
```

- [ ] **Step 4: Vérifier le typecheck**

Run: `cd webapp && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/format.ts webapp/src/lib/format.spec.ts webapp/src/store/dashboard.ts webapp/src/store/projects.ts
git commit -m "feat(webapp): duration formatter and updated dashboard/project types"
```

---

### Task 6: DashboardView — barres empilées par modèle + cartes tokens/temps

**Files:**
- Modify: `webapp/src/components/ui/BarList.tsx` (segment `title`)
- Modify: `webapp/src/views/DashboardView.tsx`
- Test: `webapp/src/views/DashboardView.spec.tsx`

**Interfaces:**
- Consumes: `summary.byProject[].models`, `summary.timeByProject` (Task 5), `formatDuration` (Task 5).
- Palette de couleurs locale : `MODEL_COLORS` (index par position dans `models`).

- [ ] **Step 1: Étendre le test (échoue)**

Dans `webapp/src/views/DashboardView.spec.tsx`, enrichir le fixture `byProject` :

```ts
  byProject: [
    {
      id: "p1",
      name: "gateway",
      totalCost: 5,
      sessions: 2,
      tokensInput: 100,
      tokensOutput: 200,
      models: [
        {
          model: "deepseek-v4-flash",
          totalCost: 3,
          tokensInput: 80,
          tokensOutput: 120,
          sessions: 1,
          share: 0.5,
        },
        {
          model: "claude-sonnet",
          totalCost: 2,
          tokensInput: 20,
          tokensOutput: 80,
          sessions: 1,
          share: 0.5,
        },
      ],
    },
  ],
```

Ajouter `timeByProject` au fixture :

```ts
  timeByProject: [
    { directory: "/p/gateway", name: "gateway", durationMs: 5400000, id: "p1" },
  ],
```

Ajouter le test :

```ts
  it("renders cost per project stacked by model, tokens per project and time per project", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Coût par projet");
    expect(html).toContain("claude-sonnet"); // segment de modèle dans la barre coût
    expect(html).toContain("Tokens par projet");
    expect(html).toContain("Temps passé par projet");
    expect(html).toContain("1h 30m");
  });
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd webapp && pnpm test DashboardView`
Expected: FAIL — « Tokens par projet », « Temps passé par projet » absents.

- [ ] **Step 3: Ajouter `title` aux segments de `BarList`**

Dans `webapp/src/components/ui/BarList.tsx`, le type de segment et son rendu :

```ts
  stackOf?: (r: any) => Array<{ value: number; className: string; title?: string }>;
```
```ts
                    <div
                      key={j}
                      className={`h-full ${seg.className}`}
                      style={{ width: `${(seg.value / max) * 100}%` }}
                      title={seg.title}
                    />
```

- [ ] **Step 4: Implémenter les cartes dans DashboardView**

Dans `webapp/src/views/DashboardView.tsx` :

En haut de fichier, importer `formatDuration` :
```ts
import { formatDuration } from "../lib/format";
```

Définir la palette (en haut de fichier, après les imports) :
```ts
const MODEL_COLORS = [
  "bg-blue-500",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-violet-500",
  "bg-rose-400",
  "bg-cyan-500",
  "bg-orange-400",
  "bg-teal-400",
];
```

Remplacer la carte « Coût par projet » pour l'empiler par modèle :
```tsx
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par projet</h3>
              <BarList
                rows={summary.byProject}
                valueOf={(r) => r.totalCost}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                stackOf={(r) =>
                  r.models.map((m: any, i: number) => ({
                    value: m.totalCost,
                    className: MODEL_COLORS[i % MODEL_COLORS.length],
                    title: `${m.model}: ${m.totalCost.toFixed(2)} € (${Math.round(m.share * 100)}%)`,
                  }))
                }
              />
            </Card>
```

Ajouter les deux nouvelles cartes dans la même grille `lg:grid-cols-2` (après « Tokens par modèle ») :

```tsx
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Tokens par projet</h3>
              <BarList
                rows={summary.byProject}
                valueOf={(r) => r.tokensInput + r.tokensOutput}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                valueSuffix=""
                formatValue={(n) => n.toLocaleString()}
                stackOf={(r) =>
                  r.models.map((m: any, i: number) => ({
                    value: m.tokensInput + m.tokensOutput,
                    className: MODEL_COLORS[i % MODEL_COLORS.length],
                    title: `${m.model}: ${(m.tokensInput + m.tokensOutput).toLocaleString()} tok`,
                  }))
                }
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Temps passé par projet</h3>
              <BarList
                rows={summary.timeByProject}
                valueOf={(r) => r.durationMs}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                valueSuffix=""
                formatValue={(n) => formatDuration(n)}
              />
            </Card>
```

- [ ] **Step 5: Vérifier que le test passe**

Run: `cd webapp && pnpm test DashboardView`
Expected: PASS

- [ ] **Step 6: Vérifier typecheck**

Run: `cd webapp && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/ui/BarList.tsx webapp/src/views/DashboardView.tsx webapp/src/views/DashboardView.spec.tsx
git commit -m "feat(webapp): stacked model breakdown for cost/tokens per project and time chart"
```

---

### Task 7: ProjectsView — durée sur chaque carte

**Files:**
- Modify: `webapp/src/views/ProjectsView.tsx`
- Create: `webapp/src/views/ProjectsView.spec.tsx`

**Interfaces:**
- Consumes: `ProjectRow.durationMs` (Task 5), `formatDuration` (Task 5).

- [ ] **Step 1: Écrire le test (échoue)**

Créer `webapp/src/views/ProjectsView.spec.tsx` :

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { projectsReducer } from "../store/projects";
import { ProjectsView } from "./ProjectsView";

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      projects: {
        items: [
          {
            id: "p1",
            name: "gateway",
            directory: "/home/user/gateway",
            stale: false,
            firstSeen: "2026-08-01T00:00:00.000Z",
            lastSeen: "2026-08-31T00:00:00.000Z",
            sessionCount: 2,
            totalCost: 5,
            tokensInput: 100,
            tokensOutput: 200,
            durationMs: 5400000,
          },
        ],
        current: null,
        loading: false,
        error: null,
      },
    },
  });
}

describe("ProjectsView", () => {
  it("renders project cards with session count, cost and duration", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/projects"]}>
          <ProjectsView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("gateway");
    expect(html).toContain("2 sessions");
    expect(html).toContain("1h 30m");
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd webapp && pnpm test ProjectsView`
Expected: FAIL — « 1h 30m » absent.

- [ ] **Step 3: Implémenter**

Dans `webapp/src/views/ProjectsView.tsx` :
- importer `formatDuration` ;
- modifier la ligne d'infos de la carte :

```tsx
                <div className="mt-1 text-sm text-gray-700">
                  {p.sessionCount} sessions · {p.totalCost.toFixed(2)} € ·{" "}
                  {p.tokensInput.toLocaleString()} tok · {formatDuration(p.durationMs)}
                </div>
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `cd webapp && pnpm test ProjectsView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webapp/src/views/ProjectsView.tsx webapp/src/views/ProjectsView.spec.tsx
git commit -m "feat(webapp): show duration on project cards"
```

---

### Task 8: Vérification globale

- [ ] **Step 1: Tests api**

Run: `cd api && pnpm test`
Expected: PASS (tous les specs).

- [ ] **Step 2: Tests webapp**

Run: `cd webapp && pnpm test`
Expected: PASS (tous les specs).

- [ ] **Step 3: Typecheck api**

Run: `cd api && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Typecheck webapp**

Run: `cd webapp && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: model ratio and time spent per project on dashboard"
```

(Ne pas pousser, sauf demande explicite.)