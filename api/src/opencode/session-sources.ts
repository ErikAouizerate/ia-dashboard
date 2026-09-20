import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenCodeReader } from "./opencode-reader";
import { OpenCodeSession, SessionListFilters, SessionPage } from "./opencode.types";

export interface SessionConfigSnapshot {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  config: unknown | null;
}

interface Source {
  source: string;
  reader: OpenCodeReader;
  captures: Map<
    string,
    { profile: string | null; agent: string | null; model: string | null; configId: string | null }
  >;
  configs: Map<string, unknown>;
}

export class SessionSources {
  private sources: Source[] = [];

  constructor(hostDbPath: string, vmStoreDir: string) {
    this.sources.push({
      source: "host",
      reader: new OpenCodeReader(hostDbPath, "host"),
      captures: new Map(),
      configs: new Map(),
    });
    this.sources.push(...this.loadVmGenerations(vmStoreDir));
  }

  private loadVmGenerations(storeDir: string): Source[] {
    if (!existsSync(storeDir)) return [];
    const out: Source[] = [];
    for (const gen of readdirSync(storeDir)) {
      const dbPath = join(storeDir, gen, "opencode.db");
      if (!existsSync(dbPath)) continue;
      const source: Source = {
        source: `vm:${gen}`,
        reader: new OpenCodeReader(dbPath, `vm:${gen}`),
        captures: new Map(),
        configs: new Map(),
      };
      const cfgPath = join(storeDir, gen, "configs.json");
      if (existsSync(cfgPath)) {
        for (const line of readFileSync(cfgPath, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as { id: string; config: unknown };
          source.configs.set(parsed.id, parsed.config);
        }
      }
      const capPath = join(storeDir, gen, "captures.jsonl");
      if (existsSync(capPath)) {
        for (const line of readFileSync(capPath, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const c = JSON.parse(line) as any;
          source.captures.set(c.sessionId, {
            profile: c.profile ?? null,
            agent: c.agent ?? null,
            model: c.model?.modelID ?? null,
            configId: c.configId ?? null,
          });
        }
      }
      out.push(source);
    }
    return out;
  }

  readerFor(id: string): OpenCodeReader | null {
    for (const s of this.sources) if (s.reader.getSession(id)) return s.reader;
    return null;
  }

  getSession(id: string): OpenCodeSession | null {
    for (const s of this.sources) {
      const found = s.reader.getSession(id);
      if (found) return found;
    }
    return null;
  }

  sourceOf(id: string): string | null {
    for (const s of this.sources) if (s.reader.getSession(id)) return s.source;
    return null;
  }

  capture(sessionId: string): SessionConfigSnapshot | null {
    for (const s of this.sources) {
      const c = s.captures.get(sessionId);
      if (c) {
        return { ...c, config: c.configId ? (s.configs.get(c.configId) ?? null) : null };
      }
    }
    return null;
  }

  listModels(): string[] {
    const set = new Set<string>();
    for (const s of this.sources) for (const m of s.reader.listModels()) set.add(m);
    return [...set].sort();
  }

  list(filters: SessionListFilters): SessionPage {
    const merged = new Map<string, OpenCodeSession>();
    for (const s of this.sources) {
      // the reader caps pageSize at 200; page through so the merged list is complete
      let pageNo = 1;
      let total = Infinity;
      const collected: OpenCodeSession[] = [];
      while (collected.length < total && pageNo <= 100) {
        const p = s.reader.listSessions({ ...filters, page: pageNo, pageSize: 200 });
        total = p.total;
        if (p.items.length === 0) break;
        collected.push(...p.items);
        pageNo++;
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
