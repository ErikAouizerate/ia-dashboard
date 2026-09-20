import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenCodeReader } from "./opencode-reader";
import { OpenCodeSession, SessionListFilters, SessionPage } from "./opencode.types";

export interface SessionConfigSnapshot {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  offeredTools: string[];
  config: unknown | null;
}

interface Source {
  source: string;
  reader: OpenCodeReader;
  captures: Map<
    string,
    {
      profile: string | null;
      agent: string | null;
      model: string | null;
      configId: string | null;
      offeredTools: string[];
    }
  >;
  configs: Map<string, unknown>;
}

export class SessionSources {
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

  /**
   * Rescan the VM store on every access: snapshots create new generations and
   * atomically replace files while the API is running. Readers with
   * watchChanges reopen the DB when its inode/mtime changes.
   */
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
        continue; // unreadable generation: ignore it, never break the whole list
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

  readerFor(id: string): OpenCodeReader | null {
    this.refresh();
    for (const s of this.sources) if (s.reader.getSession(id)) return s.reader;
    return null;
  }

  getSession(id: string): OpenCodeSession | null {
    this.refresh();
    for (const s of this.sources) {
      const found = s.reader.getSession(id);
      if (found) return found;
    }
    return null;
  }

  sourceOf(id: string): string | null {
    this.refresh();
    for (const s of this.sources) if (s.reader.getSession(id)) return s.source;
    return null;
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

  listModels(): string[] {
    this.refresh();
    const set = new Set<string>();
    for (const s of this.sources) for (const m of s.reader.listModels()) set.add(m);
    return [...set].sort();
  }

  list(filters: SessionListFilters): SessionPage {
    this.refresh();
    const merged = new Map<string, OpenCodeSession>();
    for (const s of this.sources) {
      // the reader caps pageSize at 200; page through so the merged list is complete
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
        continue; // a broken source must not take the whole list down
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
}
