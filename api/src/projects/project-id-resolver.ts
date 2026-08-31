import { DrizzleDb } from "../db/drizzle.provider";
import { projects } from "../db/schema";
import {
  findProjectGroup,
  preferredMemberRowId,
  ProjectGroupMeta,
  ProjectRowLike,
} from "./project-groups";

export async function resolveProjectGroup(
  db: DrizzleDb,
  id: string,
): Promise<{ meta: ProjectGroupMeta; rows: ProjectRowLike[] } | null> {
  const all = await db.select().from(projects);
  return findProjectGroup(id, all);
}

export async function resolveProjectRowIds(
  db: DrizzleDb,
  id: string,
): Promise<string[] | null> {
  const group = await resolveProjectGroup(db, id);
  return group ? group.rows.map((r) => r.id) : null;
}

export async function resolvePreferredProjectRowId(
  db: DrizzleDb,
  id: string,
): Promise<string | null> {
  const group = await resolveProjectGroup(db, id);
  return group ? preferredMemberRowId(group.meta, group.rows) : null;
}