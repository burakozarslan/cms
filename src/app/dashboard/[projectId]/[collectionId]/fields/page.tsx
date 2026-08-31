import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { Button, Card, CardBody, CardTitle, Select } from "@frontend/ui";
import { countActiveApiKeys } from "@/lib/api-keys/service";
import { requireSession } from "@/lib/auth";
import {
  countValuesByField,
  findCollection,
  listCollections,
  listFields,
} from "@/lib/collections/service";
import { findProject } from "@/lib/projects/service";

import { setTitleFieldAction } from "../actions";
import { FieldForm } from "../field-form";
import { FieldList, type FieldView } from "../field-list";

type Params = {
  params: Promise<{ projectId: string; collectionId: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const session = await requireSession();
  if (!session) return { title: "Fields" };

  const { projectId, collectionId } = await params;
  const collection = await findCollection(
    session.user.tenantId,
    projectId,
    collectionId,
  );

  return { title: collection ? `${collection.name} fields` : "Fields" };
}

export default async function FieldBuilderPage({ params }: Params) {
  const session = await requireSession();
  if (!session) redirect("/login");

  const { projectId, collectionId } = await params;
  const tenantId = session.user.tenantId;

  const project = await findProject(tenantId, projectId);
  if (!project) notFound();

  // Containment: the collection must belong to the addressed project, not just
  // to this tenant.
  const collection = await findCollection(tenantId, projectId, collectionId);
  if (!collection) notFound();

  const fields = await listFields(tenantId, collectionId);
  const valueCounts = await countValuesByField(tenantId, collectionId);

  // Drives the rename warning: a field's `key` is the content API's
  // identifier once the project is consumed externally (design.md decision 5).
  const activeApiKeyCount = await countActiveApiKeys(tenantId, projectId);

  // The only valid `relationship` targets: other collections in this project
  // (design decision 7 — same-project, no self-reference).
  const projectCollections = await listCollections(tenantId, projectId);
  const relationshipTargets = projectCollections
    .filter((candidate) => candidate.id !== collectionId)
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));

  const views: FieldView[] = fields.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    widget: field.widget,
    required: field.required,
    ok: field.ok,
    reason: field.ok ? undefined : field.reason,
    config: field.ok ? (field.config as Record<string, unknown>) : {},
    valueCount: valueCounts.get(field.id) ?? 0,
  }));

  const titleCandidates = fields.filter((field) => field.ok);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/dashboard/${projectId}/${collectionId}`}
          className="link link-primary text-sm"
        >
          ← {collection.name}
        </Link>
        <h1 className="text-xl font-semibold">Fields</h1>
        <p className="text-base-content/70 text-sm">
          Fields define the shape of every entry in this collection. Drag a field
          — or use the arrows — to change the order entries are edited in.
        </p>
      </div>

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">Field order</CardTitle>
          <FieldList
            projectId={projectId}
            collectionId={collectionId}
            fields={views}
            titleFieldId={collection.title_field_id}
            relationshipTargets={relationshipTargets}
            hasActiveApiKeys={activeApiKeyCount > 0}
          />
        </CardBody>
      </Card>

      {titleCandidates.length > 0 ? (
        <Card className="bg-base-100 shadow-sm">
          <CardBody className="gap-3">
            <CardTitle className="text-base">Display title</CardTitle>
            <p className="text-base-content/70 text-sm">
              The field whose value labels an entry in lists. Without one,
              entries fall back to the first text field, then their slug.
            </p>

            <form action={setTitleFieldAction} className="flex items-end gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="collectionId" value={collectionId} />

              <Select
                label="Title field"
                name="fieldId"
                defaultValue={collection.title_field_id ?? ""}
                className="max-w-xs"
              >
                <option value="">No designated field</option>
                {titleCandidates.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </Select>

              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card className="bg-base-100 shadow-sm">
        <CardBody className="gap-4">
          <CardTitle className="text-base">Add a field</CardTitle>
          <FieldForm
            projectId={projectId}
            collectionId={collectionId}
            relationshipTargets={relationshipTargets}
          />
        </CardBody>
      </Card>
    </div>
  );
}
