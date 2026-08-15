/**
 * @jest-environment node
 *
 * Tenant isolation and parent containment across the content model. Covers
 * `content-modeling` → "Content model access is confined to the owning tenant"
 * and `content-entries` → "Entry access is confined to the owning tenant".
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

let tenantA: string;
let tenantB: string;

/** Tenant B's content, addressed by tenant A in every test below. */
let projectB: string;
let collectionB: string;
let fieldB: string;
let entryB: string;

beforeAll(async () => {
  await migrateTestDatabase();
  collections = await import("@/lib/collections/service");
  entries = await import("@/lib/entries/service");

  tenantA = await makeTenant("a@example.com");
  tenantB = await makeTenant("b@example.com");

  projectB = await makeProject(tenantB, "B Site");
  collectionB = await makeCollection(tenantB, projectB, "B Posts");
  fieldB = await makeField(tenantB, collectionB, {
    key: "title",
    widget: "string",
  });
  entryB = await makeEntry(tenantB, collectionB, { [fieldB]: "B's secret" });
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("cross-tenant reads", () => {
  it("does not list another tenant's collections", async () => {
    await expect(
      collections.listCollections(tenantA, projectB),
    ).resolves.toEqual([]);
  });

  it("does not resolve another tenant's collection by id", async () => {
    await expect(
      collections.findCollectionById(tenantA, collectionB),
    ).resolves.toBeUndefined();
    await expect(
      collections.findCollection(tenantA, projectB, collectionB),
    ).resolves.toBeUndefined();
  });

  it("does not resolve another tenant's field", async () => {
    await expect(
      collections.findField(tenantA, collectionB, fieldB),
    ).resolves.toBeUndefined();
    await expect(collections.listFields(tenantA, collectionB)).resolves.toEqual(
      [],
    );
  });

  it("does not resolve another tenant's entry", async () => {
    await expect(
      entries.findEntry(tenantA, collectionB, entryB),
    ).resolves.toBeUndefined();
    await expect(entries.listEntries(tenantA, collectionB)).resolves.toEqual([]);
  });

  it("does not count another tenant's values", async () => {
    await expect(
      collections.countFieldValues(tenantA, collectionB, fieldB),
    ).resolves.toBe(0);
  });
});

describe("cross-tenant writes", () => {
  it("refuses to add a field to another tenant's collection", async () => {
    const result = await collections.createField(tenantA, collectionB, {
      key: "injected",
      label: "Injected",
      widget: "string",
      config: {},
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    const fields = await collections.listFields(tenantB, collectionB);
    expect(fields.map((field) => field.key)).toEqual(["title"]);
  });

  it("refuses to edit another tenant's field", async () => {
    const result = await collections.updateField(tenantA, collectionB, fieldB, {
      key: "hijacked",
      label: "Hijacked",
      required: false,
      config: {},
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    const field = await collections.findField(tenantB, collectionB, fieldB);
    expect(field?.key).toBe("title");
  });

  it("refuses to delete another tenant's field", async () => {
    const result = await collections.deleteField(tenantA, collectionB, fieldB);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(
      collections.findField(tenantB, collectionB, fieldB),
    ).resolves.toBeDefined();
  });

  it("refuses to reorder another tenant's fields", async () => {
    const result = await collections.reorderFields(tenantA, collectionB, [
      fieldB,
    ]);
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("refuses to create an entry in another tenant's collection", async () => {
    const result = await entries.createEntry(tenantA, collectionB, {
      values: { [fieldB]: "Injected" },
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(entries.listEntries(tenantB, collectionB)).resolves.toHaveLength(
      1,
    );
  });

  it("refuses to edit or delete another tenant's entry, leaving it unchanged", async () => {
    await expect(
      entries.updateEntry(tenantA, collectionB, entryB, {
        values: { [fieldB]: "Overwritten" },
      }),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

    await expect(
      entries.setEntryStatus(tenantA, collectionB, entryB, "published"),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

    await expect(
      entries.deleteEntry(tenantA, collectionB, entryB),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

    const entry = await entries.findEntry(tenantB, collectionB, entryB);
    expect(entry?.values[fieldB]).toBe("B's secret");
    expect(entry?.status).toBe("draft");
  });
});

describe("containment within one tenant", () => {
  it("refuses a collection addressed under the wrong project", async () => {
    const projectOne = await makeProject(tenantA, "One");
    const projectTwo = await makeProject(tenantA, "Two");
    const collection = await makeCollection(tenantA, projectOne, "Posts");

    // Both belong to tenant A, so tenant scoping alone would let this through.
    await expect(
      collections.findCollection(tenantA, projectTwo, collection),
    ).resolves.toBeUndefined();
    await expect(
      collections.findCollection(tenantA, projectOne, collection),
    ).resolves.toBeDefined();
  });

  it("refuses an entry addressed under the wrong collection", async () => {
    const project = await makeProject(tenantA, "Containment");
    const first = await makeCollection(tenantA, project, "First");
    const second = await makeCollection(tenantA, project, "Second");
    const field = await makeField(tenantA, first, {
      key: "title",
      widget: "string",
    });
    const entry = await makeEntry(tenantA, first, { [field]: "Mine" });

    await expect(
      entries.findEntry(tenantA, second, entry),
    ).resolves.toBeUndefined();
    await expect(
      entries.updateEntry(tenantA, second, entry, { values: {} }),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(entries.deleteEntry(tenantA, second, entry)).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });

    // Still intact under its real parent.
    await expect(entries.findEntry(tenantA, first, entry)).resolves.toBeDefined();
  });

  it("refuses a field addressed under the wrong collection", async () => {
    const project = await makeProject(tenantA, "Field Containment");
    const first = await makeCollection(tenantA, project, "First");
    const second = await makeCollection(tenantA, project, "Second");
    const field = await makeField(tenantA, first, {
      key: "title",
      widget: "string",
    });

    await expect(
      collections.findField(tenantA, second, field),
    ).resolves.toBeUndefined();
    await expect(
      collections.deleteField(tenantA, second, field),
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(
      collections.findField(tenantA, first, field),
    ).resolves.toBeDefined();
  });
});

describe("a client-supplied tenant id", () => {
  it("is ignored when creating a collection", async () => {
    const project = await makeProject(tenantA, "Spoof");

    // A form field or query string named tenant_id must not steer ownership;
    // the acting tenant comes from the session argument alone.
    const result = await collections.createCollection(tenantA, project, {
      name: "Spoofed",
      tenant_id: tenantB,
      tenantId: tenantB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(
      collections.findCollectionById(tenantB, result.collection.id),
    ).resolves.toBeUndefined();
    await expect(
      collections.findCollectionById(tenantA, result.collection.id),
    ).resolves.toBeDefined();
  });

  it("is ignored when creating a field", async () => {
    const project = await makeProject(tenantA, "Spoof Field");
    const collection = await makeCollection(tenantA, project, "Posts");

    const result = await collections.createField(tenantA, collection, {
      key: "title",
      label: "Title",
      widget: "string",
      config: {},
      tenant_id: tenantB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(
      collections.findField(tenantB, collection, result.field.id),
    ).resolves.toBeUndefined();
    await expect(
      collections.findField(tenantA, collection, result.field.id),
    ).resolves.toBeDefined();
  });

  it("is ignored when creating an entry", async () => {
    const project = await makeProject(tenantA, "Spoof Entry");
    const collection = await makeCollection(tenantA, project, "Posts");
    const field = await makeField(tenantA, collection, {
      key: "title",
      widget: "string",
    });

    const result = await entries.createEntry(tenantA, collection, {
      values: { [field]: "Mine" },
      tenant_id: tenantB,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(
      entries.findEntry(tenantB, collection, result.entry.id),
    ).resolves.toBeUndefined();
    await expect(
      entries.findEntry(tenantA, collection, result.entry.id),
    ).resolves.toBeDefined();
  });
});
