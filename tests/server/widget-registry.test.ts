/**
 * @jest-environment node
 *
 * Covers `content-modeling` → "Widget configuration is validated against the
 * widget type", and the value-level rejections named in `content-entries` →
 * "Submitted values are validated server-side against field definitions".
 */
import {
  fieldWidgetSchema,
  parseFieldConfig,
  widgetDefinition,
  widgetTypes,
  type StoredFieldRow,
  type WidgetType,
} from "@/lib/widgets";

function config(widget: WidgetType, raw: unknown) {
  return widgetDefinition(widget).configSchema.safeParse(raw);
}

function value(widget: WidgetType, rawConfig: unknown, raw: unknown) {
  const parsedConfig = widgetDefinition(widget).configSchema.parse(rawConfig);
  return widgetDefinition(widget).valueSchema(parsedConfig).safeParse(raw);
}

function storedRow(overrides: Partial<StoredFieldRow> = {}): StoredFieldRow {
  return {
    id: "f1",
    collection_id: "c1",
    key: "title",
    label: "Title",
    widget: "string",
    required: 0,
    position: 0,
    config: "{}",
    ...overrides,
  };
}

describe("the widget type set", () => {
  it("offers exactly the eight shipped types", () => {
    expect([...widgetTypes]).toEqual([
      "string",
      "text",
      "select",
      "number",
      "boolean",
      "datetime",
      "richtext",
      "relationship",
    ]);
  });

  it("rejects a widget type outside the supported set", () => {
    const result = fieldWidgetSchema.safeParse({
      widget: "wysiwyg",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("gives every type display metadata for the picker", () => {
    for (const type of widgetTypes) {
      const definition = widgetDefinition(type);
      expect(definition.label).toBeTruthy();
      expect(definition.description).toBeTruthy();
      expect(definition.icon).toBeTruthy();
    }
  });
});

describe("string widget", () => {
  it("accepts an empty config and a bare maxLength", () => {
    expect(config("string", {}).success).toBe(true);
    expect(config("string", { maxLength: 80 }).success).toBe(true);
  });

  it("rejects a non-positive maxLength", () => {
    expect(config("string", { maxLength: 0 }).success).toBe(false);
    expect(config("string", { maxLength: 2.5 }).success).toBe(false);
  });

  it("enforces maxLength on the value, at the boundary", () => {
    expect(value("string", { maxLength: 3 }, "abc").success).toBe(true);
    expect(value("string", { maxLength: 3 }, "abcd").success).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(value("string", {}, 42).success).toBe(false);
  });
});

describe("text widget", () => {
  it("accepts rows and maxLength", () => {
    expect(config("text", { rows: 8, maxLength: 500 }).success).toBe(true);
  });

  it("rejects an absurd row count", () => {
    expect(config("text", { rows: 500 }).success).toBe(false);
  });
});

describe("select widget", () => {
  const options = [
    { label: "A", value: "a" },
    { label: "B", value: "b" },
    { label: "C", value: "c" },
  ];

  it("rejects a missing options list", () => {
    expect(config("select", {}).success).toBe(false);
  });

  it("rejects an empty options list", () => {
    expect(config("select", { options: [] }).success).toBe(false);
  });

  it("rejects duplicate option values", () => {
    expect(
      config("select", {
        options: [
          { label: "A", value: "a" },
          { label: "Also A", value: "a" },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a well-formed options list", () => {
    expect(config("select", { options, multiple: true }).success).toBe(true);
  });

  it("accepts a configured option value and rejects one outside the list", () => {
    expect(value("select", { options }, "b").success).toBe(true);
    expect(value("select", { options }, "z").success).toBe(false);
  });

  it("takes an array only when configured multiple", () => {
    expect(value("select", { options, multiple: true }, ["a", "c"]).success).toBe(
      true,
    );
    expect(value("select", { options, multiple: true }, ["a", "z"]).success).toBe(
      false,
    );
    expect(value("select", { options }, ["a"]).success).toBe(false);
  });
});

describe("number widget", () => {
  it("defaults valueType to float", () => {
    const parsed = widgetDefinition("number").configSchema.parse({});
    expect(parsed).toMatchObject({ valueType: "float" });
  });

  it("rejects a minimum greater than its maximum", () => {
    expect(config("number", { min: 10, max: 1 }).success).toBe(false);
  });

  it("accepts coincident bounds", () => {
    expect(config("number", { min: 5, max: 5 }).success).toBe(true);
  });

  it("rejects fractional bounds on an integer field", () => {
    expect(
      config("number", { valueType: "int", min: 0.5, max: 10 }).success,
    ).toBe(false);
  });

  it("rejects a non-positive step", () => {
    expect(config("number", { step: 0 }).success).toBe(false);
  });

  it("enforces bounds at the boundary", () => {
    expect(value("number", { min: 1, max: 10 }, 10).success).toBe(true);
    expect(value("number", { min: 1, max: 10 }, 11).success).toBe(false);
    expect(value("number", { min: 1, max: 10 }, 0).success).toBe(false);
  });

  it("rejects a fractional value when the value type is int", () => {
    expect(value("number", { valueType: "int" }, 3).success).toBe(true);
    expect(value("number", { valueType: "int" }, 3.5).success).toBe(false);
  });

  it("accepts a fractional value when the value type is float", () => {
    expect(value("number", { valueType: "float" }, 3.5).success).toBe(true);
  });

  it("keeps a string value's textual form but still requires a number", () => {
    // The point of valueType "string" is round-trip fidelity: "007" survives.
    const kept = value("number", { valueType: "string" }, "007");
    expect(kept.success).toBe(true);
    if (kept.success) expect(kept.data).toBe("007");

    expect(value("number", { valueType: "string" }, "abc").success).toBe(false);
  });

  it("applies bounds to a string value's numeric form", () => {
    expect(
      value("number", { valueType: "string", max: 10 }, "99").success,
    ).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(value("number", {}, Number.NaN).success).toBe(false);
    expect(value("number", {}, Number.POSITIVE_INFINITY).success).toBe(false);
  });
});

describe("boolean widget", () => {
  it("accepts only an empty config", () => {
    expect(config("boolean", {}).success).toBe(true);
  });

  it("rejects configuration belonging to another widget type", () => {
    // The scenario from the spec: a boolean field carrying select options.
    expect(
      config("boolean", { options: [{ label: "A", value: "a" }] }).success,
    ).toBe(false);
    expect(
      fieldWidgetSchema.safeParse({
        widget: "boolean",
        config: { options: [{ label: "A", value: "a" }] },
      }).success,
    ).toBe(false);
  });

  it("takes a boolean value and nothing else", () => {
    expect(value("boolean", {}, true).success).toBe(true);
    expect(value("boolean", {}, "true").success).toBe(false);
    expect(value("boolean", {}, 1).success).toBe(false);
  });
});

describe("datetime widget", () => {
  it("accepts an ISO 8601 instant", () => {
    expect(value("datetime", {}, "2026-03-04T10:30:00Z").success).toBe(true);
  });

  it("rejects an unparseable value", () => {
    expect(value("datetime", {}, "not a date").success).toBe(false);
    expect(value("datetime", {}, "").success).toBe(false);
  });

  it("requires a bare date when configured dateOnly", () => {
    expect(value("datetime", { dateOnly: true }, "2026-03-04").success).toBe(
      true,
    );
    expect(
      value("datetime", { dateOnly: true }, "2026-03-04T10:30:00Z").success,
    ).toBe(false);
  });

  it("rejects a calendar-invalid date rather than rolling it over", () => {
    expect(value("datetime", { dateOnly: true }, "2024-02-31").success).toBe(
      false,
    );
    expect(value("datetime", { dateOnly: true }, "2024-02-29").success).toBe(
      true,
    );
  });
});

describe("richtext widget", () => {
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

  const docWithText = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 1,
              mode: "normal",
              style: "",
              text: "Hello",
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

  it("accepts only an empty config", () => {
    expect(config("richtext", {}).success).toBe(true);
    expect(config("richtext", { rows: 5 }).success).toBe(false);
  });

  it("accepts a well-formed serialized document", () => {
    expect(value("richtext", {}, docWithText).success).toBe(true);
  });

  it("rejects a non-document value", () => {
    expect(value("richtext", {}, "not a document").success).toBe(false);
    expect(value("richtext", {}, 42).success).toBe(false);
    expect(value("richtext", {}, { foo: "bar" }).success).toBe(false);
  });

  it("reports an untouched document as empty", () => {
    const widget = widgetDefinition("richtext");
    expect(widget.isEmpty?.(emptyDoc, {})).toBe(true);
  });

  it("reports a document with visible text as not empty", () => {
    const widget = widgetDefinition("richtext");
    expect(widget.isEmpty?.(docWithText, {})).toBe(false);
  });

  it("treats undefined and null as empty", () => {
    const widget = widgetDefinition("richtext");
    expect(widget.isEmpty?.(undefined, {})).toBe(true);
    expect(widget.isEmpty?.(null, {})).toBe(true);
  });

  it("does not report a malformed value as empty — it is a structural problem, not an absence", () => {
    const widget = widgetDefinition("richtext");
    expect(widget.isEmpty?.({ foo: "bar" }, {})).toBe(false);
  });
});

describe("relationship widget", () => {
  it("requires a target collection", () => {
    expect(config("relationship", {}).success).toBe(false);
    expect(config("relationship", { targetCollectionId: "" }).success).toBe(
      false,
    );
  });

  it("accepts a target collection id, with multiple optional", () => {
    expect(config("relationship", { targetCollectionId: "c1" }).success).toBe(
      true,
    );
    expect(
      config("relationship", { targetCollectionId: "c1", multiple: true })
        .success,
    ).toBe(true);
  });

  it("takes a single non-empty id in single mode", () => {
    expect(value("relationship", { targetCollectionId: "c1" }, "e1").success).toBe(
      true,
    );
    expect(value("relationship", { targetCollectionId: "c1" }, "").success).toBe(
      false,
    );
    expect(
      value("relationship", { targetCollectionId: "c1" }, ["e1"]).success,
    ).toBe(false);
  });

  it("takes an array of non-empty ids only when configured multiple", () => {
    expect(
      value(
        "relationship",
        { targetCollectionId: "c1", multiple: true },
        ["e1", "e2"],
      ).success,
    ).toBe(true);
    expect(
      value(
        "relationship",
        { targetCollectionId: "c1", multiple: true },
        "e1",
      ).success,
    ).toBe(false);
    expect(
      value("relationship", { targetCollectionId: "c1", multiple: true }, [
        "e1",
        "",
      ]).success,
    ).toBe(false);
  });

  it("this schema alone cannot tell a real entry id from a made-up one — that is checked separately, against the database, on save", () => {
    // Shape validation passes for any non-empty string; existence is not this
    // schema's job (design decision 1-2 — see tests/server/entries.test.ts).
    expect(
      value("relationship", { targetCollectionId: "c1" }, "not-a-real-id")
        .success,
    ).toBe(true);
  });
});

describe("cross-type configuration", () => {
  it("rejects select options on a string field", () => {
    expect(
      config("string", { options: [{ label: "A", value: "a" }] }).success,
    ).toBe(false);
  });

  it("rejects number bounds on a select field", () => {
    expect(
      config("select", { options: [{ label: "A", value: "a" }], min: 3 })
        .success,
    ).toBe(false);
  });

  it("rejects a datetime flag on a number field", () => {
    expect(config("number", { dateOnly: true }).success).toBe(false);
  });
});

describe("parseFieldConfig — validating stored rows on read", () => {
  it("parses a well-formed row", () => {
    const parsed = parseFieldConfig(
      storedRow({ widget: "string", config: '{"maxLength":80}' }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.widget).toBe("string");
    expect(parsed.config).toEqual({ maxLength: 80 });
    expect(parsed.required).toBe(false);
  });

  it("maps the integer required column to a boolean", () => {
    const parsed = parseFieldConfig(storedRow({ required: 1 }));
    expect(parsed.required).toBe(true);
  });

  it("reports an unknown widget type rather than throwing", () => {
    const parsed = parseFieldConfig(storedRow({ widget: "wysiwyg" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/wysiwyg/);
  });

  it("reports unparseable JSON rather than throwing", () => {
    const parsed = parseFieldConfig(storedRow({ config: "{not json" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/JSON/);
  });

  it("reports config that no longer matches its widget type", () => {
    // The spec scenario: a stored field the builder must render as
    // misconfigured instead of failing to render the collection at all.
    const parsed = parseFieldConfig(
      storedRow({ widget: "select", config: '{"options":[]}' }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBeTruthy();
    // Identity is still available, so the builder can name the broken field.
    expect(parsed.key).toBe("title");
    expect(parsed.label).toBe("Title");
  });
});
