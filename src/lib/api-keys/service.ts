import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getTenantDb } from "@/lib/db/client";
import { findProject } from "@/lib/projects/service";

import { displayPrefix, mintToken } from "./token";

export type ApiKey = {
  id: string;
  project_id: string;
  name: string;
  key_id: string;
  mode: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
};

const API_KEY_COLUMNS = [
  "id",
  "project_id",
  "name",
  "key_id",
  "mode",
  "created_at",
  "last_used_at",
  "revoked_at",
  "expires_at",
] as const;

export type FieldErrors = Record<string, string[]>;

export type Failure =
  | { ok: false; error: "INVALID"; fieldErrors: FieldErrors }
  | { ok: false; error: "NOT_FOUND" };

export type MutationResult = { ok: true } | Failure;

const NOT_FOUND: Failure = { ok: false, error: "NOT_FOUND" };

function invalid(fieldErrors: FieldErrors): Failure {
  return { ok: false, error: "INVALID", fieldErrors };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for this key.")
  .max(80, "Key names are limited to 80 characters.");

/** A project's API keys, most recent first. */
export function listApiKeys(
  tenantId: string,
  projectId: string,
): Promise<ApiKey[]> {
  return getTenantDb(tenantId)
    .selectFrom("api_keys")
    .select(API_KEY_COLUMNS)
    .where("project_id", "=", projectId)
    .orderBy("created_at", "desc")
    .execute();
}

/** Active (not revoked) keys — what the field-rename warning checks. */
export async function countActiveApiKeys(
  tenantId: string,
  projectId: string,
): Promise<number> {
  const row = await getTenantDb(tenantId)
    .selectFrom("api_keys")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("project_id", "=", projectId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export type CreateApiKeyResult = { ok: true; apiKey: ApiKey; token: string } | Failure;

/**
 * Create a project-scoped key. The raw token is returned here, in this
 * result, and nowhere else — no other function on this module can produce it
 * (design.md, "Secret is unrecoverable afterwards").
 */
export async function createApiKey(
  tenantId: string,
  projectId: string,
  userId: string,
  input: unknown,
): Promise<CreateApiKeyResult> {
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) {
    return invalid({ name: parsed.error.issues.map((issue) => issue.message) });
  }

  // The project must belong to this tenant; a foreign project id resolves to
  // nothing on the scoped handle — the same containment pattern as
  // `createCollection`.
  const project = await findProject(tenantId, projectId);
  if (!project) return NOT_FOUND;

  const { token, keyId, secretHash, mode } = mintToken("live");
  const id = randomUUID();

  await getTenantDb(tenantId)
    .insertInto("api_keys")
    .values({
      id,
      project_id: projectId,
      name: parsed.data,
      key_id: keyId,
      secret_hash: secretHash,
      mode,
      created_by_user_id: userId,
    })
    .execute();

  const apiKey = await getTenantDb(tenantId)
    .selectFrom("api_keys")
    .select(API_KEY_COLUMNS)
    .where("id", "=", id)
    .executeTakeFirst();

  if (!apiKey) throw new Error("API key vanished immediately after insert.");

  return { ok: true, apiKey, token };
}

/** Revocation is recorded, not erased — the row stays visible as revoked. */
export async function revokeApiKey(
  tenantId: string,
  projectId: string,
  keyId: string,
): Promise<MutationResult> {
  const result = await getTenantDb(tenantId)
    .updateTable("api_keys")
    .set({ revoked_at: new Date().toISOString() })
    .where("id", "=", keyId)
    .where("project_id", "=", projectId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  if (result.numUpdatedRows === 0n) return NOT_FOUND;
  return { ok: true };
}

/** The displayable prefix shown in the key list — never the secret. */
export function apiKeyDisplayPrefix(apiKey: Pick<ApiKey, "mode" | "key_id">): string {
  return displayPrefix(apiKey.mode, apiKey.key_id);
}
