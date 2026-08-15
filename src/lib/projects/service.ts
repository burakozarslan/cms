import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getTenantDb } from "@/lib/db/client";

import { nextAvailableSlug, slugify } from "./slug";

export const projectNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a project name.")
    .max(80, "Project names are limited to 80 characters."),
});

export type Project = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type CreateProjectResult =
  | { ok: true; project: Project }
  | { ok: false; error: "INVALID"; fieldErrors: Record<string, string[]> };

export type MutationResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

const NOT_FOUND: MutationResult = { ok: false, error: "NOT_FOUND" };

/** All projects owned by the acting tenant. Scoping is automatic. */
export function listProjects(tenantId: string): Promise<Project[]> {
  return getTenantDb(tenantId)
    .selectFrom("projects")
    .select(["id", "name", "slug", "created_at"])
    .orderBy("created_at", "asc")
    .execute();
}

/**
 * Look up one project by id.
 *
 * `projectId` comes from the URL, so it is untrusted — but the query runs on a
 * tenant-scoped handle, so a project belonging to another tenant simply does
 * not come back. Existence and ownership are the same check.
 */
export function findProject(
  tenantId: string,
  projectId: string,
): Promise<Project | undefined> {
  return getTenantDb(tenantId)
    .selectFrom("projects")
    .select(["id", "name", "slug", "created_at"])
    .where("id", "=", projectId)
    .executeTakeFirst();
}

export async function createProject(
  tenantId: string,
  input: unknown,
): Promise<CreateProjectResult> {
  const parsed = projectNameSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name } = parsed.data;
  const db = getTenantDb(tenantId);

  const taken = await db.selectFrom("projects").select("slug").execute();
  const slug = nextAvailableSlug(
    slugify(name),
    new Set(taken.map((row) => row.slug)),
  );

  const id = randomUUID();

  // tenant_id is injected by the tenant-scoped handle.
  await db.insertInto("projects").values({ id, name, slug }).execute();

  const project = await findProject(tenantId, id);
  if (!project) throw new Error("Project vanished immediately after insert.");

  return { ok: true, project };
}

/** Drives the delete confirmation: "N collections and M entries will be deleted". */
export async function countCollectionsAndEntriesByProject(
  tenantId: string,
  projectId: string,
): Promise<{ collections: number; entries: number }> {
  const db = getTenantDb(tenantId);

  const [collectionsRow, entriesRow] = await Promise.all([
    db
      .selectFrom("collections")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirst(),
    db
      .selectFrom("entries")
      .innerJoin("collections", "collections.id", "entries.collection_id")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("collections.project_id", "=", projectId)
      .executeTakeFirst(),
  ]);

  return {
    collections: Number(collectionsRow?.count ?? 0),
    entries: Number(entriesRow?.count ?? 0),
  };
}

/**
 * Hard-delete a project.
 *
 * `collections.project_id` cascades, which in turn cascades `fields` and
 * `entries`, which cascade `entry_values` — so the project's entire content
 * model goes with it, no orphan can survive.
 */
export async function deleteProject(
  tenantId: string,
  projectId: string,
): Promise<MutationResult> {
  const project = await findProject(tenantId, projectId);
  if (!project) return NOT_FOUND;

  await getTenantDb(tenantId)
    .deleteFrom("projects")
    .where("id", "=", projectId)
    .execute();

  return { ok: true };
}
