import type { WidgetType } from "@/lib/widgets";

/**
 * Fixture builders for the content model.
 *
 * Deliberately go through the real service layer rather than raw inserts, so
 * the fixtures exercise the same tenant scoping and validation the app does.
 */
export async function makeTenant(email: string): Promise<string> {
  const { registerTenant } = await import("@/lib/tenants/register");
  const result = await registerTenant({ email, password: "a good password" });
  if (!result.ok) throw new Error(`fixture tenant failed: ${email}`);
  return result.tenantId;
}

export async function makeProject(
  tenantId: string,
  name: string,
): Promise<string> {
  const { createProject } = await import("@/lib/projects/service");
  const result = await createProject(tenantId, { name });
  if (!result.ok) throw new Error(`fixture project failed: ${name}`);
  return result.project.id;
}

export async function makeCollection(
  tenantId: string,
  projectId: string,
  name: string,
): Promise<string> {
  const { createCollection } = await import("@/lib/collections/service");
  const result = await createCollection(tenantId, projectId, { name });
  if (!result.ok) throw new Error(`fixture collection failed: ${name}`);
  return result.collection.id;
}

export async function makeField(
  tenantId: string,
  collectionId: string,
  input: {
    key: string;
    label?: string;
    widget: WidgetType;
    config?: unknown;
    required?: boolean;
  },
): Promise<string> {
  const { createField } = await import("@/lib/collections/service");
  const result = await createField(tenantId, collectionId, {
    key: input.key,
    label: input.label ?? input.key,
    widget: input.widget,
    config: input.config ?? {},
    required: input.required ?? false,
  });
  if (!result.ok) {
    throw new Error(
      `fixture field failed: ${input.key} — ${JSON.stringify(result)}`,
    );
  }
  return result.field.id;
}

export async function makeEntry(
  tenantId: string,
  collectionId: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { createEntry } = await import("@/lib/entries/service");
  const result = await createEntry(tenantId, collectionId, { values });
  if (!result.ok) {
    throw new Error(`fixture entry failed — ${JSON.stringify(result)}`);
  }
  return result.entry.id;
}
