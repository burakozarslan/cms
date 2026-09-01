"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import {
  createField,
  deleteField,
  listFields,
  reorderFields,
  setTitleField,
  updateField,
} from "@/lib/collections/service";
import {
  createEntry,
  deleteEntry,
  listEntryOptions,
  setEntryStatus,
  updateEntry,
} from "@/lib/entries/service";
import {
  compactConfig,
  configFromForm,
  isWidgetType,
  valuesFromForm,
} from "@/lib/widgets";

/**
 * Route ids travel in the form because a server action has no params, but they
 * only ever *narrow* what the acting tenant can reach: every service call takes
 * the tenant from the session, and a foreign id resolves to NOT_FOUND.
 */
type Ids = { projectId: string; collectionId: string };

function ids(formData: FormData): Ids {
  return {
    projectId: String(formData.get("projectId") ?? ""),
    collectionId: String(formData.get("collectionId") ?? ""),
  };
}

function collectionPath({ projectId, collectionId }: Ids): string {
  return `/dashboard/${projectId}/${collectionId}`;
}

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function toState(result: {
  ok: false;
  error: "INVALID" | "NOT_FOUND";
  fieldErrors?: Record<string, string[]>;
}): FormState {
  if (result.error === "NOT_FOUND") {
    return { error: "That item could not be found." };
  }
  return { fieldErrors: result.fieldErrors };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export async function createFieldAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const widget = String(formData.get("widget") ?? "");

  if (!isWidgetType(widget)) {
    return { fieldErrors: { widget: ["Choose a field type."] } };
  }

  const result = await createField(session.user.tenantId, target.collectionId, {
    key: formData.get("key"),
    label: formData.get("label"),
    required: formData.get("required") !== null,
    widget,
    config: compactConfig(configFromForm(widget, formData)),
  });

  if (!result.ok) return toState(result);

  revalidatePath(`${collectionPath(target)}/fields`);
  return {};
}

export async function updateFieldAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const fieldId = String(formData.get("fieldId") ?? "");
  const widget = String(formData.get("widget") ?? "");

  if (!isWidgetType(widget)) {
    return { fieldErrors: { widget: ["Unknown field type."] } };
  }

  const result = await updateField(
    session.user.tenantId,
    target.collectionId,
    fieldId,
    {
      key: formData.get("key"),
      label: formData.get("label"),
      required: formData.get("required") !== null,
      // Resubmitted so a tampered value is *rejected* rather than ignored;
      // the service refuses any change to it.
      widget,
      config: compactConfig(configFromForm(widget, formData)),
    },
  );

  if (!result.ok) return toState(result);

  revalidatePath(`${collectionPath(target)}/fields`);
  return {};
}

export async function deleteFieldAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const fieldId = String(formData.get("fieldId") ?? "");

  await deleteField(session.user.tenantId, target.collectionId, fieldId);

  revalidatePath(`${collectionPath(target)}/fields`);
  redirect(`${collectionPath(target)}/fields`);
}

export type ReorderState = { error?: string };

/**
 * The client sends the complete ordered id list and the server rewrites every
 * position in one transaction. The client applies the move optimistically; this
 * response is what the next render reflects (design decision 10).
 */
export async function reorderFieldsAction(
  projectId: string,
  collectionId: string,
  orderedFieldIds: string[],
): Promise<ReorderState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const result = await reorderFields(
    session.user.tenantId,
    collectionId,
    orderedFieldIds,
  );

  if (!result.ok) {
    return {
      error:
        result.error === "NOT_FOUND"
          ? "That collection could not be found."
          : "The new order could not be saved.",
    };
  }

  revalidatePath(`/dashboard/${projectId}/${collectionId}/fields`);
  return {};
}

export async function setTitleFieldAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const raw = String(formData.get("fieldId") ?? "");

  await setTitleField(
    session.user.tenantId,
    target.collectionId,
    raw === "" ? null : raw,
  );

  revalidatePath(`${collectionPath(target)}/fields`);
  redirect(`${collectionPath(target)}/fields`);
}

/**
 * Options for a `relationship` field's picker.
 *
 * `null` means the target collection itself is unresolvable (deleted since
 * the field was configured) — distinct from an empty array, which means the
 * collection exists but has no entries yet.
 */
export async function listRelationshipOptionsAction(
  targetCollectionId: string,
): Promise<Array<{ id: string; label: string }> | null> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const options = await listEntryOptions(
    session.user.tenantId,
    targetCollectionId,
  );
  return options ?? null;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function createEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);

  // Values are read against the collection's *current* fields, so a stale
  // editor cannot submit against definitions that no longer exist.
  const fields = await listFields(session.user.tenantId, target.collectionId);

  const result = await createEntry(session.user.tenantId, target.collectionId, {
    values: valuesFromForm(fields, formData),
  });

  if (!result.ok) return toState(result);

  revalidatePath(collectionPath(target));
  redirect(`${collectionPath(target)}/${result.entry.id}`);
}

export async function updateEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const entryId = String(formData.get("entryId") ?? "");

  const fields = await listFields(session.user.tenantId, target.collectionId);

  const result = await updateEntry(
    session.user.tenantId,
    target.collectionId,
    entryId,
    { values: valuesFromForm(fields, formData) },
  );

  if (!result.ok) return toState(result);

  revalidatePath(collectionPath(target));
  revalidatePath(`${collectionPath(target)}/${entryId}`);
  return {};
}

export async function setEntryStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const entryId = String(formData.get("entryId") ?? "");

  await setEntryStatus(
    session.user.tenantId,
    target.collectionId,
    entryId,
    formData.get("status"),
  );

  revalidatePath(collectionPath(target));
  revalidatePath(`${collectionPath(target)}/${entryId}`);
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) redirect("/login");

  const target = ids(formData);
  const entryId = String(formData.get("entryId") ?? "");

  await deleteEntry(session.user.tenantId, target.collectionId, entryId);

  revalidatePath(collectionPath(target));
  redirect(collectionPath(target));
}
