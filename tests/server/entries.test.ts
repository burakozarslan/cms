/**
 * @jest-environment node
 *
 * The content layer: server-side value validation, slugs, status, and the
 * bounded-query entry list. Covers `content-entries`.
 */
import SQLite from "better-sqlite3";

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
  tenant = await makeTenant("entries@example.com");
  project = await makeProject(tenant, "Site");
});

afterAll(async () => {
  await destroyTestDatabase();
  cleanup();
});

describe("creating and editing entries", () => {
  it("stores each value against its field", async () => {
    const collection = await makeCollection(tenant, project, "Posts");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const published = await makeField(tenant, collection, {
      key: "published",
      widget: "boolean",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "Hello World", [published]: true },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[title]).toBe("Hello World");
    expect(result.entry.values[published]).toBe(true);
  });

  it("changes one value and leaves the others alone", async () => {
    const collection = await makeCollection(tenant, project, "Edits");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "text",
    });

    const entry = await makeEntry(tenant, collection, {
      [title]: "First",
      [body]: "Body copy",
    });

    const result = await entries.updateEntry(tenant, collection, entry, {
      values: { [title]: "Second", [body]: "Body copy" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[title]).toBe("Second");
    expect(result.entry.values[body]).toBe("Body copy");
  });

  it("saves with an optional field left blank and reads it back empty", async () => {
    const collection = await makeCollection(tenant, project, "Optional");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const note = await makeField(tenant, collection, {
      key: "note",
      widget: "text",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "Has title", [note]: "" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A blank optional field stores no row at all, rather than an empty string.
    expect(result.entry.values[note]).toBeUndefined();
  });

  it("persists nothing when validation fails", async () => {
    const collection = await makeCollection(tenant, project, "Atomic");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const count = await makeField(tenant, collection, {
      key: "count",
      widget: "number",
      config: { max: 10 },
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "Should not persist", [count]: 99 },
    });

    expect(result.ok).toBe(false);
    await expect(entries.listEntries(tenant, collection)).resolves.toEqual([]);
  });
});

describe("richtext values", () => {
  const doc = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 1,
              mode: "normal",
              style: "",
              text: "Hello, world",
              type: "text",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };

  const emptyDoc = {
    root: {
      children: [
        {
          children: [],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };

  it("stores and reads back a document unchanged", async () => {
    const collection = await makeCollection(tenant, project, "Articles");
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "richtext",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [body]: doc },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[body]).toEqual(doc);
  });

  it("rejects a value that is not a well-formed document", async () => {
    const collection = await makeCollection(tenant, project, "Malformed");
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "richtext",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [body]: { not: "a document" } },
    });

    expect(result.ok).toBe(false);
  });

  it("names the field when a required richtext value is an untouched empty document", async () => {
    const collection = await makeCollection(tenant, project, "RequiredBody");
    const body = await makeField(tenant, collection, {
      key: "body",
      label: "Body",
      widget: "richtext",
      required: true,
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [body]: emptyDoc },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[body]?.[0]).toMatch(/Body is required/);
  });

  it("accepts a required richtext field once it has visible text", async () => {
    const collection = await makeCollection(tenant, project, "RequiredBodyOk");
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "richtext",
      required: true,
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [body]: doc },
    });

    expect(result.ok).toBe(true);
  });

  it("stores no row for an optional richtext field left as an untouched empty document", async () => {
    const collection = await makeCollection(tenant, project, "OptionalBody");
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "richtext",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [body]: emptyDoc },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[body]).toBeUndefined();
  });
});

describe("relationship values", () => {
  it("accepts a reference to an entry that exists in the target collection", async () => {
    const author = await makeCollection(tenant, project, "Author RV1");
    const authorName = await makeField(tenant, author, {
      key: "name",
      widget: "string",
    });
    const authorEntry = await makeEntry(tenant, author, {
      [authorName]: "Jane Doe",
    });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV1");
    const authorField = await makeField(tenant, blogPost, {
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: author },
    });

    const result = await entries.createEntry(tenant, blogPost, {
      values: { [authorField]: authorEntry },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[authorField]).toBe(authorEntry);
  });

  it("rejects a reference to an entry that belongs to a different collection", async () => {
    const author = await makeCollection(tenant, project, "Author RV2");
    const other = await makeCollection(tenant, project, "Other RV2");
    const otherField = await makeField(tenant, other, {
      key: "name",
      widget: "string",
    });
    const otherEntry = await makeEntry(tenant, other, {
      [otherField]: "Not an author",
    });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV2");
    const authorField = await makeField(tenant, blogPost, {
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: author },
    });

    const result = await entries.createEntry(tenant, blogPost, {
      values: { [authorField]: otherEntry },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[authorField]).toBeDefined();
  });

  it("rejects a reference to an entry id that does not exist", async () => {
    const author = await makeCollection(tenant, project, "Author RV3");
    const blogPost = await makeCollection(tenant, project, "Blog Post RV3");
    const authorField = await makeField(tenant, blogPost, {
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: author },
    });

    const result = await entries.createEntry(tenant, blogPost, {
      values: { [authorField]: "does-not-exist" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
  });

  it("in multiple mode, accepts several valid references", async () => {
    const tag = await makeCollection(tenant, project, "Tag RV4");
    const tagName = await makeField(tenant, tag, { key: "name", widget: "string" });
    const tagOne = await makeEntry(tenant, tag, { [tagName]: "News" });
    const tagTwo = await makeEntry(tenant, tag, { [tagName]: "Updates" });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV4");
    const tagsField = await makeField(tenant, blogPost, {
      key: "tags",
      widget: "relationship",
      config: { targetCollectionId: tag, multiple: true },
    });

    const result = await entries.createEntry(tenant, blogPost, {
      values: { [tagsField]: [tagOne, tagTwo] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.values[tagsField]).toEqual([tagOne, tagTwo]);
  });

  it("in multiple mode, reports the invalid ids in a mix of valid and invalid", async () => {
    const tag = await makeCollection(tenant, project, "Tag RV5");
    const tagName = await makeField(tenant, tag, { key: "name", widget: "string" });
    const validTag = await makeEntry(tenant, tag, { [tagName]: "Valid" });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV5");
    const tagsField = await makeField(tenant, blogPost, {
      key: "tags",
      widget: "relationship",
      config: { targetCollectionId: tag, multiple: true },
    });

    const result = await entries.createEntry(tenant, blogPost, {
      values: { [tagsField]: [validTag, "not-real"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[tagsField]).toBeDefined();
  });

  it("leaves a dangling value in place, unresolved, after the referenced entry is deleted", async () => {
    const author = await makeCollection(tenant, project, "Author RV6");
    const authorName = await makeField(tenant, author, {
      key: "name",
      widget: "string",
    });
    const authorEntry = await makeEntry(tenant, author, {
      [authorName]: "Deleted Later",
    });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV6");
    const authorField = await makeField(tenant, blogPost, {
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: author },
    });
    const post = await makeEntry(tenant, blogPost, {
      [authorField]: authorEntry,
    });

    await entries.deleteEntry(tenant, author, authorEntry);

    // Reading the entry back does not throw or drop the field — it still
    // holds the id, now unresolvable. The picker/render layer decides what
    // to show for it (design decision 3).
    const reread = await entries.findEntry(tenant, blogPost, post);
    expect(reread?.values[authorField]).toBe(authorEntry);
  });

  it("lists an entry's own entries as options, or undefined when the collection is gone", async () => {
    const author = await makeCollection(tenant, project, "Author RV7");
    const authorName = await makeField(tenant, author, {
      key: "name",
      widget: "string",
    });
    const authorEntry = await makeEntry(tenant, author, {
      [authorName]: "Listed",
    });

    await expect(entries.listEntryOptions(tenant, author)).resolves.toEqual([
      { id: authorEntry, label: "Listed" },
    ]);

    await collections.deleteCollection(tenant, project, author);

    await expect(
      entries.listEntryOptions(tenant, author),
    ).resolves.toBeUndefined();
  });

  it("counts other entries referencing a given entry, for the delete warning", async () => {
    const author = await makeCollection(tenant, project, "Author RV8");
    const authorName = await makeField(tenant, author, {
      key: "name",
      widget: "string",
    });
    const authorEntry = await makeEntry(tenant, author, {
      [authorName]: "Referenced",
    });

    await expect(
      entries.countEntriesReferencing(tenant, authorEntry),
    ).resolves.toBe(0);

    const blogPost = await makeCollection(tenant, project, "Blog Post RV8");
    const authorField = await makeField(tenant, blogPost, {
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: author },
    });
    await makeEntry(tenant, blogPost, { [authorField]: authorEntry });
    await makeEntry(tenant, blogPost, { [authorField]: authorEntry });

    await expect(
      entries.countEntriesReferencing(tenant, authorEntry),
    ).resolves.toBe(2);
  });

  it("counts a single reference through a multiple-mode field once per referencing entry", async () => {
    const tag = await makeCollection(tenant, project, "Tag RV9");
    const tagName = await makeField(tenant, tag, { key: "name", widget: "string" });
    const targetTag = await makeEntry(tenant, tag, { [tagName]: "Target" });

    const blogPost = await makeCollection(tenant, project, "Blog Post RV9");
    const tagsField = await makeField(tenant, blogPost, {
      key: "tags",
      widget: "relationship",
      config: { targetCollectionId: tag, multiple: true },
    });
    await makeEntry(tenant, blogPost, { [tagsField]: [targetTag] });

    await expect(
      entries.countEntriesReferencing(tenant, targetTag),
    ).resolves.toBe(1);
  });
});

describe("server-side value validation", () => {
  it("rejects a number beyond its configured maximum", async () => {
    const collection = await makeCollection(tenant, project, "Bounds");
    const count = await makeField(tenant, collection, {
      key: "count",
      widget: "number",
      config: { max: 10 },
    });

    // The browser input would have capped this; the server does not care.
    const result = await entries.createEntry(tenant, collection, {
      values: { [count]: 99 },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[count]?.[0]).toMatch(/at most 10/i);
  });

  it("rejects a select value outside the configured options", async () => {
    const collection = await makeCollection(tenant, project, "Options");
    const choice = await makeField(tenant, collection, {
      key: "choice",
      widget: "select",
      config: {
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
          { label: "C", value: "c" },
        ],
      },
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [choice]: "z" },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[choice]).toBeDefined();
  });

  it("rejects a fractional value on an integer field", async () => {
    const collection = await makeCollection(tenant, project, "Integers");
    const count = await makeField(tenant, collection, {
      key: "count",
      widget: "number",
      config: { valueType: "int" },
    });

    await expect(
      entries.createEntry(tenant, collection, { values: { [count]: 3.5 } }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      entries.createEntry(tenant, collection, { values: { [count]: 3 } }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects an unparseable datetime", async () => {
    const collection = await makeCollection(tenant, project, "Dates");
    const when = await makeField(tenant, collection, {
      key: "when",
      widget: "datetime",
    });

    await expect(
      entries.createEntry(tenant, collection, {
        values: { [when]: "the day before yesterday" },
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      entries.createEntry(tenant, collection, {
        values: { [when]: "2026-03-04T10:30:00Z" },
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a value keyed to a field in another collection", async () => {
    const collection = await makeCollection(tenant, project, "Own");
    const other = await makeCollection(tenant, project, "Other");
    const mine = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const theirs = await makeField(tenant, other, {
      key: "title",
      widget: "string",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [mine]: "Fine", [theirs]: "Smuggled" },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[theirs]?.[0]).toMatch(/does not belong/i);
    // Nothing is written, not even the legitimate value.
    await expect(entries.listEntries(tenant, collection)).resolves.toEqual([]);
  });

  it("names the field when a required value is missing", async () => {
    const collection = await makeCollection(tenant, project, "Required");
    const title = await makeField(tenant, collection, {
      key: "title",
      label: "Headline",
      widget: "string",
      required: true,
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "   " },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "INVALID") return;
    expect(result.fieldErrors[title]?.[0]).toMatch(/Headline is required/);
  });

  it("validates against the current field definitions, not the ones the editor loaded", async () => {
    const collection = await makeCollection(tenant, project, "Live Schema");
    const count = await makeField(tenant, collection, {
      key: "count",
      widget: "number",
      config: { max: 100 },
    });

    // A value the editor was rendered against, and would have permitted.
    await expect(
      entries.createEntry(tenant, collection, { values: { [count]: 50 } }),
    ).resolves.toMatchObject({ ok: true });

    // The field is tightened while that editor is still open.
    const tightened = await collections.updateField(tenant, collection, count, {
      key: "count",
      label: "count",
      required: false,
      config: { max: 10 },
    });
    expect(tightened.ok).toBe(true);

    // The stale editor's save is validated against the new configuration.
    await expect(
      entries.createEntry(tenant, collection, { values: { [count]: 50 } }),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("a field made required after entries exist", () => {
  it("leaves existing entries listable and openable", async () => {
    const collection = await makeCollection(tenant, project, "Retro");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const note = await makeField(tenant, collection, {
      key: "note",
      widget: "text",
    });

    const entry = await makeEntry(tenant, collection, { [title]: "Existing" });

    await collections.updateField(tenant, collection, note, {
      key: "note",
      label: "Note",
      required: true,
      config: {},
    });

    // Validation runs at save time only, so nothing retroactively breaks.
    await expect(entries.listEntries(tenant, collection)).resolves.toHaveLength(1);
    await expect(
      entries.findEntry(tenant, collection, entry),
    ).resolves.toBeDefined();
  });

  it("blocks that entry's next save until the field is supplied", async () => {
    const collection = await makeCollection(tenant, project, "Retro Save");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const note = await makeField(tenant, collection, {
      key: "note",
      widget: "text",
    });

    const entry = await makeEntry(tenant, collection, { [title]: "Existing" });

    await collections.updateField(tenant, collection, note, {
      key: "note",
      label: "Note",
      required: true,
      config: {},
    });

    await expect(
      entries.updateEntry(tenant, collection, entry, {
        values: { [title]: "Existing" },
      }),
    ).resolves.toMatchObject({ ok: false });

    await expect(
      entries.updateEntry(tenant, collection, entry, {
        values: { [title]: "Existing", [note]: "Now supplied" },
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("entry slugs", () => {
  it("derives the slug from the title value", async () => {
    const collection = await makeCollection(tenant, project, "Slugs");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    await collections.setTitleField(tenant, collection, title);

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "Hello World" },
    });

    if (!result.ok) throw new Error("creation failed");
    expect(result.entry.slug).toBe("hello-world");
  });

  it("disambiguates a colliding slug", async () => {
    const collection = await makeCollection(tenant, project, "Slug Collide");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });

    const first = await entries.createEntry(tenant, collection, {
      values: { [title]: "Hello World" },
    });
    const second = await entries.createEntry(tenant, collection, {
      values: { [title]: "Hello World" },
    });

    if (!first.ok || !second.ok) throw new Error("creation failed");
    expect(first.entry.slug).toBe("hello-world");
    expect(second.entry.slug).toBe("hello-world-2");
  });

  it("keeps the slug stable when the title is edited", async () => {
    const collection = await makeCollection(tenant, project, "Slug Stable");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });

    const created = await entries.createEntry(tenant, collection, {
      values: { [title]: "Original Title" },
    });
    if (!created.ok) throw new Error("creation failed");

    const updated = await entries.updateEntry(
      tenant,
      collection,
      created.entry.id,
      { values: { [title]: "A Completely Different Title" } },
    );

    if (!updated.ok) throw new Error("update failed");
    expect(updated.entry.slug).toBe("original-title");
  });

  it("falls back to a generated slug when there is no usable title", async () => {
    const collection = await makeCollection(tenant, project, "Slug Fallback");
    const flag = await makeField(tenant, collection, {
      key: "flag",
      widget: "boolean",
    });

    const first = await entries.createEntry(tenant, collection, {
      values: { [flag]: true },
    });
    const second = await entries.createEntry(tenant, collection, {
      values: { [flag]: false },
    });

    if (!first.ok || !second.ok) throw new Error("creation failed");
    expect(first.entry.slug).toBe("entry");
    expect(second.entry.slug).toBe("entry-2");
  });
});

describe("entry status", () => {
  it("defaults a new entry to draft", async () => {
    const collection = await makeCollection(tenant, project, "Status");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });

    const result = await entries.createEntry(tenant, collection, {
      values: { [title]: "Draft by default" },
    });

    if (!result.ok) throw new Error("creation failed");
    expect(result.entry.status).toBe("draft");
  });

  it("publishes, and reflects it in the list", async () => {
    const collection = await makeCollection(tenant, project, "Publish");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const entry = await makeEntry(tenant, collection, { [title]: "Publish me" });

    await expect(
      entries.setEntryStatus(tenant, collection, entry, "published"),
    ).resolves.toMatchObject({ ok: true });

    const list = await entries.listEntries(tenant, collection);
    expect(list[0].status).toBe("published");
  });

  it("rejects a status outside draft and published", async () => {
    const collection = await makeCollection(tenant, project, "Bad Status");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const entry = await makeEntry(tenant, collection, { [title]: "Steady" });

    await expect(
      entries.setEntryStatus(tenant, collection, entry, "archived"),
    ).resolves.toMatchObject({ ok: false });

    const after = await entries.findEntry(tenant, collection, entry);
    expect(after?.status).toBe("draft");
  });
});

describe("the entry list", () => {
  it("labels each entry with its own title value", async () => {
    const collection = await makeCollection(tenant, project, "Labelled");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    await collections.setTitleField(tenant, collection, title);

    await makeEntry(tenant, collection, { [title]: "Alpha" });
    await makeEntry(tenant, collection, { [title]: "Beta" });

    const list = await entries.listEntries(tenant, collection);
    expect(list.map((item) => item.title).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("falls back to the slug, then a placeholder", async () => {
    const collection = await makeCollection(tenant, project, "Unlabelled");
    const flag = await makeField(tenant, collection, {
      key: "flag",
      widget: "boolean",
    });

    await makeEntry(tenant, collection, { [flag]: true });

    const list = await entries.listEntries(tenant, collection);
    expect(list[0].title).toBe("entry");
  });

  it("issues a query count independent of the number of entries", async () => {
    const collection = await makeCollection(tenant, project, "N Plus One");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    await collections.setTitleField(tenant, collection, title);

    // Count real prepared statements: the title value lives in entry_values, so
    // a naive implementation would issue one lookup per entry.
    const prepare = jest.spyOn(SQLite.prototype, "prepare");

    await makeEntry(tenant, collection, { [title]: "Only one" });
    prepare.mockClear();
    await entries.listEntries(tenant, collection);
    const withOne = prepare.mock.calls.length;

    for (let n = 0; n < 25; n += 1) {
      await makeEntry(tenant, collection, { [title]: `Entry ${n}` });
    }

    prepare.mockClear();
    const list = await entries.listEntries(tenant, collection);
    const withMany = prepare.mock.calls.length;

    prepare.mockRestore();

    expect(list).toHaveLength(26);
    expect(withMany).toBe(withOne);
  });

  it("returns an empty list for a collection with no entries", async () => {
    const collection = await makeCollection(tenant, project, "Nothing Yet");
    await expect(entries.listEntries(tenant, collection)).resolves.toEqual([]);
  });
});

describe("deleting an entry", () => {
  it("removes the entry and all its values, leaving the fields alone", async () => {
    const collection = await makeCollection(tenant, project, "Entry Delete");
    const title = await makeField(tenant, collection, {
      key: "title",
      widget: "string",
    });
    const body = await makeField(tenant, collection, {
      key: "body",
      widget: "text",
    });

    const entry = await makeEntry(tenant, collection, {
      [title]: "Doomed",
      [body]: "Some body",
    });

    await expect(
      entries.deleteEntry(tenant, collection, entry),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      entries.findEntry(tenant, collection, entry),
    ).resolves.toBeUndefined();
    await expect(
      collections.countFieldValues(tenant, collection, title),
    ).resolves.toBe(0);

    // Field definitions survive an entry deletion.
    const fields = await collections.listFields(tenant, collection);
    expect(fields.map((field) => field.key)).toEqual(["title", "body"]);
  });
});
