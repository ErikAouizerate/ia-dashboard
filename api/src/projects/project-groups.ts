import { basename } from "node:path";
import { nominalFromId, nominalId, nominalName } from "./nominal-name";

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

export function findProjectGroup(
  id: string,
  rows: ProjectRowLike[],
): { meta: ProjectGroupMeta; rows: ProjectRowLike[] } | null {
  const groups = groupProjects(rows);
  const nominal = nominalFromId(id);
  let meta: ProjectGroupMeta | undefined;
  if (nominal !== null) {
    meta = groups.find((g) => g.id === id);
  } else {
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    const key = nominalName(basename(row.directory));
    meta = groups.find((g) => g.name === key);
  }
  if (!meta) return null;
  return { meta, rows: rows.filter((r) => meta.directories.includes(r.directory)) };
}

export function preferredMemberRowId(meta: ProjectGroupMeta, rows: ProjectRowLike[]): string {
  const preferred = rows.find((r) => basename(r.directory) === meta.name);
  return (preferred ?? rows[0]).id;
}