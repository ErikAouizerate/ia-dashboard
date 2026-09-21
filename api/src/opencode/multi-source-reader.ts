import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OpenCodeReader } from "./opencode-reader";
import { configFingerprint } from "./config-fingerprint";
import { stat, Stat } from "./stats";
import {
  DayAggregate,
  DirectoryAggregate,
  DirectoryModelAggregate,
  DirectoryTimeAggregate,
  ModelAggregate,
  OpenCodeProject,
  OpenCodeSession,
  SessionAggregate,
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

export const NO_CONFIG_ID = "none";

function stringList(config: unknown, key: string): string[] {
  if (!config || typeof config !== "object") return [];
  const value = (config as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function pluginLabel(plugin: string): string {
  const path = plugin.replace(/^file:\/\//, "");
  return path.includes("/") ? basename(path) : plugin;
}

export interface ConfigSession {
  id: string;
  title: string;
  source: string;
  model: string;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  cacheRead: number;
  timeCreated: number;
  timeUpdated: number;
  projectName: string;
}

export interface ConfigModelStat {
  model: string;
  sessions: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface ConfigStats {
  cost: Stat;
  tokensOutput: Stat;
  durationMs: Stat;
}

export interface ConfigSummary {
  configId: string | null;
  configIds: string[];
  profile: string | null;
  config: unknown | null;
  plugins: string[];
  skills: string[];
  sessions: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  bySource: SourceAggregate[];
  models: ConfigModelStat[];
  stats: ConfigStats;
}

export interface ConfigDetail extends ConfigSummary {
  sessionList: ConfigSession[];
}

interface Capture {
  profile: string | null;
  agent: string | null;
  model: string | null;
  configId: string | null;
  rawConfigId: string | null;
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
    // raw configId hashes preserve plugin order; normalize to a fingerprint so the
    // same config captured with reordered plugins groups once.
    const fingerprint = new Map<string, string>();
    for (const [rawId, cfg] of source.configs) {
      const fp = configFingerprint(cfg);
      if (fp) fingerprint.set(rawId, fp);
    }
    if (existsSync(capPath)) {
      for (const line of readFileSync(capPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const c = JSON.parse(line) as any;
        const rawConfigId = c.configId ?? null;
        source.captures.set(c.sessionId, {
          profile: c.profile ?? null,
          agent: c.agent ?? null,
          model: c.model?.modelID ?? null,
          configId: rawConfigId ? (fingerprint.get(rawConfigId) ?? rawConfigId) : null,
          rawConfigId,
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

  private collectAll(filters: SessionListFilters): OpenCodeSession[] {
    this.refresh();
    const merged = new Map<string, OpenCodeSession>();
    for (const s of this.sources) {
      if (filters.source && s.source !== filters.source) continue;
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
    let all = [...merged.values()];
    if (filters.configId) {
      const configIds = this.configIds();
      all = all.filter(
        (s) => (configIds.get(s.id) ?? NO_CONFIG_ID) === filters.configId,
      );
    }
    return all.sort((a, b) => b.timeCreated - a.timeCreated);
  }

  private configIds(): Map<string, string> {
    this.refresh();
    const map = new Map<string, string>();
    for (const s of this.sources) {
      for (const [sessionId, c] of s.captures) map.set(sessionId, c.configId ?? NO_CONFIG_ID);
    }
    return map;
  }

  listSources(): string[] {
    this.refresh();
    return this.sources.map((s) => s.source).sort();
  }

  listSessions(filters: SessionListFilters = {}): SessionPage {
    const all = this.collectAll(filters);
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
        return {
          profile: c.profile,
          agent: c.agent,
          model: c.model,
          configId: c.configId,
          offeredTools: c.offeredTools,
          config: c.rawConfigId ? (s.configs.get(c.rawConfigId) ?? null) : null,
        };
      }
    }
    return null;
  }

  listConfigs({
    from = 0,
    directories,
  }: { from?: number; directories?: string[] } = {}): ConfigSummary[] {
    return this.buildConfigs(from, directories).map(({ sessionList, ...summary }) => summary);
  }

  getConfig(configId: string): ConfigDetail | null {
    return (
      this.buildConfigs(0).find((c) =>
        configId === NO_CONFIG_ID ? c.configId === null : c.configId === configId,
      ) ?? null
    );
  }

  private buildConfigs(from: number, directories?: string[]): ConfigDetail[] {
    this.refresh();
    // ponytail: full session scan per request; index configs if the history grows large
    const captures = new Map<string, { cap: SessionConfigSnapshot; rawConfigId: string | null }>();
    for (const s of this.sources) {
      for (const [sessionId, c] of s.captures) {
        captures.set(sessionId, {
          cap: {
            profile: c.profile,
            agent: c.agent,
            model: c.model,
            configId: c.configId,
            offeredTools: c.offeredTools,
            config: c.rawConfigId ? (s.configs.get(c.rawConfigId) ?? null) : null,
          },
          rawConfigId: c.rawConfigId,
        });
      }
    }

    const map = new Map<string, ConfigDetail>();
    for (const s of this.collectAll(directories?.length ? { directories } : {})) {
      if (from > 0 && s.timeCreated < from) continue;
      const entry = captures.get(s.id) ?? null;
      const cap = entry?.cap ?? null;
      const key = cap?.configId ?? NO_CONFIG_ID;
      const c: ConfigDetail = map.get(key) ?? {
        configId: cap?.configId ?? null,
        configIds: [],
        profile: null,
        config: null,
        plugins: [],
        skills: [],
        sessions: 0,
        totalCost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        bySource: [],
        models: [],
        stats: { cost: stat([]), tokensOutput: stat([]), durationMs: stat([]) },
        sessionList: [],
      };
      if (!c.profile && cap?.profile) c.profile = cap.profile;
      if (c.config == null && cap?.config != null) {
        c.config = cap.config;
        c.plugins = stringList(cap.config, "plugins").map(pluginLabel).sort();
        c.skills = stringList(cap.config, "skills").sort();
      }
      if (entry?.rawConfigId && !c.configIds.includes(entry.rawConfigId)) {
        c.configIds.push(entry.rawConfigId);
      }
      c.sessions++;
      c.totalCost += s.cost;
      c.tokensInput += s.tokensInput;
      c.tokensOutput += s.tokensOutput;

      const src = c.bySource.find((x) => x.source === s.source);
      if (src) {
        src.sessions++;
        src.totalCost += s.cost;
        src.tokensInput += s.tokensInput;
        src.tokensOutput += s.tokensOutput;
      } else {
        c.bySource.push({
          source: s.source,
          sessions: 1,
          totalCost: s.cost,
          tokensInput: s.tokensInput,
          tokensOutput: s.tokensOutput,
        });
      }

      const model = c.models.find((x) => x.model === s.model);
      if (model) {
        model.sessions++;
        model.totalCost += s.cost;
        model.tokensInput += s.tokensInput;
        model.tokensOutput += s.tokensOutput;
      } else {
        c.models.push({
          model: s.model,
          sessions: 1,
          totalCost: s.cost,
          tokensInput: s.tokensInput,
          tokensOutput: s.tokensOutput,
        });
      }

      c.sessionList.push({
        id: s.id,
        title: s.title,
        source: s.source,
        model: s.model,
        cost: s.cost,
        tokensInput: s.tokensInput,
        tokensOutput: s.tokensOutput,
        tokensReasoning: s.tokensReasoning,
        cacheRead: s.tokensCacheRead,
        timeCreated: s.timeCreated,
        timeUpdated: s.timeUpdated,
        projectName: s.projectName,
      });

      map.set(key, c);
    }

    const list = [...map.values()];
    for (const c of list) {
      c.models.sort((a, b) => b.totalCost - a.totalCost);
      c.sessionList.sort((a, b) => b.timeCreated - a.timeCreated);
      // ponytail: duration = timeUpdated - timeCreated, a proxy (no native duration field)
      c.stats = {
        cost: stat(c.sessionList.map((s) => s.cost)),
        tokensOutput: stat(c.sessionList.map((s) => s.tokensOutput)),
        durationMs: stat(c.sessionList.map((s) => s.timeUpdated - s.timeCreated)),
      };
    }
    return list.sort((a, b) => b.totalCost - a.totalCost);
  }
}
