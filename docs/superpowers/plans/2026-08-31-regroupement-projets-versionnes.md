# Regroupement des projets versionnés — Plan d'implémentation

> **Pour les agents d'exécution :** SKILL REQUIS : utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Goal:** Considérer les projets dont le nom de répertoire porte un suffixe `_v<chiffres>` comme un seul projet sous leur nom nominal, à la lecture, dans toute l'app ia-dashboard.

**Architecture:** Regroupement **à la lecture** uniquement (aucune migration). Un helper `nominalName()` calcule le nom nominal (strip `_v\d+$`), un helper `groupProjects()` regroupe les lignes `projects`, et chaque service API (projets, sessions, dashboard) consomme ces groupes. Le webapp ne change que l'affichage des répertoires membres.

**Tech Stack:** NestJS, Drizzle ORM, better-sqlite3 (lecture OpenCode), Jest (api), Vitest + React Testing Library (webapp), pnpm.

## Global Constraints

- Règle de nom nominal : sur le **basename** uniquement ; retire **itérativement** tout suffixe `_v<1+ chiffres>` (`infrastructure_v2` → `infrastructure`, `infrastructure_v2_v3` → `infrastructure`, `vue3` inchangé).
- Id synthétique stable : `nominal:<nom>` ; un projet **non groupé** (single, non-versionné) garde son id réel.
- `syncProjects()` **inchangé** : les lignes `projects` restent par répertoire.
- Un répertoire versionné isolé (ex. seulement `infrastructure_v2`) est regroupé sous son nom nominal.
- `stale` d'un groupe = `true` seulement si **tous** ses membres sont stale.
- Champ `directory` d'un groupe = membre dont le basename == nom nominal si existant, sinon premier membre ; `directories` = tous les répertoires membres.
- Communication en français avec l'utilisateur ; code, tests et commits en anglais.
- pnpm uniquement (pas de npm/yarn) ; TypeScript uniquement.

---

### Task 1: Helper `nominalName` / `nominalId`

**Files:**
- Create: `api/src/projects/nominal-name.ts`
- Test: `api/src/projects/nominal-name.spec.ts`

**Interfaces:**
- Produces: `nominalName(basename: string): string`, `nominalId(name: string): string`, `isNominalId(id: string): boolean`, `nominalFromId(id: string): string | null`.

- [ ] **Step 1: Write the failing test**

Create `api/src/projects/nominal-name.spec.ts`:

```ts
import { nominalFromId, nominalId, isNominalId, nominalName } from "./nominal-name";

describe("nominalName", () => {
  it("keeps names without a version suffix", () => {
    expect(nominalName("infrastructure")).toBe("infrastructure");
    expect(nominalName("mon_projet")).toBe("mon_projet");
    expect(nominalName("vue3")).toBe("vue3");
    expect(nominalName("v2")).toBe("v2");
  });

  it("strips a trailing _v<digits> suffix", () => {
    expect(nominalName("infrastructure_v2")).toBe("infrastructure");
    expect(nominalName("gateway_v10")).toBe("gateway");
    expect(nominalName("api_v1")).toBe("api");
  });

  it("strips repeated version suffixes iteratively", () => {
    expect(nominalName("infrastructure_v2_v3")).toBe("infrastructure");
  });

  it("keeps a name that is only a version suffix", () => {
    expect(nominalName("_v2")).toBe("_v2");
  });
});

describe("nominalId / isNominalId / nominalFromId", () => {
  it("builds and detects synthetic ids", () => {
    expect(nominalId("infrastructure")).toBe("nominal:infrastructure");
    expect(isNominalId("nominal:infrastructure")).toBe(true);
    expect(isNominalId("p1")).toBe(false);
    expect(nominalFromId("nominal:infrastructure")).toBe("infrastructure");
    expect(nominalFromId("p1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- nominal-name` (workdir `api`)
Expected: FAIL — module `./nominal-name` not found.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/projects/nominal-name.ts`:

```ts
const NOMINAL_ID_PREFIX = "nominal:";
const VERSION_SUFFIX = /_v\d+$/;

export function nominalName(basename: string): string {
  let out = basename;
  while (VERSION_SUFFIX.test(out)) {
    out = out.replace(VERSION_SUFFIX, "");
  }
  return out === "" ? basename : out;
}

export function nominalId(name: string): string {
  return `${NOMINAL_ID_PREFIX}${name}`;
}

export function isNominalId(id: string): boolean {
  return id.startsWith(NOMINAL_ID_PREFIX);
}

export function nominalFromId(id: string): string | null {
  return isNominalId(id) ? id.slice(NOMINAL_ID_PREFIX.length) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- nominal-name` (workdir `api`)
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/projects/nominal-name.ts api/src/projects/nominal-name.spec.ts
git commit -m "feat(api): add nominal-name helper for versioned project grouping"
```

---

### Task 2: Helper `groupProjects`

**Files:**
- Create: `api/src/projects/project-groups.ts`
- Test: `api/src/projects/project-groups.spec.ts`

**Interfaces:**
- Consumes: `nominalName`, `nominalId` (Task 1).
- Produces: `ProjectRowLike` (shape minimale des lignes `projects`), `ProjectGroupMeta { id, name, directory, directories, stale, firstSeen, lastSeen }`, `groupProjects(rows: ProjectRowLike[]): ProjectGroupMeta[]`.
  - `id` = `nominalId(key)` si le groupe est **groupé** (plusieurs membres OU aucun membre au basename == nom nominal), sinon id réel du membre unique.
  - `directory` = membre avec basename == nom nominal si existant, sinon premier membre.

- [ ] **Step 1: Write the failing test**

Create `api/src/projects/project-groups.spec.ts`:

```ts
import { basename } from "node:path";
import { groupProjects, ProjectRowLike } from "./project-groups";

function row(
  id: string,
  directory: string,
  stale = false,
  first = 1000,
  last = 2000,
): ProjectRowLike {
  return {
    id,
    name: basename(directory),
    directory,
    stale,
    firstSeen: new Date(first),
    lastSeen: new Date(last),
  };
}

describe("groupProjects", () => {
  it("keeps a single non-versioned project unchanged", () => {
    const out = groupProjects([row("p1", "/w/gateway")]);
    expect(out).toEqual([
      {
        id: "p1",
        name: "gateway",
        directory: "/w/gateway",
        directories: ["/w/gateway"],
        stale: false,
        firstSeen: new Date(1000),
        lastSeen: new Date(2000),
      },
    ]);
  });

  it("merges versioned directories under the nominal name", () => {
    const out = groupProjects([
      row("p1", "/w/gateway"),
      row("p2", "/w/gateway_v2", false, 1500, 2500),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/w/gateway",
      directories: ["/w/gateway", "/w/gateway_v2"],
      stale: false,
    });
    expect(out[0].firstSeen.getTime()).toBe(1000);
    expect(out[0].lastSeen.getTime()).toBe(2500);
  });

  it("groups an isolated versioned directory under its nominal name", () => {
    const out = groupProjects([row("p2", "/w/gateway_v2", false, 1500, 2500)]);
    expect(out[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/w/gateway_v2",
      directories: ["/w/gateway_v2"],
    });
  });

  it("marks a group stale only when all members are stale", () => {
    const mixed = groupProjects([
      row("p1", "/w/gateway", false),
      row("p2", "/w/gateway_v2", true),
    ]);
    expect(mixed[0].stale).toBe(false);
    const allStale = groupProjects([
      row("p1", "/w/gateway", true),
      row("p2", "/w/gateway_v2", true),
    ]);
    expect(allStale[0].stale).toBe(true);
  });

  it("prefers a non-versioned member as the group directory", () => {
    const onlyVersioned = groupProjects([
      row("p2", "/w/gateway_v2"),
      row("p3", "/w/gateway_v3"),
    ]);
    expect(onlyVersioned[0].directory).toBe("/w/gateway_v2");
    const withBase = groupProjects([
      row("p2", "/w/gateway_v2"),
      row("p1", "/w/gateway"),
    ]);
    expect(withBase[0].directory).toBe("/w/gateway");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- project-groups` (workdir `api`)
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/projects/project-groups.ts`:

```ts
import { basename } from "node:path";
import { nominalId, nominalName } from "./nominal-name";

export interface ProjectRowLike {
  id: string;
  name: string;
  directory: string;
  stale: boolean;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ProjectGroupMeta {
  id: string;
  name: string;
  directory: string;
  directories: string[];
  stale: boolean;
  firstSeen: Date;
  lastSeen: Date;
}

export function groupProjects(rows: ProjectRowLike[]): ProjectGroupMeta[] {
  const byKey = new Map<string, ProjectRowLike[]>();
  for (const r of rows) {
    const key = nominalName(basename(r.directory));
    const members = byKey.get(key) ?? [];
    members.push(r);
    byKey.set(key, members);
  }
  return [...byKey.values()].map((members) => {
    const key = nominalName(basename(members[0].directory));
    const preferred = members.find((m) => basename(m.directory) === key);
    const grouped = members.length > 1 || !preferred;
    return {
      id: grouped ? nominalId(key) : members[0].id,
      name: key,
      directory: preferred?.directory ?? members[0].directory,
      directories: members.map((m) => m.directory),
      stale: members.every((m) => m.stale),
      firstSeen: new Date(Math.min(...members.map((m) => m.firstSeen.getTime()))),
      lastSeen: new Date(Math.max(...members.map((m) => m.lastSeen.getTime()))),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- project-groups` (workdir `api`)
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/projects/project-groups.ts api/src/projects/project-groups.spec.ts
git commit -m "feat(api): add groupProjects helper for nominal grouping"
```

---

### Task 3: Filtre multi-répertoires dans `OpenCodeReader`

**Files:**
- Modify: `api/src/opencode/opencode.types.ts:31-42` (SessionListFilters)
- Modify: `api/src/opencode/opencode-reader.ts:74-132` (listSessions where-building)
- Test: `api/src/opencode/opencode-reader.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `SessionListFilters.directories?: string[]` — filtre exact `s.directory IN (...)` dans `listSessions`. Rétrocompatible (les filtres `project` / `directory` existants restent).

- [ ] **Step 1: Write the failing tests**

Add to `api/src/opencode/opencode-reader.spec.ts`, inside `describe("OpenCodeReader")` after the existing `filters sessions by directory` test (around line 284):

```ts
it("filters sessions by a directories list", () => {
  const page = reader.listSessions({ directories: ["/home/user/gateway"] });
  expect(page.total).toBe(2);
});
```

Add inside `describe("multi-model fixture")` after the `aggregates by directory and model` test (around line 341):

```ts
it("filters sessions by multiple directories", () => {
  const page = reader.listSessions({
    directories: ["/home/user/gateway", "/home/user/api"],
  });
  expect(page.total).toBe(6); // gateway: g1, g1-sub, g2, g3 ; api: a1, a2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- opencode-reader` (workdir `api`)
Expected: FAIL — `directories` filter ignored (total returns 6 / 2 regardless).

- [ ] **Step 3: Write minimal implementation**

In `api/src/opencode/opencode.types.ts`, add to `SessionListFilters`:

```ts
  project?: string;
  directory?: string;
  directories?: string[];
```

In `api/src/opencode/opencode-reader.ts` `listSessions`, right after the existing `filters.directory` block (after line 90), add:

```ts
    if (filters.directories && filters.directories.length > 0) {
      const placeholders = filters.directories.map((_, i) => `@d${i}`).join(", ");
      where.push(`s.directory IN (${placeholders})`);
      filters.directories.forEach((d, i) => {
        params[`d${i}`] = d;
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- opencode-reader` (workdir `api`)
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add api/src/opencode/opencode.types.ts api/src/opencode/opencode-reader.ts api/src/opencode/opencode-reader.spec.ts
git commit -m "feat(api): support multi-directory filter in listSessions"
```

---

### Task 4: Regroupement dans `ProjectsService.list`

**Files:**
- Modify: `api/src/projects/projects.service.ts:16-75`
- Test: `api/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes: `groupProjects`, `ProjectGroupMeta` (Task 2).
- Produces: `list()` retourne un projet par groupe : `{ id, name, directory, directories, stale, firstSeen, lastSeen, sessionCount, totalCost, tokensInput, tokensOutput, durationMs }`, trié par `lastSeen` décroissant. Id réel pour les projets non groupés, `nominal:<name>` sinon.

- [ ] **Step 1: Update reader mock**

In `api/src/projects/projects.service.spec.ts`, extend `readerMock` so `listDirectories`, `aggregateByDirectory`, `timeByDirectory`, `aggregateByDirectoryAndModel` also cover `/home/user/gateway_v2`:

```ts
const readerMock = {
  listDirectories: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", firstSeen: 1000, lastSeen: 2000 },
    { directory: "/home/user/gateway_v2", firstSeen: 1500, lastSeen: 2500 },
  ]),
  aggregateByDirectory: jest.fn().mockReturnValue([
    {
      directory: "/home/user/gateway",
      name: "gateway",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
      firstSeen: 1000,
      lastSeen: 2000,
    },
    {
      directory: "/home/user/gateway_v2",
      name: "gateway_v2",
      totalCost: 3,
      tokensInput: 6,
      tokensOutput: 12,
      sessions: 1,
      firstSeen: 1500,
      lastSeen: 2500,
    },
  ]),
  aggregateByModel: jest.fn().mockReturnValue([
    {
      model: "deepseek-v4-flash",
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      sessions: 2,
    },
  ]),
  timeByDirectory: jest.fn().mockReturnValue([
    { directory: "/home/user/gateway", durationMs: 7200000 },
    { directory: "/home/user/gateway_v2", durationMs: 1800000 },
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
    {
      directory: "/home/user/gateway_v2",
      model: "deepseek-v4-flash",
      totalCost: 3,
      tokensInput: 6,
      tokensOutput: 12,
      sessions: 1,
    },
  ]),
};
```

Note: replace the existing `readerMock` object entirely (same shape as before, plus the v2 entries).

- [ ] **Step 2: Fix the existing `list` test for the second directory**

The existing test `list returns projects with live aggregates` now has 2 directories in `listDirectories`, so `syncProjects` performs 2 upserts (each consuming one mock result). Update its `mkChain` from `([projectRow], [], [projectRow])` to `([projectRow], [], [], [projectRow])`:

```ts
    const db = mkChain(
      [projectRow], // syncProjects: existing select
      [], // syncProjects: upsert gateway
      [], // syncProjects: upsert gateway_v2
      [projectRow], // list select
    );
```

- [ ] **Step 3: Write the failing test**

Add to `api/src/projects/projects.service.spec.ts`, in `describe("ProjectsService")`:

```ts
it("list groups versioned directories under the nominal name", async () => {
  const gateway = {
    id: "p1",
    name: "gateway",
    directory: "/home/user/gateway",
    stale: false,
    firstSeen: new Date(1000),
    lastSeen: new Date(2000),
  };
  const gatewayV2 = {
    id: "p2",
    name: "gateway_v2",
    directory: "/home/user/gateway_v2",
    stale: false,
    firstSeen: new Date(1500),
    lastSeen: new Date(2500),
  };
  const db = mkChain(
    [], // syncProjects: existing select
    [], // syncProjects: upsert gateway
    [], // syncProjects: upsert gateway_v2
    [gateway, gatewayV2], // list select
  );
  const svc = new ProjectsService(db as any, readerMock as any);
  const rows = await svc.list();
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("nominal:gateway");
  expect(rows[0].name).toBe("gateway");
  expect(rows[0].directory).toBe("/home/user/gateway");
  expect(rows[0].directories).toEqual([
    "/home/user/gateway",
    "/home/user/gateway_v2",
  ]);
  expect(rows[0].sessionCount).toBe(3);
  expect(rows[0].totalCost).toBe(8);
  expect(rows[0].durationMs).toBe(9000000);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test -- projects.service` (workdir `api`)
Expected: FAIL — `list` still returns 2 rows.

- [ ] **Step 5: Write minimal implementation**

In `api/src/projects/projects.service.ts`:

Add import (top of file):

```ts
import { groupProjects } from "./project-groups";
```

Replace the body of `list()` (currently lines 53-75):

```ts
  async list() {
    await this.syncProjects();
    const rows = await this.db.select().from(projects).orderBy(desc(projects.lastSeen));
    const agg = this.reader.aggregateByDirectory({});
    const byDir = new Map(agg.map((a) => [a.directory, a]));
    const times = new Map(this.reader.timeByDirectory({}).map((t) => [t.directory, t.durationMs]));
    return groupProjects(rows)
      .map((g) => {
        let sessionCount = 0;
        let totalCost = 0;
        let tokensInput = 0;
        let tokensOutput = 0;
        let durationMs = 0;
        for (const d of g.directories) {
          const a = byDir.get(d);
          sessionCount += a?.sessions ?? 0;
          totalCost += a?.totalCost ?? 0;
          tokensInput += a?.tokensInput ?? 0;
          tokensOutput += a?.tokensOutput ?? 0;
          durationMs += times.get(d) ?? 0;
        }
        return { ...g, sessionCount, totalCost, tokensInput, tokensOutput, durationMs };
      })
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- projects.service` (workdir `api`)
Expected: PASS — existing `list` test (single `gateway`, id stays `p1`) + new grouping test.

- [ ] **Step 7: Commit**

```bash
git add api/src/projects/projects.service.ts api/src/projects/projects.service.spec.ts
git commit -m "feat(api): group versioned projects in projects list"
```

---

### Task 5: Regroupement dans `ProjectsService.findOne`

**Files:**
- Modify: `api/src/projects/projects.service.ts:77-127`
- Test: `api/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes: `nominalFromId`, `nominalName`, `basename`, `groupProjects`, `ProjectGroupMeta` (Tasks 1-2).
- Produces: `findOne(id)` accepte un id réel **ou** synthétique `nominal:<name>` :
  - id synthétique → groupe correspondant (features/propositions des **tous** les membres, `byModel` sommé, `ungroupedSessions` recalculé, `id` = id du groupe, `directories` listé).
  - id réel d'un membre → groupe contenant ce membre.
  - inconnu → `NotFoundException`.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/projects/projects.service.spec.ts`:

```ts
it("findOne resolves a synthetic id and merges members", async () => {
  const rows = [
    {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    },
    {
      id: "p2",
      name: "gateway_v2",
      directory: "/home/user/gateway_v2",
      stale: false,
      firstSeen: new Date(1500),
      lastSeen: new Date(2500),
    },
  ];
  const db = mkChain(
    rows, // resolveGroup select-all
    [{ id: "f1", name: "Auth" }, { id: "f2", name: "Deploy" }], // features (inArray both ids)
    [{ id: "pr1", name: "Auth", status: "pending", sessionIds: ["s1"] }], // proposals
    [{ sessionId: "s1" }], // featureSessions (linkedCount)
  );
  const svc = new ProjectsService(db as any, readerMock as any);
  const detail = await svc.findOne("nominal:gateway");
  expect(detail.id).toBe("nominal:gateway");
  expect(detail.name).toBe("gateway");
  expect(detail.directories).toEqual(["/home/user/gateway", "/home/user/gateway_v2"]);
  expect(detail.features.map((f: any) => f.id)).toEqual(["f1", "f2"]);
  expect(detail.sessionCount).toBe(3);
  expect(detail.byModel).toEqual([
    { model: "deepseek-v4-flash", totalCost: 8, sessions: 3 },
  ]);
});

it("findOne throws NotFoundException for an unknown synthetic id", async () => {
  const db = mkChain([
    {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    },
  ]);
  const svc = new ProjectsService(db as any, readerMock as any);
  await expect(svc.findOne("nominal:inconnu")).rejects.toThrow("Project not found");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- projects.service` (workdir `api`)
Expected: FAIL — `findOne("nominal:gateway")` throws (id not found in `where eq(id)`).

- [ ] **Step 3: Write minimal implementation**

In `api/src/projects/projects.service.ts`:

Add imports (top of file):

```ts
import { basename } from "node:path";
import { nominalFromId, nominalName } from "./nominal-name";
import { groupProjects, ProjectGroupMeta } from "./project-groups";
```

Add a `ProjectRow` type alias after imports:

```ts
type ProjectRow = typeof projects.$inferSelect;
```

Replace the body of `findOne(id)` (lines 77-127):

```ts
  async findOne(id: string) {
    const all = await this.db.select().from(projects);
    const group = this.resolveGroup(id, all);
    if (!group) throw new NotFoundException("Project not found");

    const agg = this.reader.aggregateByDirectory({});
    const memberAgg = group.meta.directories
      .map((d) => agg.find((x) => x.directory === d))
      .filter((x): x is DirectoryAggregate => Boolean(x));
    const sessions = memberAgg.reduce((n, a) => n + a.sessions, 0);
    const totalCost = memberAgg.reduce((n, a) => n + a.totalCost, 0);
    const tokensInput = memberAgg.reduce((n, a) => n + a.tokensInput, 0);
    const tokensOutput = memberAgg.reduce((n, a) => n + a.tokensOutput, 0);

    const byModel = new Map<
      string,
      { model: string; totalCost: number; sessions: number }
    >();
    for (const m of this.reader.aggregateByDirectoryAndModel({})) {
      if (!group.meta.directories.includes(m.directory)) continue;
      const cur = byModel.get(m.model);
      if (cur) {
        cur.totalCost += m.totalCost;
        cur.sessions += m.sessions;
      } else {
        byModel.set(m.model, {
          model: m.model,
          totalCost: m.totalCost,
          sessions: m.sessions,
        });
      }
    }
    const sortedByModel = [...byModel.values()].sort((a, b) => b.totalCost - a.totalCost);

    const memberIds = group.rows.map((r) => r.id);
    const featRows = await this.db
      .select()
      .from(features)
      .where(inArray(features.projectId, memberIds))
      .orderBy(desc(features.updatedAt));
    const propRows = await this.db
      .select()
      .from(featureProposals)
      .where(inArray(featureProposals.projectId, memberIds))
      .orderBy(desc(featureProposals.createdAt));
    const linkedCount =
      featRows.length === 0
        ? 0
        : (
            await this.db
              .select({ sessionId: featureSessions.sessionId })
              .from(featureSessions)
              .where(inArray(featureSessions.featureId, featRows.map((f) => f.id)))
          ).length;
    const proposedCount = propRows
      .filter((p) => p.status === "pending")
      .reduce((n, p) => n + p.sessionIds.length, 0);
    return {
      id: group.meta.id,
      name: group.meta.name,
      directory: group.meta.directory,
      directories: group.meta.directories,
      stale: group.meta.stale,
      firstSeen: group.meta.firstSeen,
      lastSeen: group.meta.lastSeen,
      sessionCount: sessions,
      totalCost,
      tokensInput,
      tokensOutput,
      ungroupedSessions: Math.max(0, sessions - linkedCount - proposedCount),
      byModel: sortedByModel,
      features: featRows,
      proposals: propRows,
    };
  }

  private resolveGroup(
    id: string,
    all: ProjectRow[],
  ): { meta: ProjectGroupMeta; rows: ProjectRow[] } | null {
    const groups = groupProjects(all);
    const nominal = nominalFromId(id);
    let meta: ProjectGroupMeta | undefined;
    if (nominal !== null) {
      meta = groups.find((g) => g.id === id);
    } else {
      const row = all.find((r) => r.id === id);
      if (!row) return null;
      const key = nominalName(basename(row.directory));
      meta = groups.find((g) => g.name === key);
    }
    if (!meta) return null;
    return { meta, rows: all.filter((r) => meta.directories.includes(r.directory)) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- projects.service` (workdir `api`)
Expected: PASS — existing `findOne` test (real id `p1`, `byModel` shape unchanged) + 2 new.

- [ ] **Step 5: Commit**

```bash
git add api/src/projects/projects.service.ts api/src/projects/projects.service.spec.ts
git commit -m "feat(api): resolve grouped projects in project detail"
```

---

### Task 6: Regroupement dans `SessionsService` (`list` + `meta`)

**Files:**
- Modify: `api/src/sessions/sessions.service.ts:42-74` et `:106-112`
- Test: `api/src/sessions/sessions.service.spec.ts`

**Interfaces:**
- Consumes: `nominalFromId`, `nominalName`, `basename`, `groupProjects` (Tasks 1-2), `SessionListFilters.directories` (Task 3).
- Produces:
  - `list({ projectId })` : id synthétique → `filters.directories` = répertoires membres ; id réel → `filters.directory` (comportement actuel).
  - `meta()` : `projects` = `[{ id, name }]` par **groupe** (id réel si non groupé, `nominal:<name>` sinon).

- [ ] **Step 1: Write the failing tests**

In `api/src/sessions/sessions.service.spec.ts`, replace the existing `meta` test (lines 74-80) with an updated version (mock rows now need full fields for `groupProjects`) and add two new tests:

```ts
it("meta returns grouped projects with synthetic ids", async () => {
  const db = mkDb([
    {
      id: "p1",
      name: "gateway",
      directory: "/p/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    },
    {
      id: "p2",
      name: "gateway_v2",
      directory: "/p/gateway_v2",
      stale: false,
      firstSeen: new Date(1500),
      lastSeen: new Date(2500),
    },
  ]);
  const svc = new SessionsService(readerMock as any, db as any);
  const meta = await svc.meta();
  expect(meta.projects).toEqual([{ id: "nominal:gateway", name: "gateway" }]);
  expect(meta.models).toEqual(["deepseek-v4-flash"]);
});

it("list resolves a synthetic projectId to member directories", async () => {
  const db = mkDb(
    [
      { id: "p1", directory: "/p/gateway" },
      { id: "p2", directory: "/p/gateway_v2" },
    ], // resolve select-all
    [], // annotatedMap
    [], // analysisMap
    [
      { id: "p1", directory: "/p/gateway" },
      { id: "p2", directory: "/p/gateway_v2" },
    ], // byDir
  );
  const svc = new SessionsService(readerMock as any, db as any);
  await svc.list({ projectId: "nominal:gateway" });
  expect(readerMock.listSessions).toHaveBeenCalledWith(
    expect.objectContaining({ directories: ["/p/gateway", "/p/gateway_v2"] }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- sessions.service` (workdir `api`)
Expected: FAIL — `meta`/`list` not grouped.

- [ ] **Step 3: Write minimal implementation**

In `api/src/sessions/sessions.service.ts`:

Add imports:

```ts
import { basename } from "node:path";
import { nominalFromId, nominalName } from "../projects/nominal-name";
import { groupProjects } from "../projects/project-groups";
```

Replace the projectId resolution block in `list()` (lines 43-50):

```ts
    if (filters.projectId) {
      const nominal = nominalFromId(filters.projectId);
      if (nominal !== null) {
        const all = await this.db.select().from(projects);
        const dirs = all
          .filter((r) => nominalName(basename(r.directory)) === nominal)
          .map((r) => r.directory);
        if (dirs.length > 0) filters.directories = dirs;
      } else {
        const p = await this.db
          .select()
          .from(projects)
          .where(eq(projects.id, filters.projectId))
          .then((r) => r[0]);
        filters.directory = p?.directory ?? filters.directory;
      }
    }
```

Replace `meta()` (lines 106-112):

```ts
  async meta() {
    const rows = await this.db.select().from(projects).where(eq(projects.stale, false));
    return {
      projects: groupProjects(rows).map((g) => ({ id: g.id, name: g.name })),
      models: this.reader.listModels(),
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- sessions.service` (workdir `api`)
Expected: PASS — existing tests (real-id path unchanged) + 2 new.

- [ ] **Step 5: Commit**

```bash
git add api/src/sessions/sessions.service.ts api/src/sessions/sessions.service.spec.ts
git commit -m "feat(api): group versioned projects in sessions list and meta"
```

---

### Task 7: Regroupement dans `DashboardService.summary`

**Files:**
- Modify: `api/src/dashboard/dashboard.service.ts:15-60`
- Test: `api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Consumes: `nominalName`, `nominalId`, `basename`, `groupProjects` (Tasks 1-2).
- Produces: `summary().byProject` et `.timeByProject` groupés par nom nominal ; `byProject[].models` = modèles **sommés par modèle** avec `share` recalculé (sans champ `directory` par modèle) ; `id` = id du groupe (réel si non groupé, `nominal:<name>` sinon).

- [ ] **Step 1: Write the failing tests**

Replace the body of the existing `summary aggregates...` test's assertions so they match the new model shape, and add a grouped test. The updated spec file section:

```ts
  it("summary aggregates live metrics plus analysed/feature counts", async () => {
    const db = mkDb(
      [{ c: 3 }], // analysed count
      [{ c: 5 }], // feature count
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/p/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
      ], // projects (full rows)
    );
    const svc = new DashboardService(readerMock as any, db as any);
    const out = await svc.summary(7);
    expect(out.totalCost).toBe(10);
    expect(out.sessionCount).toBe(4);
    expect(out.analysedCount).toBe(3);
    expect(out.featureCount).toBe(5);
    expect(out.byProject[0].name).toBe("gateway");
    expect(out.byProject[0].id).toBe("p1");
    expect(out.byProject[0].models).toEqual([
      {
        model: "deepseek-v4-flash",
        totalCost: 6,
        tokensInput: 5,
        tokensOutput: 5,
        sessions: 1,
        share: 0.5,
      },
      {
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
  });

  it("summary groups versioned projects under the nominal name", async () => {
    const readerMock2 = {
      ...readerMock,
      aggregateByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/gateway", name: "gateway", totalCost: 10, sessions: 2 },
        { directory: "/p/gateway_v2", name: "gateway_v2", totalCost: 5, sessions: 1 },
      ]),
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
          directory: "/p/gateway_v2",
          model: "deepseek-v4-flash",
          totalCost: 5,
          tokensInput: 4,
          tokensOutput: 4,
          sessions: 1,
        },
      ]),
      timeByDirectory: jest.fn().mockReturnValue([
        { directory: "/p/gateway", durationMs: 3600000 },
        { directory: "/p/gateway_v2", durationMs: 1800000 },
      ]),
    };
    const db = mkDb(
      [{ c: 0 }],
      [{ c: 0 }],
      [
        {
          id: "p1",
          name: "gateway",
          directory: "/p/gateway",
          stale: false,
          firstSeen: new Date(1000),
          lastSeen: new Date(2000),
        },
        {
          id: "p2",
          name: "gateway_v2",
          directory: "/p/gateway_v2",
          stale: false,
          firstSeen: new Date(1500),
          lastSeen: new Date(2500),
        },
      ],
    );
    const svc = new DashboardService(readerMock2 as any, db as any);
    const out = await svc.summary(7);
    expect(out.byProject).toHaveLength(1);
    expect(out.byProject[0]).toMatchObject({
      id: "nominal:gateway",
      name: "gateway",
      directory: "/p/gateway",
      totalCost: 15,
      sessions: 3,
    });
    expect(out.byProject[0].models).toEqual([
      {
        model: "deepseek-v4-flash",
        totalCost: 11,
        tokensInput: 9,
        tokensOutput: 9,
        sessions: 2,
        share: 2 / 3,
      },
    ]);
    expect(out.timeByProject).toEqual([
      { directory: "/p/gateway", name: "gateway", durationMs: 5400000, id: "nominal:gateway" },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- dashboard.service` (workdir `api`)
Expected: FAIL — second test: `byProject` has 2 entries, no grouping.

- [ ] **Step 3: Write minimal implementation**

Replace the whole `summary()` in `api/src/dashboard/dashboard.service.ts`:

```ts
  async summary(periodDays = 7) {
    const from = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const all = this.reader.aggregateAll({ from });
    const [analysedCount, featureCount, projectRows] = await Promise.all([
      this.db
        .select({ c: count() })
        .from(sessionAnalyses)
        .where(sql`status = 'done'`)
        .then((r) => Number(r[0]?.c ?? 0)),
      this.db
        .select({ c: count() })
        .from(features)
        .then((r) => Number(r[0]?.c ?? 0)),
      this.db.select().from(projects),
    ]);
    const groups = groupProjects(projectRows);
    const dirToGroup = new Map<string, ProjectGroupMeta>();
    for (const g of groups) {
      for (const d of g.directories) dirToGroup.set(d, g);
    }
    const fallback = (directory: string): ProjectGroupMeta => {
      const key = nominalName(basename(directory));
      return {
        id: nominalId(key),
        name: key,
        directory,
        directories: [directory],
        stale: false,
        firstSeen: new Date(0),
        lastSeen: new Date(0),
      };
    };

    const modelRows = this.reader.aggregateByDirectoryAndModel({ from });
    const timeRows = this.reader.timeByDirectory({ from });

    const byProject = new Map<
      string,
      {
        id: string;
        name: string;
        directory: string;
        totalCost: number;
        tokensInput: number;
        tokensOutput: number;
        sessions: number;
      }
    >();
    for (const a of this.reader.aggregateByDirectory({ from })) {
      const g = dirToGroup.get(a.directory) ?? fallback(a.directory);
      const cur = byProject.get(g.name) ?? {
        id: g.id,
        name: g.name,
        directory: g.directory,
        totalCost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        sessions: 0,
      };
      cur.totalCost += a.totalCost;
      cur.tokensInput += a.tokensInput;
      cur.tokensOutput += a.tokensOutput;
      cur.sessions += a.sessions;
      byProject.set(g.name, cur);
    }

    const modelsByProject = new Map<
      string,
      Map<string, { model: string; totalCost: number; tokensInput: number; tokensOutput: number; sessions: number }>
    >();
    for (const m of modelRows) {
      const g = dirToGroup.get(m.directory) ?? fallback(m.directory);
      const map = modelsByProject.get(g.name) ?? new Map();
      const cur = map.get(m.model);
      if (cur) {
        cur.totalCost += m.totalCost;
        cur.tokensInput += m.tokensInput;
        cur.tokensOutput += m.tokensOutput;
        cur.sessions += m.sessions;
      } else {
        map.set(m.model, {
          model: m.model,
          totalCost: m.totalCost,
          tokensInput: m.tokensInput,
          tokensOutput: m.tokensOutput,
          sessions: m.sessions,
        });
      }
      modelsByProject.set(g.name, map);
    }

    const timeByProject = new Map<
      string,
      { directory: string; name: string; durationMs: number; id: string }
    >();
    for (const t of timeRows) {
      const g = dirToGroup.get(t.directory) ?? fallback(t.directory);
      const cur = timeByProject.get(g.name);
      if (cur) cur.durationMs += t.durationMs;
      else
        timeByProject.set(g.name, {
          directory: g.directory,
          name: g.name,
          durationMs: t.durationMs,
          id: g.id,
        });
    }

    return {
      periodDays,
      ...all,
      sessionCount: all.sessions,
      analysedCount,
      featureCount,
      byProject: [...byProject.values()]
        .map((p) => ({
          ...p,
          models: [...(modelsByProject.get(p.name)?.values() ?? [])]
            .map((m) => ({ ...m, share: p.sessions > 0 ? m.sessions / p.sessions : 0 }))
            .sort((x, y) => y.sessions - x.sessions),
        }))
        .sort((a, b) => b.totalCost - a.totalCost),
      byModel: this.reader.aggregateByModel({ from }),
      byDay: this.reader.aggregateByDay({ from }),
      timeByProject: [...timeByProject.values()].sort(
        (a, b) => b.durationMs - a.durationMs,
      ),
    };
  }
```

Add imports (top of file):

```ts
import { basename } from "node:path";
import { nominalId, nominalName } from "../projects/nominal-name";
import { groupProjects, ProjectGroupMeta } from "../projects/project-groups";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- dashboard.service` (workdir `api`)
Expected: PASS — both dashboard tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/dashboard/dashboard.service.ts api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat(api): group versioned projects in dashboard summary"
```

---

### Task 8: Webapp — affichage des répertoires membres

**Files:**
- Modify: `webapp/src/store/projects.ts:1-13` (ProjectRow)
- Modify: `webapp/src/views/ProjectsView.tsx:35-37`
- Test: `webapp/src/views/ProjectsView.spec.tsx`

**Interfaces:**
- Consumes: API `GET /api/projects` renvoie désormais `directories?: string[]` sur chaque projet.
- Produces: `ProjectRow.directories?: string[]` ; la carte affiche les répertoires membres supplémentaires quand il y en a plus d'un.

- [ ] **Step 1: Write the failing test**

In `webapp/src/views/ProjectsView.spec.tsx`, add:

```tsx
it("renders grouped projects with their member directories", () => {
  const store = configureStore({
    reducer: { projects: projectsReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      projects: {
        items: [
          {
            id: "nominal:gateway",
            name: "gateway",
            directory: "/home/user/gateway",
            directories: ["/home/user/gateway", "/home/user/gateway_v2"],
            stale: false,
            firstSeen: "2026-08-01T00:00:00.000Z",
            lastSeen: "2026-08-31T00:00:00.000Z",
            sessionCount: 3,
            totalCost: 8,
            tokensInput: 160,
            tokensOutput: 320,
            durationMs: 9000000,
          },
        ],
        current: null,
        loading: false,
        error: null,
      },
    },
  });
  const html = renderToStaticMarkup(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/projects"]}>
        <ProjectsView />
      </MemoryRouter>
    </Provider>,
  );
  expect(html).toContain("/home/user/gateway");
  expect(html).toContain("/home/user/gateway_v2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ProjectsView` (workdir `webapp`)
Expected: FAIL — `directories` type unknown + `gateway_v2` not rendered.

- [ ] **Step 3: Write minimal implementation**

In `webapp/src/store/projects.ts`, add to `ProjectRow`:

```ts
  directories?: string[];
```

In `webapp/src/views/ProjectsView.tsx`, replace the subtitle block (lines 35-37):

```tsx
                <div className="mt-1 truncate text-sm text-gray-500" title={p.directory}>
                  {p.directory}
                  {p.directories && p.directories.length > 1 && (
                    <span> · {p.directories.slice(1).join(" · ")}</span>
                  )}
                </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ProjectsView` (workdir `webapp`)
Expected: PASS — existing test + new.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/store/projects.ts webapp/src/views/ProjectsView.tsx webapp/src/views/ProjectsView.spec.tsx
git commit -m "feat(webapp): show member directories for grouped projects"
```

---

### Task 9: Vérification complète

- [ ] **Step 1: Run API tests + typecheck**

Run: `pnpm test` puis `pnpm typecheck` (workdir `api`)
Expected: PASS, pas de nouvelle erreur TS.

- [ ] **Step 2: Run webapp tests + typecheck**

Run: `pnpm test` puis `pnpm typecheck` (workdir `webapp`)
Expected: PASS, pas de nouvelle erreur TS.

- [ ] **Step 3: Sanity check of the running behavior (optional)**

If a dev server / API is running against a real OpenCode DB containing versioned directories (ex. `/home/riko/workspace/infrastructure_v2`), call `GET /api/projects` and confirm one row per nominal name with `directories` populated.

- [ ] **Step 4: Commit any leftover fixes**

```bash
git add -A
git commit -m "chore: verification pass for versioned project grouping"
```

## Hors périmètre (rappel)

- Aucune migration de schéma, aucune fusion physique en base.
- `syncProjects()` inchangé.
- Pas de changement de routage webapp.
- Pas de changement d'affichage du dashboard webapp (la forme serveur de `byProject[].models` change seulement : suppression du champ `directory` par modèle).