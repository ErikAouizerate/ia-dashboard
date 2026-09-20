# Reader multi-source & dimension source — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire lire les sessions host **et** VM par tous les services de l'API via un reader composite unique, et exposer la dimension `source` sur les agrégats, sans modifier l'UI.

**Architecture:** Une interface `SessionReader` extraite de la surface publique d'`OpenCodeReader`. `OpenCodeReader` l'implémente (host ou VM) et enrichit chaque agrégat d'un `bySource`. `MultiSourceReader` (ex-`SessionSources`) implémente la même interface, route les lookups par id vers la source propriétaire et fusionne les agrégats en concaténant les `bySource`. Le provider Nest `OPENCODE_READER` fournit `MultiSourceReader` ; les services consommateurs ne changent pas de logique.

**Tech Stack:** TypeScript, NestJS 11, better-sqlite3, Jest (ts-jest), pnpm.

## Global Constraints

- Gestionnaire de paquets : **pnpm** (`packageManager: pnpm@11.18.0`). Jamais npm/yarn.
- Tests API : depuis la racine, `pnpm --filter @ia-dashboard/api test -- <motif>` ; typecheck : `pnpm --filter @ia-dashboard/api typecheck`.
- Langue : libellés/commentaires du projet en anglais dans le code API ; specs/plans en français.
- **Aucun commentaire ajouté** dans le code, sauf les `ponytail:` explicitement demandés par le spec.
- Commits fréquents, un par tâche, message conventionnel (`fix(api):`, `feat(api):`, `refactor(api):`).
- Spec de référence : `docs/superpowers/specs/2026-09-20-reader-multi-source-design.md`.

## Structure des fichiers

- `api/src/opencode/opencode.types.ts` — `SourceAggregate`, `SessionReader`, champs `bySource`.
- `api/src/opencode/opencode-reader.ts` — `implements SessionReader`, remplit `bySource`.
- `api/src/opencode/multi-source-reader.ts` — **nouveau** (remplace `session-sources.ts`).
- `api/src/opencode/multi-source-reader.spec.ts` — **nouveau** (remplace `session-sources.spec.ts`).
- `api/src/opencode/opencode.module.ts` — provider `OPENCODE_READER` = `MultiSourceReader`.
- `api/src/sessions/sessions.service.ts` (+ `.spec.ts`) — simplifié.
- `api/src/dashboard/dashboard.service.ts` (+ `.spec.ts`) — type `SessionReader` + `bySource`.
- `api/src/projects/projects.service.ts` (+ `.spec.ts`) — type `SessionReader` + `bySource`.
- `api/src/features/features.service.ts`, `api/src/analysis/analysis.service.ts`, `api/src/health/health.controller.ts` — type `SessionReader`.

---

### Task 1: `SessionReader`, `SourceAggregate` et `bySource` dans `OpenCodeReader`

**Files:**
- Modify: `api/src/opencode/opencode.types.ts`
- Modify: `api/src/opencode/opencode-reader.ts`
- Test: `api/src/opencode/opencode-reader.spec.ts:395-404`

**Interfaces:**
- Consumes: rien (types existants).
- Produces: `interface SessionReader` (contrat public complet), `interface SourceAggregate { source; totalCost; tokensInput; tokensOutput; sessions }`, `SessionAggregate.bySource: SourceAggregate[]`, `DirectoryTimeAggregate.bySource: { source: string; durationMs: number }[]`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `api/src/opencode/opencode-reader.spec.ts`, remplacer le test `"aggregates by directory and model"` (lignes 395-404) par :

```ts
  it("aggregates by directory and model", () => {
    const byDir = reader.aggregateByDirectory({});
    expect(byDir[0].name).toBe("gateway");
    expect(byDir[0].totalCost).toBeCloseTo(1.65);
    expect(byDir[0].sessions).toBe(2);
    expect(byDir[0].bySource).toEqual([
      {
        source: "host",
        totalCost: byDir[0].totalCost,
        tokensInput: byDir[0].tokensInput,
        tokensOutput: byDir[0].tokensOutput,
        sessions: byDir[0].sessions,
      },
    ]);
    const byModel = reader.aggregateByModel({});
    expect(byModel[0].model).toBe("deepseek-v4-flash-free");
    const all = reader.aggregateAll({});
    expect(all.sessions).toBe(2);
    expect(all.bySource).toHaveLength(1);
    expect(all.bySource[0].source).toBe("host");
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader`
Expected: FAIL — `byDir[0].bySource` est `undefined`.

- [ ] **Step 3: Ajouter les types et l'interface**

Dans `api/src/opencode/opencode.types.ts`, remplacer le bloc `SessionAggregate` (lignes 66-96) par :

```ts
export interface SourceAggregate {
  source: string;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessions: number;
}

export interface SessionAggregate {
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessions: number;
  bySource: SourceAggregate[];
}

export interface DirectoryAggregate extends SessionAggregate {
  directory: string;
  name: string;
  firstSeen: number;
  lastSeen: number;
}

export interface DirectoryModelAggregate extends SessionAggregate {
  directory: string;
  model: string;
}

export interface DirectoryTimeAggregate {
  directory: string;
  durationMs: number;
  bySource: { source: string; durationMs: number }[];
}

export interface ModelAggregate extends SessionAggregate {
  model: string;
}

export interface DayAggregate extends SessionAggregate {
  day: string;
}
```

Puis, à la fin de `opencode.types.ts` (avant `OpendbNotFoundError`), ajouter l'interface :

```ts
export interface SessionReader {
  readonly source: string;
  open(): void;
  close(): void;
  listSessions(filters?: SessionListFilters): SessionPage;
  getSession(id: string): OpenCodeSession | null;
  listProjects(): OpenCodeProject[];
  listModels(): string[];
  getSubagentIds(parentId: string): string[];
  getSessionTree(id: string): string[];
  getSessionCalls(ids: string[]): SessionCall[];
  getSessionSteps(ids: string[]): SessionStep[];
  getSessionToolUsage(ids: string[]): ToolUsage[];
  listDirectories(): { directory: string; firstSeen: number; lastSeen: number }[];
  getSessionAnalysisInput(id: string): SessionAnalysisInput | null;
  listParentSessions(options?: { from?: number }): OpenCodeSession[];
  aggregateAll(options?: { from?: number }): SessionAggregate;
  aggregateByDirectory(options?: { from?: number }): DirectoryAggregate[];
  aggregateByDirectoryAndModel(options?: { from?: number }): DirectoryModelAggregate[];
  aggregateByModel(options?: { from?: number }): ModelAggregate[];
  aggregateByDay(options?: { from?: number }): DayAggregate[];
  timeByDirectory(options?: { from?: number }): DirectoryTimeAggregate[];
}
```

- [ ] **Step 4: Implémenter `bySource` et `implements` dans `OpenCodeReader`**

Dans `api/src/opencode/opencode-reader.ts` :

a. Ajouter `SourceAggregate` et `SessionReader` à l'import depuis `./opencode.types`, et changer la déclaration de classe :

```ts
export class OpenCodeReader implements SessionReader {
```

b. Ajouter un helper privé juste après le constructeur (après la ligne 64) :

```ts
  private sourceEntry(r: Omit<SourceAggregate, "source">): SourceAggregate[] {
    return [{ source: this.source, ...r }];
  }
```

c. Remplacer la méthode `aggregate` (lignes 376-388) par :

```ts
  private aggregate(from: number): SessionAggregate {
    const db = this.requireDb();
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(cost),0) AS totalCost,
                COALESCE(SUM(tokens_input),0) AS tokensInput,
                COALESCE(SUM(tokens_output),0) AS tokensOutput,
                COUNT(*) AS sessions
         FROM session WHERE time_created >= @from`,
      )
      .get({ from }) as Omit<SessionAggregate, "bySource">;
    return { ...r, bySource: this.sourceEntry(r) };
  }
```

d. `aggregateByDirectory` — remplacer le cast et le `return` :

```ts
      .all({ from }) as Omit<DirectoryAggregate, "name" | "bySource">[];
    return rows.map((r) => ({
      ...r,
      name: basename(r.directory),
      bySource: this.sourceEntry(r),
    }));
```

e. `aggregateByDirectoryAndModel` — remplacer la ligne de type `const out: DirectoryModelAggregate[] = [];` par `const out: Omit<DirectoryModelAggregate, "bySource">[] = [];` et le `return out.sort((a, b) => b.totalCost - a.totalCost);` final par :

```ts
    return out
      .sort((a, b) => b.totalCost - a.totalCost)
      .map((r) => ({ ...r, bySource: this.sourceEntry(r) }));
```

f. `aggregateByModel` — remplacer `const out: ModelAggregate[] = [];` par `const out: Omit<ModelAggregate, "bySource">[] = [];` et le `return out.sort((a, b) => b.totalCost - a.totalCost);` final par :

```ts
    return out
      .sort((a, b) => b.totalCost - a.totalCost)
      .map((r) => ({ ...r, bySource: this.sourceEntry(r) }));
```

g. `aggregateByDay` — remplacer `const map = new Map<string, DayAggregate>();` par `const map = new Map<string, Omit<DayAggregate, "bySource">>();` et le `return [...map.values()].sort(...)` final par :

```ts
    return [...map.values()]
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((r) => ({ ...r, bySource: this.sourceEntry(r) }));
```

h. `timeByDirectory` — remplacer le `return [...byDir.entries()]...` final par :

```ts
    return [...byDir.entries()]
      .map(([directory, durationMs]) => ({
        directory,
        durationMs,
        bySource: [{ source: this.source, durationMs }],
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
```

- [ ] **Step 5: Lancer les tests reader**

Run: `pnpm --filter @ia-dashboard/api test -- opencode-reader`
Expected: PASS (tous les tests du fichier).

- [ ] **Step 6: Commit**

```bash
git add api/src/opencode/opencode.types.ts api/src/opencode/opencode-reader.ts api/src/opencode/opencode-reader.spec.ts
git commit -m "feat(api): add SessionReader contract and bySource on aggregates"
```

---

### Task 2: `MultiSourceReader`

**Files:**
- Create: `api/src/opencode/multi-source-reader.ts`
- Delete: `api/src/opencode/session-sources.ts`
- Create: `api/src/opencode/multi-source-reader.spec.ts`
- Delete: `api/src/opencode/session-sources.spec.ts`
- Modify: `api/src/opencode/opencode.module.ts`
- Modify: `api/src/sessions/sessions.service.ts`
- Test: `api/src/sessions/sessions.service.spec.ts`

**Interfaces:**
- Consumes: `SessionReader`, `SourceAggregate`, `OpenCodeReader`.
- Produces: `class MultiSourceReader implements SessionReader` avec en plus `capture(sessionId: string): SessionConfigSnapshot | null`, exportée depuis `./multi-source-reader`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `api/src/opencode/multi-source-reader.spec.ts` (reprend l'ancien spec, renommé) :

```ts
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MultiSourceReader } from "./multi-source-reader";

function seedDb(path: string, sessionId: string, timeUpdated: number, title: string) {
  const db = new Database(path);
  db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, path TEXT,
      title TEXT, model TEXT, agent TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, priority TEXT, position INTEGER, time_created INTEGER, time_updated INTEGER);`);
  db.prepare("INSERT INTO project VALUES (?,?,?)").run("proj1", "/w/app", null);
  db.prepare(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    sessionId,
    "proj1",
    null,
    "/w/app",
    null,
    title,
    '{"id":"m"}',
    "build",
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    timeUpdated - 100,
    timeUpdated,
    null,
  );
  db.close();
}

function setup() {
  const hostDir = mkdtempSync(join(tmpdir(), "host-"));
  const hostDb = join(hostDir, "opencode.db");
  seedDb(hostDb, "h1", 1000, "host-session");

  const store = mkdtempSync(join(tmpdir(), "store-"));
  const gen = join(store, "devbox-abc");
  mkdirSync(gen, { recursive: true });
  seedDb(join(gen, "opencode.db"), "v1", 2000, "vm-session");
  writeFileSync(
    join(gen, "captures.jsonl"),
    JSON.stringify({
      sessionId: "v1",
      profile: "muse-spark",
      agent: "build",
      model: { modelID: "m" },
      configId: "cid1",
      at: 1,
    }) + "\n",
  );
  writeFileSync(join(gen, "configs.json"), JSON.stringify({ id: "cid1", config: { model: "m" } }) + "\n");

  return { hostDb, store };
}

test("lists host and vm sessions with their source, dedup by id keeping newest", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  const page = sources.listSessions({});
  const byId = Object.fromEntries(page.items.map((s) => [s.id, s]));
  expect(byId.h1.source).toBe("host");
  expect(byId.v1.source).toBe("vm:devbox-abc");
  expect(page.items[0].id).toBe("v1");
});

test("resolves a session's captured config", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  expect(sources.getSession("v1")?.source).toBe("vm:devbox-abc");
  expect(sources.capture("v1")?.profile).toBe("muse-spark");
  expect(sources.capture("h1")).toBeNull();
});

test("ignores an unreadable generation without breaking the list", () => {
  const { hostDb, store } = setup();
  const broken = join(store, "devbox-broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "opencode.db"), "not a sqlite database");
  const sources = new MultiSourceReader(hostDb, store);
  const page = sources.listSessions({});
  expect(page.items.map((s) => s.id).sort()).toEqual(["h1", "v1"]);
});

test("picks up a new generation and an atomically replaced snapshot", () => {
  const { hostDb, store } = setup();
  const sources = new MultiSourceReader(hostDb, store);
  expect(sources.listSessions({}).total).toBe(2);

  const gen2 = join(store, "devbox-def");
  mkdirSync(gen2, { recursive: true });
  seedDb(join(gen2, "opencode.db"), "v2", 3000, "vm-session-2");
  expect(sources.listSessions({}).items.map((s) => s.id).sort()).toEqual(["h1", "v1", "v2"]);

  const tmp = join(store, "devbox-abc", ".tmp.db");
  seedDb(tmp, "v3", 4000, "vm-session-3");
  renameSync(tmp, join(store, "devbox-abc", "opencode.db"));
  expect(sources.listSessions({}).items.map((s) => s.id)).toContain("v3");
});

test("merges aggregates across sources and exposes bySource", () => {
  const { hostDb, store } = setup();
  const reader = new MultiSourceReader(hostDb, store);

  const byDir = reader.aggregateByDirectory({});
  const app = byDir.filter((r) => r.directory === "/w/app");
  expect(app).toHaveLength(1);
  expect(app[0].sessions).toBe(2);
  expect(app[0].totalCost).toBe(2);
  expect(app[0].bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);

  const all = reader.aggregateAll({});
  expect(all.sessions).toBe(2);
  expect(all.bySource.map((s) => s.source).sort()).toEqual(["host", "vm:devbox-abc"]);

  const byModel = reader.aggregateByModel({});
  expect(byModel).toHaveLength(1);
  expect(byModel[0].sessions).toBe(2);

  expect(reader.getSessionTree("v1")).toEqual(["v1"]);
  expect(reader.getSession("v1")?.source).toBe("vm:devbox-abc");
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @ia-dashboard/api test -- multi-source-reader`
Expected: FAIL — module `./multi-source-reader` introuvable.

- [ ] **Step 3: Créer `MultiSourceReader`**

Créer `api/src/opencode/multi-source-reader.ts` :

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OpenCodeReader } from "./opencode-reader";
import {
  DayAggregate,
  DirectoryAggregate,
  DirectoryModelAggregate,
  DirectoryTimeAggregate,
  ModelAggregate,
  OpenCodeProject,
  OpenCodeSession,
  SessionAggregate,
  SessionAnalysisInput,
  SessionCall,
  SessionListFilters,
  SessionPage,
  SessionReader,
  SessionStep,
  SourceAggregate,
  ToolUsage,
} from "./opencode.types";

export interface SessionConfigSnapshot {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  offeredTools: string[];
  config: unknown | null;
}

interface Capture {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  offeredTools: string[];
}

interface Source {
  source: string;
  reader: OpenCodeReader;
  captures: Map<string, Capture>;
  configs: Map<string, unknown>;
}

export class MultiSourceReader implements SessionReader {
  readonly source = "multi";
  private sources: Source[] = [];
  private hostSource: Source;

  constructor(
    hostDbPath: string,
    private readonly storeDir: string,
  ) {
    this.hostSource = {
      source: "host",
      reader: new OpenCodeReader(hostDbPath, "host"),
      captures: new Map(),
      configs: new Map(),
    };
    this.sources = [this.hostSource];
    this.refresh();
  }

  private refresh(): void {
    const gens = new Map<string, string>();
    if (existsSync(this.storeDir)) {
      for (const gen of readdirSync(this.storeDir)) {
        const dir = join(this.storeDir, gen);
        if (existsSync(join(dir, "opencode.db"))) gens.set(gen, dir);
      }
    }

    this.sources = this.sources.filter((s) => s === this.hostSource || gens.has(s.source.slice(3)));

    for (const [gen, dir] of gens) {
      const existing = this.sources.find((s) => s.source === `vm:${gen}`);
      if (existing) {
        this.loadCaptures(existing, dir);
        continue;
      }
      const reader = new OpenCodeReader(join(dir, "opencode.db"), `vm:${gen}`, true);
      try {
        reader.listSessions({ pageSize: 1 });
      } catch {
        continue;
      }
      const source: Source = { source: `vm:${gen}`, reader, captures: new Map(), configs: new Map() };
      this.loadCaptures(source, dir);
      this.sources.push(source);
    }
  }

  private loadCaptures(source: Source, dir: string): void {
    source.configs.clear();
    source.captures.clear();
    const cfgPath = join(dir, "configs.json");
    if (existsSync(cfgPath)) {
      for (const line of readFileSync(cfgPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as { id: string; config: unknown };
        source.configs.set(parsed.id, parsed.config);
      }
    }
    const capPath = join(dir, "captures.jsonl");
    if (existsSync(capPath)) {
      for (const line of readFileSync(capPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const c = JSON.parse(line) as any;
        source.captures.set(c.sessionId, {
          profile: c.profile ?? null,
          agent: c.agent ?? null,
          model: c.model?.modelID ?? null,
          configId: c.configId ?? null,
          offeredTools: c.offeredTools ?? [],
        });
      }
    }
  }

  private collect<T>(fn: (reader: OpenCodeReader) => T[]): T[][] {
    this.refresh();
    const out: T[][] = [];
    for (const s of this.sources) {
      try {
        out.push(fn(s.reader));
      } catch {
        // a broken source must not take the whole result down
      }
    }
    return out;
  }

  private merge<T extends { bySource: unknown[] }>(
    groups: T[][],
    keyOf: (r: T) => string,
    combine: (a: T, b: T) => T,
  ): T[] {
    const map = new Map<string, T>();
    for (const rows of groups) {
      for (const r of rows) {
        const key = keyOf(r);
        const cur = map.get(key);
        map.set(key, cur ? combine(cur, r) : r);
      }
    }
    return [...map.values()];
  }

  private ownerOf(id: string): OpenCodeReader | null {
    this.refresh();
    for (const s of this.sources) {
      try {
        if (s.reader.getSession(id)) return s.reader;
      } catch {
        // skip broken source
      }
    }
    return null;
  }

  private route<T>(ids: string[], fn: (reader: OpenCodeReader, sub: string[]) => T[]): T[] {
    this.refresh();
    const byReader = new Map<OpenCodeReader, string[]>();
    for (const id of ids) {
      const owner = this.ownerOf(id);
      if (!owner) continue;
      const list = byReader.get(owner) ?? [];
      list.push(id);
      byReader.set(owner, list);
    }
    const out: T[] = [];
    for (const [reader, sub] of byReader) {
      try {
        out.push(...fn(reader, sub));
      } catch {
        // skip broken source
      }
    }
    return out;
  }

  open(): void {
    this.hostSource.reader.open();
    for (const s of this.sources) {
      if (s === this.hostSource) continue;
      try {
        s.reader.open();
      } catch {
        // unreadable VM source: ignore
      }
    }
  }

  close(): void {
    for (const s of this.sources) s.reader.close();
  }

  listSessions(filters: SessionListFilters = {}): SessionPage {
    this.refresh();
    const merged = new Map<string, OpenCodeSession>();
    for (const s of this.sources) {
      let pageNo = 1;
      let total = Infinity;
      const collected: OpenCodeSession[] = [];
      try {
        while (collected.length < total && pageNo <= 100) {
          const p = s.reader.listSessions({ ...filters, page: pageNo, pageSize: 200 });
          total = p.total;
          if (p.items.length === 0) break;
          collected.push(...p.items);
          pageNo++;
        }
      } catch {
        continue;
      }
      for (const item of collected) {
        const existing = merged.get(item.id);
        if (!existing || item.timeUpdated > existing.timeUpdated) merged.set(item.id, item);
      }
    }
    const all = [...merged.values()].sort((a, b) => b.timeCreated - a.timeCreated);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    };
  }

  getSession(id: string): OpenCodeSession | null {
    this.refresh();
    let best: OpenCodeSession | null = null;
    for (const s of this.sources) {
      try {
        const found = s.reader.getSession(id);
        if (found && (!best || found.timeUpdated > best.timeUpdated)) best = found;
      } catch {
        // skip broken source
      }
    }
    return best;
  }

  getSubagentIds(parentId: string): string[] {
    const reader = this.ownerOf(parentId);
    return reader ? reader.getSubagentIds(parentId) : [];
  }

  getSessionTree(id: string): string[] {
    const reader = this.ownerOf(id);
    return reader ? reader.getSessionTree(id) : [];
  }

  getSessionCalls(ids: string[]): SessionCall[] {
    return this.route(ids, (r, sub) => r.getSessionCalls(sub));
  }

  getSessionSteps(ids: string[]): SessionStep[] {
    return this.route(ids, (r, sub) => r.getSessionSteps(sub));
  }

  getSessionToolUsage(ids: string[]): ToolUsage[] {
    return this.route(ids, (r, sub) => r.getSessionToolUsage(sub));
  }

  getSessionAnalysisInput(id: string): SessionAnalysisInput | null {
    const reader = this.ownerOf(id);
    return reader ? reader.getSessionAnalysisInput(id) : null;
  }

  listProjects(): OpenCodeProject[] {
    const groups = this.collect((r) => r.listProjects());
    const map = new Map<string, OpenCodeProject>();
    for (const rows of groups) for (const p of rows) if (!map.has(p.id)) map.set(p.id, p);
    return [...map.values()];
  }

  listModels(): string[] {
    const groups = this.collect((r) => r.listModels());
    const set = new Set<string>();
    for (const rows of groups) for (const m of rows) set.add(m);
    return [...set].sort();
  }

  listDirectories(): { directory: string; firstSeen: number; lastSeen: number }[] {
    const groups = this.collect((r) => r.listDirectories());
    const map = new Map<string, { directory: string; firstSeen: number; lastSeen: number }>();
    for (const rows of groups) {
      for (const d of rows) {
        const cur = map.get(d.directory);
        if (cur) {
          cur.firstSeen = Math.min(cur.firstSeen, d.firstSeen);
          cur.lastSeen = Math.max(cur.lastSeen, d.lastSeen);
        } else {
          map.set(d.directory, { ...d });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  listParentSessions({ from }: { from?: number } = {}): OpenCodeSession[] {
    const groups = this.collect((r) => r.listParentSessions({ from }));
    const map = new Map<string, OpenCodeSession>();
    for (const rows of groups) {
      for (const s of rows) {
        const cur = map.get(s.id);
        if (!cur || s.timeUpdated > cur.timeUpdated) map.set(s.id, s);
      }
    }
    return [...map.values()].sort((a, b) => a.timeCreated - b.timeCreated);
  }

  aggregateAll({ from = 0 }: { from?: number } = {}): SessionAggregate {
    const groups = this.collect((r) => [r.aggregateAll({ from })]);
    const total: SessionAggregate = {
      totalCost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      sessions: 0,
      bySource: [],
    };
    for (const [row] of groups) {
      total.totalCost += row.totalCost;
      total.tokensInput += row.tokensInput;
      total.tokensOutput += row.tokensOutput;
      total.sessions += row.sessions;
      total.bySource.push(...row.bySource);
    }
    return total;
  }

  aggregateByDirectory({ from = 0 }: { from?: number } = {}): DirectoryAggregate[] {
    const groups = this.collect((r) => r.aggregateByDirectory({ from }));
    return this.merge<DirectoryAggregate>(
      groups,
      (r) => r.directory,
      (a, b) => ({
        directory: a.directory,
        name: basename(a.directory),
        firstSeen: Math.min(a.firstSeen, b.firstSeen),
        lastSeen: Math.max(a.lastSeen, b.lastSeen),
        totalCost: a.totalCost + b.totalCost,
        tokensInput: a.tokensInput + b.tokensInput,
        tokensOutput: a.tokensOutput + b.tokensOutput,
        sessions: a.sessions + b.sessions,
        bySource: [...a.bySource, ...b.bySource],
      }),
    ).sort((a, b) => b.totalCost - a.totalCost);
  }

  aggregateByDirectoryAndModel({
    from = 0,
  }: { from?: number } = {}): DirectoryModelAggregate[] {
    const groups = this.collect((r) => r.aggregateByDirectoryAndModel({ from }));
    return this.merge<DirectoryModelAggregate>(
      groups,
      (r) => `${r.directory}\u0000${r.model}`,
      (a, b) => ({
        directory: a.directory,
        model: a.model,
        totalCost: a.totalCost + b.totalCost,
        tokensInput: a.tokensInput + b.tokensInput,
        tokensOutput: a.tokensOutput + b.tokensOutput,
        sessions: a.sessions + b.sessions,
        bySource: [...a.bySource, ...b.bySource],
      }),
    ).sort((a, b) => b.totalCost - a.totalCost);
  }

  aggregateByModel({ from = 0 }: { from?: number } = {}): ModelAggregate[] {
    const groups = this.collect((r) => r.aggregateByModel({ from }));
    return this.merge<ModelAggregate>(
      groups,
      (r) => r.model,
      (a, b) => ({
        model: a.model,
        totalCost: a.totalCost + b.totalCost,
        tokensInput: a.tokensInput + b.tokensInput,
        tokensOutput: a.tokensOutput + b.tokensOutput,
        sessions: a.sessions + b.sessions,
        bySource: [...a.bySource, ...b.bySource],
      }),
    ).sort((a, b) => b.totalCost - a.totalCost);
  }

  aggregateByDay({ from = 0 }: { from?: number } = {}): DayAggregate[] {
    const groups = this.collect((r) => r.aggregateByDay({ from }));
    return this.merge<DayAggregate>(
      groups,
      (r) => r.day,
      (a, b) => ({
        day: a.day,
        totalCost: a.totalCost + b.totalCost,
        tokensInput: a.tokensInput + b.tokensInput,
        tokensOutput: a.tokensOutput + b.tokensOutput,
        sessions: a.sessions + b.sessions,
        bySource: [...a.bySource, ...b.bySource],
      }),
    ).sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  timeByDirectory({ from = 0 }: { from?: number } = {}): DirectoryTimeAggregate[] {
    const groups = this.collect((r) => r.timeByDirectory({ from }));
    return this.merge<DirectoryTimeAggregate>(
      groups,
      (r) => r.directory,
      (a, b) => ({
        directory: a.directory,
        durationMs: a.durationMs + b.durationMs,
        bySource: [...a.bySource, ...b.bySource],
      }),
    ).sort((a, b) => b.durationMs - a.durationMs);
  }

  capture(sessionId: string): SessionConfigSnapshot | null {
    this.refresh();
    for (const s of this.sources) {
      const c = s.captures.get(sessionId);
      if (c) {
        return { ...c, config: c.configId ? (s.configs.get(c.configId) ?? null) : null };
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Supprimer l'ancien fichier et son spec**

```bash
git rm api/src/opencode/session-sources.ts api/src/opencode/session-sources.spec.ts
```

- [ ] **Step 5: Brancher le provider**

Remplacer tout `api/src/opencode/opencode.module.ts` par :

```ts
import { Global, Module } from "@nestjs/common";
import { MultiSourceReader } from "./multi-source-reader";
import { APP_CONFIG, AppConfig } from "../config/config";

export const OPENCODE_READER = Symbol("OPENCODE_READER");

@Global()
@Module({
  providers: [
    {
      provide: OPENCODE_READER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MultiSourceReader(config.dbPath, config.vmStoreDir),
    },
  ],
  exports: [OPENCODE_READER],
})
export class OpenCodeModule {}
```

- [ ] **Step 6: Adapter `SessionsService`**

Dans `api/src/sessions/sessions.service.ts` :

a. Remplacer les imports `SESSION_SOURCES` / `SessionSources` par :

```ts
import { OPENCODE_READER } from "../opencode/opencode.module";
import { MultiSourceReader } from "../opencode/multi-source-reader";
```

b. Constructeur :

```ts
    @Inject(OPENCODE_READER) private readonly reader: MultiSourceReader,
```

c. Dans `list`, remplacer `const page = this.sources.list(filters);` par `const page = this.reader.listSessions(filters);`.

d. Dans `findOne`, remplacer `const session = this.sources.getSession(id);` par `const session = this.reader.getSession(id);`.

e. Remplacer intégralement la méthode `private profile(id: string)` par :

```ts
  private profile(id: string) {
    const session = this.reader.getSession(id);
    if (!session) return null;
    const tree = this.reader.getSessionTree(id);
    const calls = this.reader.getSessionCalls(tree);
    const steps = this.reader.getSessionSteps(tree);
    const tools = this.reader.getSessionToolUsage(tree);
    const byModel = new Map<
      string,
      { model: string; cost: number; tokensInput: number; tokensOutput: number; llmCalls: number }
    >();
    for (const c of calls) {
      const m =
        byModel.get(c.model) ??
        { model: c.model, cost: 0, tokensInput: 0, tokensOutput: 0, llmCalls: 0 };
      m.cost += c.cost;
      m.tokensInput += c.tokensInput;
      m.tokensOutput += c.tokensOutput;
      m.llmCalls++;
      byModel.set(c.model, m);
    }
    const sum = (pick: (s: (typeof steps)[number]) => number) =>
      steps.reduce((acc, s) => acc + pick(s), 0);
    const capture = this.reader.capture(id);
    return {
      session,
      source: session.source,
      profile: capture?.profile ?? null,
      configId: capture?.configId ?? null,
      config: capture?.config ?? null,
      offeredTools: capture?.offeredTools ?? [],
      totals: {
        cost: calls.reduce((acc, c) => acc + c.cost, 0),
        tokensInput: sum((s) => s.tokensInput),
        tokensOutput: sum((s) => s.tokensOutput),
        tokensReasoning: sum((s) => s.tokensReasoning),
        cacheRead: sum((s) => s.cacheRead),
        cacheWrite: sum((s) => s.cacheWrite),
        llmCalls: calls.length,
        toolCalls: tools.reduce((acc, t) => acc + t.count, 0),
        treeSize: tree.length,
      },
      byModel: [...byModel.values()].sort((x, y) => y.cost - x.cost),
      tools,
      tree: tree.map((tid) => {
        const s = this.reader.getSession(tid)!;
        return { sessionId: s.id, parentId: s.parentId, agent: s.agent, model: s.model, cost: s.cost };
      }),
    };
  }
```

f. Dans `meta`, remplacer `models: this.sources.listModels(),` par `models: this.reader.listModels(),`.

- [ ] **Step 7: Adapter `sessions.service.spec.ts`**

Remplacer le `sourcesMock` (lignes 3-15) par :

```ts
const sourcesMock = {
  listSessions: jest.fn().mockReturnValue({
    items: [
      { id: "s1", directory: "/p/gateway", model: "deepseek-v4-flash" },
      { id: "s2", directory: "/p/gateway", model: "deepseek-v4-flash" },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  }),
  getSession: jest.fn().mockReturnValue({ id: "s3", title: "T", directory: "/p/gateway" }),
  listModels: jest.fn().mockReturnValue(["deepseek-v4-flash"]),
};
```

Puis, dans le test `"delegates list to the reader"`, remplacer `expect(sourcesMock.list).toHaveBeenCalledWith({ page: 1 });` par `expect(sourcesMock.listSessions).toHaveBeenCalledWith({ page: 1 });` et, dans `"list resolves a synthetic projectId to member directories"`, remplacer `expect(sourcesMock.list).toHaveBeenCalledWith(` par `expect(sourcesMock.listSessions).toHaveBeenCalledWith(`.

- [ ] **Step 8: Lancer les tests**

Run: `pnpm --filter @ia-dashboard/api test -- "multi-source-reader|sessions.service"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A api/src/opencode api/src/sessions
git commit -m "refactor(api): MultiSourceReader implements SessionReader and backs OPENCODE_READER"
```

---

### Task 3: Consommateurs typés `SessionReader`

**Files:**
- Modify: `api/src/dashboard/dashboard.service.ts`
- Modify: `api/src/projects/projects.service.ts`
- Modify: `api/src/features/features.service.ts`
- Modify: `api/src/analysis/analysis.service.ts`
- Modify: `api/src/health/health.controller.ts`

**Interfaces:**
- Consumes: `SessionReader` (Task 1), provider `OPENCODE_READER` = `MultiSourceReader` (Task 2).
- Produces: aucun nouveau contrat ; purement type.

- [ ] **Step 1: Dashboard**

Dans `api/src/dashboard/dashboard.service.ts`, remplacer `import { OpenCodeReader } from "../opencode/opencode-reader";` par `import { SessionReader } from "../opencode/opencode.types";` et `private readonly reader: OpenCodeReader` par `private readonly reader: SessionReader`.

- [ ] **Step 2: Projects**

Dans `api/src/projects/projects.service.ts`, remplacer `import { OpenCodeReader } from "../opencode/opencode-reader";` par `import { SessionReader } from "../opencode/opencode.types";` et `private readonly reader: OpenCodeReader` par `private readonly reader: SessionReader`.

- [ ] **Step 3: Features**

Dans `api/src/features/features.service.ts`, remplacer `import { OpenCodeReader } from "../opencode/opencode-reader";` par `import { SessionReader } from "../opencode/opencode.types";` et `private readonly reader: OpenCodeReader` par `private readonly reader: SessionReader`.

- [ ] **Step 4: Analysis**

Dans `api/src/analysis/analysis.service.ts`, remplacer `import { OpenCodeReader } from "../opencode/opencode-reader";` par `import { SessionReader } from "../opencode/opencode.types";`, `private readonly reader: OpenCodeReader` par `private readonly reader: SessionReader`, et `input: NonNullable<ReturnType<OpenCodeReader["getSessionAnalysisInput"]>>` par `input: NonNullable<ReturnType<SessionReader["getSessionAnalysisInput"]>>`.

- [ ] **Step 5: Health**

Dans `api/src/health/health.controller.ts`, remplacer `import { OpenCodeReader } from "../opencode/opencode-reader";` par `import { SessionReader } from "../opencode/opencode.types";` et `private readonly reader: OpenCodeReader` par `private readonly reader: SessionReader`.

- [ ] **Step 6: Vérifier le typage et les tests**

Run: `pnpm --filter @ia-dashboard/api typecheck && pnpm --filter @ia-dashboard/api test`
Expected: typecheck OK, tous les tests PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/dashboard/dashboard.service.ts api/src/projects/projects.service.ts api/src/features/features.service.ts api/src/analysis/analysis.service.ts api/src/health/health.controller.ts
git commit -m "refactor(api): type consumers against SessionReader"
```

---

### Task 4: Propager `bySource` dans Dashboard et Projects

**Files:**
- Modify: `api/src/dashboard/dashboard.service.ts`
- Modify: `api/src/dashboard/dashboard.service.spec.ts`
- Modify: `api/src/projects/projects.service.ts`
- Modify: `api/src/projects/projects.service.spec.ts`

**Interfaces:**
- Consumes: `SourceAggregate` (Task 1), `bySource` sur les lignes d'agrégat (Task 1 & 2).
- Produces: `bySource` dans `byProject[].bySource`, `byProject[].models[].bySource` (non), `timeByProject[].bySource`, et dans chaque projet projeté par `ProjectsService`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `api/src/dashboard/dashboard.service.spec.ts`, remplacer les trois `expect(out.timeByProject).toEqual([...])` (lignes 94-96, 171-173, 221-223) en ajoutant `bySource: []` au résultat attendu. Exemple pour le premier :

```ts
    expect(out.timeByProject).toEqual([
      { directory: "/p/gateway", name: "gateway", durationMs: 3600000, id: "p1", bySource: [] },
    ]);
```

Puis ajouter, à la fin du `describe`, ce test :

```ts
  it("summary exposes the per-source breakdown per project", async () => {
    const readerMock4 = {
      ...readerMock,
      aggregateByDirectory: jest.fn().mockReturnValue([
        {
          directory: "/p/gateway",
          name: "gateway",
          totalCost: 10,
          tokensInput: 1,
          tokensOutput: 1,
          sessions: 2,
          bySource: [
            { source: "host", totalCost: 6, tokensInput: 1, tokensOutput: 1, sessions: 1 },
            { source: "vm:devbox", totalCost: 4, tokensInput: 0, tokensOutput: 0, sessions: 1 },
          ],
        },
      ]),
      timeByDirectory: jest.fn().mockReturnValue([
        {
          directory: "/p/gateway",
          durationMs: 3600000,
          bySource: [
            { source: "host", durationMs: 2000000 },
            { source: "vm:devbox", durationMs: 1600000 },
          ],
        },
      ]),
    };
    const db = mkDb([{ c: 0 }], [{ c: 0 }], []);
    const svc = new DashboardService(readerMock4 as any, db as any);
    const out = await svc.summary(7);
    expect(out.byProject[0].bySource).toEqual([
      { source: "host", totalCost: 6, tokensInput: 1, tokensOutput: 1, sessions: 1 },
      { source: "vm:devbox", totalCost: 4, tokensInput: 0, tokensOutput: 0, sessions: 1 },
    ]);
    expect(out.timeByProject[0].bySource).toEqual([
      { source: "host", durationMs: 2000000 },
      { source: "vm:devbox", durationMs: 1600000 },
    ]);
  });
```

Dans `api/src/projects/projects.service.spec.ts`, ajouter dans le test `"list returns projects with live aggregates"`, avant la fin :

```ts
    expect(rows[0].bySource).toEqual([]);
```

Puis ajouter ce test à la fin du `describe` :

```ts
  it("list exposes the per-source breakdown per project", async () => {
    const readerMock2 = {
      ...readerMock,
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
          bySource: [
            { source: "host", totalCost: 3, tokensInput: 6, tokensOutput: 12, sessions: 1 },
            { source: "vm:devbox", totalCost: 2, tokensInput: 4, tokensOutput: 8, sessions: 1 },
          ],
        },
      ]),
    };
    const projectRow = {
      id: "p1",
      name: "gateway",
      directory: "/home/user/gateway",
      stale: false,
      firstSeen: new Date(1000),
      lastSeen: new Date(2000),
    };
    const db = mkChain([], [], [], [projectRow]);
    const svc = new ProjectsService(db as any, readerMock2 as any);
    const rows = await svc.list();
    expect(rows[0].bySource).toEqual([
      { source: "host", totalCost: 3, tokensInput: 6, tokensOutput: 12, sessions: 1 },
      { source: "vm:devbox", totalCost: 2, tokensInput: 4, tokensOutput: 8, sessions: 1 },
    ]);
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `pnpm --filter @ia-dashboard/api test -- "dashboard.service|projects.service"`
Expected: FAIL — `bySource` absent/undefined.

- [ ] **Step 3: Implémenter dans `DashboardService`**

Dans `api/src/dashboard/dashboard.service.ts`, ajouter `SourceAggregate` à l'import depuis `../opencode/opencode.types`.

Remplacer le bloc `const byProject = new Map<...>()` + boucle `for (const a of this.reader.aggregateByDirectory(...))` (lignes 54-82) par :

```ts
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
        bySource: SourceAggregate[];
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
        bySource: [],
      };
      cur.totalCost += a.totalCost;
      cur.tokensInput += a.tokensInput;
      cur.tokensOutput += a.tokensOutput;
      cur.sessions += a.sessions;
      cur.bySource.push(...(a.bySource ?? []));
      byProject.set(g.name, cur);
    }
```

Remplacer le bloc `const timeByProject = new Map<...>()` + boucle `for (const t of timeRows)` (lignes 118-133) par :

```ts
    const timeByProject = new Map<
      string,
      {
        directory: string;
        name: string;
        durationMs: number;
        id: string;
        bySource: { source: string; durationMs: number }[];
      }
    >();
    for (const t of timeRows) {
      const g = dirToGroup.get(t.directory) ?? fallback(t.directory);
      const cur = timeByProject.get(g.name);
      if (cur) {
        cur.durationMs += t.durationMs;
        cur.bySource.push(...(t.bySource ?? []));
      } else {
        timeByProject.set(g.name, {
          directory: g.directory,
          name: g.name,
          durationMs: t.durationMs,
          id: g.id,
          bySource: [...(t.bySource ?? [])],
        });
      }
    }
```

- [ ] **Step 4: Implémenter dans `ProjectsService`**

Dans `api/src/projects/projects.service.ts`, ajouter `SourceAggregate` à l'import depuis `../opencode/opencode.types`.

Dans `list()`, remplacer la boucle interne par :

```ts
        let durationMs = 0;
        const bySource: SourceAggregate[] = [];
        for (const d of g.directories) {
          const a = byDir.get(d);
          sessionCount += a?.sessions ?? 0;
          totalCost += a?.totalCost ?? 0;
          tokensInput += a?.tokensInput ?? 0;
          tokensOutput += a?.tokensOutput ?? 0;
          durationMs += times.get(d) ?? 0;
          if (a) bySource.push(...(a.bySource ?? []));
        }
        return { ...g, sessionCount, totalCost, tokensInput, tokensOutput, durationMs, bySource };
```

Dans `findOne()`, après le calcul de `tokensOutput`, ajouter l'accumulation et retourner le champ :

```ts
    const bySource: SourceAggregate[] = [];
    for (const a of memberAgg) bySource.push(...(a.bySource ?? []));
```

et dans l'objet retourné, ajouter `bySource,` après `tokensOutput,`.

- [ ] **Step 5: Lancer les tests**

Run: `pnpm --filter @ia-dashboard/api test -- "dashboard.service|projects.service"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/dashboard api/src/projects
git commit -m "feat(api): expose per-source breakdown in dashboard and projects"
```

---

### Task 5: Vérification finale

**Files:** aucun (vérification).

- [ ] **Step 1: Suite complète + typecheck**

Run: `pnpm --filter @ia-dashboard/api test && pnpm --filter @ia-dashboard/api typecheck`
Expected: tous les tests PASS, aucune erreur de type.

- [ ] **Step 2: Vérifier en conditions réelles que les VM remontent dans le dashboard**

Run:
```bash
docker compose restart api
docker exec ia-dashboard-api-1 node -e 'fetch("http://localhost:3000/api/dashboard/summary").then(r=>r.json()).then(j=>{const s=(j.bySource||[]).map(x=>x.source); console.log("sources:",s); console.log("sessions:",j.sessionCount,"vm sessions:",(j.bySource||[]).filter(x=>x.source.startsWith("vm:")).reduce((n,x)=>n+x.sessions,0))})'
```
Expected: la sortie liste au moins `host` **et** une source `vm:...`, et `vm sessions` > 0.

- [ ] **Step 3: Commit éventuel** — aucun si rien n'a changé.

## Self-review du plan

- **Couverture du spec** : interface `SessionReader` (T1), `bySource` types + host reader (T1), `MultiSourceReader` + provider + sessions.service + capture (T2), consommateurs typés (T3), `bySource` dashboard/projects (T4), cycle de vie `open` strict host (T2 Step 3), `ponytail` dédup (implicite : pas de dédup d'agrégat), vérif réelle (T5). Toutes les sections du spec sont couvertes.
- **Placeholders** : aucun TBD/TODO ; tout le code est fourni.
- **Cohérence des types** : `SessionReader`, `SourceAggregate`, `bySource`, `capture`, `MultiSourceReader`, `CAPTURE` de `SessionConfigSnapshot` identiques d'un task à l'autre.
- **Point de vigilance** : `sessions.service.spec` doit renommer `list` → `listSessions` (T2 Step 7) ; les `toEqual` de `timeByProject` doivent inclure `bySource` (T4 Step 1).
