/**
 * @jest-environment node
 *
 * `serializeEntry` / `serializeCollection` are pure functions over
 * already-fetched rows — every scenario in the `content-delivery-api` delta
 * spec's serialization requirement, exercised without a database.
 */
import {
  serializeCollection,
  serializeEntry,
  type ReferenceMap,
} from "@/lib/api/serialize";
import type { FieldParseResult, ParsedField } from "@/lib/widgets";

function field(overrides: Partial<ParsedField> & Pick<ParsedField, "id" | "key" | "widget">): ParsedField {
  return {
    ok: true,
    collectionId: "c1",
    label: overrides.key,
    required: false,
    position: 0,
    config: {},
    ...overrides,
  };
}

function entryOf(fieldId: string, value: unknown, extra?: Partial<{
  id: string; slug: string; status: string; created_at: string; updated_at: string;
}>) {
  return {
    id: "e1",
    slug: "entry-one",
    status: "published",
    created_at: "2024-01-01 00:00:00",
    updated_at: "2024-01-02 09:30:00",
    values: { [fieldId]: value },
    ...extra,
  };
}

describe("serializeEntry — field-key mapping and absence", () => {
  it("keys the output by field.key, not field.id", () => {
    const f = field({ id: "fid_title", key: "title", widget: "string" });
    const out = serializeEntry(entryOf("fid_title", "Hello"), [f], new Map());

    expect(out.fields).toEqual({ title: "Hello" });
  });

  it("emits null for a declared field with no stored value", () => {
    const f = field({ id: "fid_title", key: "title", widget: "string" });
    const out = serializeEntry({ ...entryOf("other", "x"), values: {} }, [f], new Map());

    expect(out.fields).toEqual({ title: null });
  });

  it("includes every declared field, so the shape is stable across entries", () => {
    const fields = [
      field({ id: "f1", key: "a", widget: "string" }),
      field({ id: "f2", key: "b", widget: "string" }),
    ];
    const out = serializeEntry({ ...entryOf("f1", "only a"), values: { f1: "only a" } }, fields, new Map());

    expect(Object.keys(out.fields).sort()).toEqual(["a", "b"]);
    expect(out.fields.b).toBeNull();
  });
});

describe("serializeEntry — misconfigured field", () => {
  it("serializes as null with a _warnings entry, other fields unaffected", () => {
    const fields: FieldParseResult[] = [
      field({ id: "ok1", key: "title", widget: "string" }),
      {
        ok: false,
        id: "bad1",
        collectionId: "c1",
        key: "broken",
        label: "Broken",
        widget: "mystery",
        required: false,
        position: 1,
        reason: 'Unknown widget type "mystery".',
      },
    ];

    const out = serializeEntry(
      { ...entryOf("ok1", "Fine"), values: { ok1: "Fine", bad1: "irrelevant" } },
      fields,
      new Map(),
    );

    expect(out.fields.title).toBe("Fine");
    expect(out.fields.broken).toBeNull();
    expect(out._warnings).toEqual([
      { field: "broken", reason: 'Unknown widget type "mystery".' },
    ]);
  });
});

describe("serializeEntry — richtext", () => {
  const doc = {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          children: [
            { type: "text", version: 1, text: "<script>" },
            {
              type: "link",
              version: 1,
              url: "javascript:alert(1)",
              children: [{ type: "text", version: 1, text: "bad link" }],
            },
          ],
        },
      ],
    },
  };

  it("carries rendered HTML and plain text, not the raw document", () => {
    const f = field({ id: "f1", key: "body", widget: "richtext" });
    const out = serializeEntry(entryOf("f1", doc), [f], new Map());

    expect(out.fields.body).toHaveProperty("html");
    expect(out.fields.body).toHaveProperty("text");
    expect(out.fields.body).not.toHaveProperty("root");
  });

  it("escapes text and drops a javascript: link target", () => {
    const f = field({ id: "f1", key: "body", widget: "richtext" });
    const out = serializeEntry(entryOf("f1", doc), [f], new Map());

    const { html } = out.fields.body as { html: string; text: string };
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("bad link");
  });
});

describe("serializeEntry — relationship", () => {
  it("delivers a resolved reference as an addressable object", () => {
    const f = field({
      id: "f1",
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: "authors" },
    });
    const references: ReferenceMap = new Map([
      ["authors:a1", { id: "a1", slug: "ada", collection: "authors" }],
    ]);

    const out = serializeEntry(entryOf("f1", "a1"), [f], references);

    expect(out.fields.author).toEqual({ id: "a1", slug: "ada", collection: "authors" });
  });

  it("delivers a dangling single reference as null", () => {
    const f = field({
      id: "f1",
      key: "author",
      widget: "relationship",
      config: { targetCollectionId: "authors" },
    });

    const out = serializeEntry(entryOf("f1", "missing"), [f], new Map());
    expect(out.fields.author).toBeNull();
  });

  it("drops a dangling reference from a multiple relationship, keeping the rest", () => {
    const f = field({
      id: "f1",
      key: "tags",
      widget: "relationship",
      config: { targetCollectionId: "tags", multiple: true },
    });
    const references: ReferenceMap = new Map([
      ["tags:t1", { id: "t1", slug: "news", collection: "tags" }],
    ]);

    const out = serializeEntry(entryOf("f1", ["t1", "gone"]), [f], references);
    expect(out.fields.tags).toEqual([{ id: "t1", slug: "news", collection: "tags" }]);
  });
});

describe("serializeEntry — datetime", () => {
  it("normalizes two equivalent instants to the same representation", () => {
    const f = field({ id: "f1", key: "publishedOn", widget: "datetime" });

    const a = serializeEntry(entryOf("f1", "2024-01-01T00:00:00+00:00"), [f], new Map());
    const b = serializeEntry(entryOf("f1", "2024-01-01T00:00:00.000Z"), [f], new Map());

    expect(a.fields.publishedOn).toBe(b.fields.publishedOn);
    expect(a.fields.publishedOn).toBe("2024-01-01T00:00:00.000Z");
  });

  it("keeps a dateOnly value as a plain calendar date", () => {
    const f = field({
      id: "f1",
      key: "day",
      widget: "datetime",
      config: { dateOnly: true },
    });

    const out = serializeEntry(entryOf("f1", "2024-03-15"), [f], new Map());
    expect(out.fields.day).toBe("2024-03-15");
  });
});

describe("serializeEntry — image", () => {
  it("maps secureUrl to url, keeps dimensions and format, no binary data", () => {
    const f = field({ id: "f1", key: "cover", widget: "image" });
    const value = {
      secureUrl: "https://res.cloudinary.com/x/y.jpg",
      publicId: "y",
      width: 1200,
      height: 630,
      format: "jpg",
      bytes: 84213,
    };

    const out = serializeEntry(entryOf("f1", value), [f], new Map());

    expect(out.fields.cover).toEqual({
      url: "https://res.cloudinary.com/x/y.jpg",
      publicId: "y",
      width: 1200,
      height: 630,
      format: "jpg",
      bytes: 84213,
    });
  });
});

describe("serializeEntry — number string fidelity", () => {
  it("keeps a valueType: string number as a string, unchanged", () => {
    const f = field({
      id: "f1",
      key: "code",
      widget: "number",
      config: { valueType: "string" },
    });

    const out = serializeEntry(entryOf("f1", "007"), [f], new Map());
    expect(out.fields.code).toBe("007");
  });
});

describe("serializeEntry — envelope", () => {
  it("normalizes created_at/updated_at to ISO-8601 UTC", () => {
    const out = serializeEntry(entryOf("f1", "x"), [], new Map());
    expect(out.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(out.updatedAt).toBe("2024-01-02T09:30:00.000Z");
  });

  it("carries id, slug, and status through unchanged", () => {
    const out = serializeEntry(entryOf("f1", "x"), [], new Map());
    expect(out.id).toBe("e1");
    expect(out.slug).toBe("entry-one");
    expect(out.status).toBe("published");
  });
});

describe("serializeCollection", () => {
  it("exposes only output-relevant config alongside key/widget/required", () => {
    const fields: FieldParseResult[] = [
      field({ id: "f1", key: "tags", widget: "relationship", required: true, config: { targetCollectionId: "t", multiple: true } }),
      field({ id: "f2", key: "code", widget: "number", config: { valueType: "string" } }),
      field({ id: "f3", key: "day", widget: "datetime", config: { dateOnly: true } }),
      field({ id: "f4", key: "title", widget: "string" }),
    ];

    const schema = serializeCollection({ id: "c1", slug: "posts", name: "Posts" }, fields);

    expect(schema).toEqual({
      id: "c1",
      slug: "posts",
      name: "Posts",
      fields: [
        { key: "tags", widget: "relationship", required: true, multiple: true },
        { key: "code", widget: "number", required: false, valueType: "string" },
        { key: "day", widget: "datetime", required: false, dateOnly: true },
        { key: "title", widget: "string", required: false },
      ],
    });
  });

  it("omits a misconfigured field from the schema", () => {
    const fields: FieldParseResult[] = [
      field({ id: "f1", key: "title", widget: "string" }),
      {
        ok: false,
        id: "bad",
        collectionId: "c1",
        key: "broken",
        label: "Broken",
        widget: "mystery",
        required: false,
        position: 1,
        reason: "bad",
      },
    ];

    const schema = serializeCollection({ id: "c1", slug: "posts", name: "Posts" }, fields);
    expect(schema.fields.map((f) => f.key)).toEqual(["title"]);
  });
});
