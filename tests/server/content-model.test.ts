/**
 * @jest-environment node
 *
 * The schema layer: collections, field keys, widget immutability, ordering, and
 * the destructive-delete rules. Covers `content-modeling`.
 */
import {
  setupTempDatabase,
  migrateTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-db";
import {
  makeCollection,
  makeEntry,
  makeField,
  makeProject,
  makeTenant,
} from "../helpers/content-fixtures";

const { cleanup } = setupTempDatabase();

let collections: typeof import("@/lib/collections/service");
let entries: typeof import("@/lib/entries/service");
let tenant: string;
let project: string;

beforeAll(async () => {
  await migrateTestDatabase();
  collections = await import("@/lib/collections/service");
  entries = await import("@/lib/entries/service");
  tenant = await makeTenant("model@example.com");
  project = await makeProject(tenant, "Site");
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("creating a collection", () => {
  it("creates it in the addressed project with a slug", async () => {
    const result = await collections.createCollection(tenant, project, {
      name: "Blog Post",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection.slug).toBe("blog-post");
    expect(result.collection.project_id).toBe(project);
    expect(result.collection.schema_version).toBe(1);
  });

  it("disambiguates a colliding slug rather than duplicating", async () => {
    const first = await collections.createCollection(tenant, project, {
      name: "Repeat",
    });
    const second = await collections.createCollection(tenant, project, {
      name: "repeat",
    });

    if (!first.ok || !second.ok) throw new Error("creation failed");
    expect(first.collection.slug).toBe("repeat");
    expect(second.collection.slug).toBe("repeat-2");
  });

  it("rejects a whitespace-only name and creates nothing", async () => {
    const before = await collections.listCollections(tenant, project);
    const result = await collections.createCollection(tenant, project, {
      name: "   ",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    await expect(
      collections.listCollections(tenant, project),
    ).resolves.toHaveLength(before.length);
  });

  it("refuses a project the tenant does not own", async () => {
    const other = await makeTenant("other-project@example.com");
    const foreignProject = await makeProject(other, "Theirs");

    const result = await collections.createCollection(tenant, foreignProject, {
      name: "Sneaky",
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(
      collections.listCollections(other, foreignProject),
    ).resolves.toEqual([]);
  });
});

describe("field keys", () => {
  it("accepts a well-formed key and appends the field last", async () => {
    const collection = await makeCollection(tenant, project, "Ordered");

    await makeField(tenant, collection, { key: "a", widget: "string" });
    await makeField(tenant, collection, { key: "b", widget: "string" });
    const third = await makeField(tenant, collection, {
      key: "c",
      widget: "string",
    });

    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.key)).toEqual(["a", "b", "c"]);
    expect(fields.find((field) => field.id === third)?.position).toBe(2);
  });

  it("rejects keys with spaces, uppercase, or a leading digit", async () => {
    const collection = await makeCollection(tenant, project, "Keys");

    for (const key of ["has space", "Upper", "1leading", "-dash", ""]) {
      const result = await collections.createField(tenant, collection, {
        key,
        label: "Whatever",
        widget: "string",
        config: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe("INVALID");
      if (result.error === "INVALID") expect(result.fieldErrors.key).toBeDefined();
    }

    await expect(collections.listFields(tenant, collection)).resolves.toEqual([]);
  });

  it("rejects a duplicate key within one collection", async () => {
    const collection = await makeCollection(tenant, project, "Dupes");
    await makeField(tenant, collection, { key: "title", widget: "string" });

    const result = await collections.createField(tenant, collection, {
      key: "title",
      label: "Title Again",
      widget: "string",
      config: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors.key?.[0]).toMatch(/already exists/i);
  });

  it("permits the same key in a different collection", async () => {
    const one = await makeCollection(tenant, project, "Scope One");
    const two = await makeCollection(tenant, project, "Scope Two");

    // Keys are unique per collection, not per project.
    await expect(
      makeField(tenant, one, { key: "title", widget: "string" }),
    ).resolves.toBeTruthy();
    await expect(
      makeField(tenant, two, { key: "title", widget: "string" }),
    ).resolves.toBeTruthy();
  });
});

describe("widget type immutability", () => {
  it("refuses to change a field's widget and leaves the original in place", async () => {
    const collection = await makeCollection(tenant, project, "Immutable");
    const field = await makeField(tenant, collection, {
      key: "amount",
      widget: "string",
    });

    const result = await collections.updateField(tenant, collection, field, {
      key: "amount",
      label: "Amount",
      required: false,
      widget: "number",
      config: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors.widget?.[0]).toMatch(/cannot be changed/i);

    const after = await collections.findField(tenant, collection, field);
    expect(after?.widget).toBe("string");
  });

  it("allows an update that resubmits the same widget", async () => {
    const collection = await makeCollection(tenant, project, "Same Widget");
    const field = await makeField(tenant, collection, {
      key: "amount",
      widget: "number",
    });

    const result = await collections.updateField(tenant, collection, field, {
      key: "amount",
      label: "Amount",
      required: true,
      widget: "number",
      config: { valueType: "int", max: 10 },
    });

    expect(result.ok).toBe(true);
  });
});

describe("renaming a field", () => {
  it("leaves every stored value intact", async () => {
    const collection = await makeCollection(tenant, project, "Renames");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "text",
    });

    const entry = await makeEntry(tenant, collection, {
      [title]: "Hello",
      [body]: "Some body copy.",
    });

    const result = await collections.updateField(tenant, collection, title, {
      key: "headline",
      label: "Headline",
      required: false,
      config: {},
    });
    expect(result.ok).toBe(true);

    // Values are keyed by field id, so a key or label change moves nothing.
    const after = await entries.findEntry(tenant, collection, entry);
    expect(after?.values[title]).toBe("Hello");
    expect(after?.values[body]).toBe("Some body copy.");
  });

  it("bumps the collection's schema version", async () => {
    const collection = await makeCollection(tenant, project, "Versioned");
    const before = await collections.findCollectionById(tenant, collection);

    await makeField(tenant, collection, { key: "title", widget: "string" });

    const after = await collections.findCollectionById(tenant, collection);
    expect(after!.schema_version).toBeGreaterThan(before!.schema_version);
  });
});

describe("reordering fields", () => {
  it("persists the submitted order and bumps the schema version", async () => {
    const collection = await makeCollection(tenant, project, "Reorder");
    const a = await makeField(tenant, collection, { key: "a", widget: "string" });
    const b = await makeField(tenant, collection, { key: "b", widget: "string" });
    const c = await makeField(tenant, collection, { key: "c", widget: "string" });

    const before = await collections.findCollectionById(tenant, collection);

    const result = await collections.reorderFields(tenant, collection, [a, c, b]);
    expect(result.ok).toBe(true);

    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.id)).toEqual([a, c, b]);
    expect(fields.map((field) => field.position)).toEqual([0, 1, 2]);

    const after = await collections.findCollectionById(tenant, collection);
    expect(after!.schema_version).toBeGreaterThan(before!.schema_version);
  });

  it("is idempotent when the same order is submitted twice", async () => {
    const collection = await makeCollection(tenant, project, "Idempotent");
    const a = await makeField(tenant, collection, { key: "a", widget: "string" });
    const b = await makeField(tenant, collection, { key: "b", widget: "string" });

    await collections.reorderFields(tenant, collection, [b, a]);
    await collections.reorderFields(tenant, collection, [b, a]);

    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.id)).toEqual([b, a]);
  });

  it("refuses a foreign field id and changes no order", async () => {
    const collection = await makeCollection(tenant, project, "Foreign");
    const other = await makeCollection(tenant, project, "Foreign Source");

    const a = await makeField(tenant, collection, { key: "a", widget: "string" });
    const b = await makeField(tenant, collection, { key: "b", widget: "string" });
    const outsider = await makeField(tenant, other, {
      key: "x",
      widget: "string",
    });

    const result = await collections.reorderFields(tenant, collection, [
      outsider,
      a,
      b,
    ]);

    expect(result.ok).toBe(false);
    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.id)).toEqual([a, b]);
  });

  it("refuses a partial or duplicated id list", async () => {
    const collection = await makeCollection(tenant, project, "Partial");
    const a = await makeField(tenant, collection, { key: "a", widget: "string" });
    const b = await makeField(tenant, collection, { key: "b", widget: "string" });

    await expect(
      collections.reorderFields(tenant, collection, [a]),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      collections.reorderFields(tenant, collection, [a, a]),
    ).resolves.toMatchObject({ ok: false });

    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.id)).toEqual([a, b]);
  });
});

describe("deleting a field", () => {
  it("counts the affected entries for the confirmation", async () => {
    const collection = await makeCollection(tenant, project, "Counted");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });

    for (const name of ["One", "Two", "Three"]) {
      await makeEntry(tenant, collection, { [title]: name });
    }

    await expect(
      collections.countFieldValues(tenant, collection, title),
    ).resolves.toBe(3);
  });

  it("deletes exactly its values and leaves siblings intact", async () => {
    const collection = await makeCollection(tenant, project, "Cascade");
    const a = await makeField(tenant, collection, { key: "a", widget: "string" });
    const b = await makeField(tenant, collection, { key: "b", widget: "string" });
    const c = await makeField(tenant, collection, { key: "c", widget: "string" });

    const entry = await makeEntry(tenant, collection, {
      [a]: "A value",
      [b]: "B value",
      [c]: "C value",
    });

    const result = await collections.deleteField(tenant, collection, b);
    expect(result.ok).toBe(true);

    const after = await entries.findEntry(tenant, collection, entry);
    expect(after?.values[a]).toBe("A value");
    expect(after?.values[c]).toBe("C value");
    expect(after?.values[b]).toBeUndefined();

    // No orphaned value rows survive the cascade.
    await expect(
      collections.countFieldValues(tenant, collection, b),
    ).resolves.toBe(0);
    await expect(
      collections.findField(tenant, collection, b),
    ).resolves.toBeUndefined();
  });

  it("clears the designation when the deleted field was the title field", async () => {
    const collection = await makeCollection(tenant, project, "Title Delete");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });

    await collections.setTitleField(tenant, collection, title);
    const designated = await collections.findCollectionById(tenant, collection);
    expect(designated!.title_field_id).toBe(title);

    await collections.deleteField(tenant, collection, title);

    const after = await collections.findCollectionById(tenant, collection);
    expect(after!.title_field_id).toBeNull();
    // The entry list falls back rather than erroring.
    await expect(entries.listEntries(tenant, collection)).resolves.toEqual([]);
  });
});

describe("resolving the display title field", () => {
  it("prefers the designated field", async () => {
    const collection = await makeCollection(tenant, project, "Designated");
    await makeField(tenant, collection, { key: "first", widget: "string" });
    const chosen = await makeField(tenant, collection, {
      key: "second",
      widget: "string",
    });

    await collections.setTitleField(tenant, collection, chosen);

    const record = await collections.findCollectionById(tenant, collection);
    const fields = await collections.listFields(tenant, collection);
    expect(collections.resolveTitleField(record!, fields)?.id).toBe(chosen);
  });

  it("falls back to the first string field by position", async () => {
    const collection = await makeCollection(tenant, project, "Fallback");
    await makeField(tenant, collection, { key: "flag", widget: "boolean" });
    const firstString = await makeField(tenant, collection, {
      key: "name",
      widget: "string",
    });
    await makeField(tenant, collection, { key: "other", widget: "string" });

    const record = await collections.findCollectionById(tenant, collection);
    const fields = await collections.listFields(tenant, collection);
    expect(collections.resolveTitleField(record!, fields)?.id).toBe(firstString);
  });

  it("resolves to nothing when no string field exists", async () => {
    const collection = await makeCollection(tenant, project, "No String");
    await makeField(tenant, collection, { key: "flag", widget: "boolean" });

    const record = await collections.findCollectionById(tenant, collection);
    const fields = await collections.listFields(tenant, collection);
    expect(collections.resolveTitleField(record!, fields)).toBeUndefined();
  });

  it("refuses to designate a field from another collection", async () => {
    const collection = await makeCollection(tenant, project, "Designate Guard");
    const other = await makeCollection(tenant, project, "Designate Source");
    const outsider = await makeField(tenant, other, {
      key: "title",
      widget: "string",
    });

    await expect(
      collections.setTitleField(tenant, collection, outsider),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
