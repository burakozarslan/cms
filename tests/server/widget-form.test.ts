/**
 * @jest-environment node
 *
 * The bridge between the HTML forms and the validated services: how a widget's
 * config and an entry's values come back off a FormData.
 */
import {
  compactConfig,
  configFromForm,
  fieldWidgetSchema,
  formatSelectOptions,
  parseSelectOptions,
  parseFieldConfig,
  valueInputName,
  valuesFromForm,
  type FieldParseResult,
  type WidgetType,
} from "@/lib/widgets";

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

function fieldOf(
  id: string,
  widget: WidgetType,
  config: unknown = {},
  required = false,
): FieldParseResult {
  return parseFieldConfig({
    id,
    collection_id: "c1",
    key: id,
    label: id,
    widget,
    required: required ? 1 : 0,
    position: 0,
    config: JSON.stringify(config),
  });
}

describe("configFromForm", () => {
  it("omits blank optional numbers rather than sending NaN", () => {
    const config = compactConfig(
      configFromForm("string", form({ "config.maxLength": "" })),
    );

    expect(config).toEqual({});
    expect(fieldWidgetSchema.safeParse({ widget: "string", config }).success).toBe(
      true,
    );
  });

  it("reads a string field's maximum length", () => {
    const config = compactConfig(
      configFromForm("string", form({ "config.maxLength": "80" })),
    );
    expect(config).toEqual({ maxLength: 80 });
  });

  it("treats an absent checkbox as false", () => {
    const config = compactConfig(configFromForm("datetime", form({})));
    expect(config).toEqual({ dateOnly: false });
  });

  it("reads number bounds and value type", () => {
    const config = compactConfig(
      configFromForm(
        "number",
        form({
          "config.min": "1",
          "config.max": "10",
          "config.step": "0.5",
          "config.valueType": "float",
        }),
      ),
    );

    expect(config).toEqual({ min: 1, max: 10, step: 0.5, valueType: "float" });
  });

  it("produces an empty config for a boolean, which is what it accepts", () => {
    const config = compactConfig(
      // Stray keys from a previously selected widget type must not leak through.
      configFromForm("boolean", form({ "config.options": "a\nb" })),
    );

    expect(config).toEqual({});
    expect(
      fieldWidgetSchema.safeParse({ widget: "boolean", config }).success,
    ).toBe(true);
  });
});

describe("select options round-trip", () => {
  it("reads bare lines as both label and value", () => {
    expect(parseSelectOptions("Draft\nPublished")).toEqual([
      { label: "Draft", value: "Draft" },
      { label: "Published", value: "Published" },
    ]);
  });

  it("splits “Label | value”", () => {
    expect(parseSelectOptions("In review | in_review")).toEqual([
      { label: "In review", value: "in_review" },
    ]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(parseSelectOptions("  a  \n\n\n  b  ")).toEqual([
      { label: "a", value: "a" },
      { label: "b", value: "b" },
    ]);
  });

  it("formats back into the same text it parsed", () => {
    const text = "Draft\nIn review | in_review";
    expect(formatSelectOptions(parseSelectOptions(text))).toBe(text);
  });
});

describe("valuesFromForm", () => {
  it("reads an unchecked toggle as false, not as absent", () => {
    // A required toggle must be saveable as unchecked; "absent" would read as
    // empty and fail the required check.
    const field = fieldOf("f1", "boolean");
    expect(valuesFromForm([field], form({}))).toEqual({ f1: false });
    expect(
      valuesFromForm([field], form({ [valueInputName("f1")]: "true" })),
    ).toEqual({ f1: true });
  });

  it("collects every selection for a multiple select", () => {
    const field = fieldOf("f1", "select", {
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
      multiple: true,
    });

    expect(
      valuesFromForm([field], form({ [valueInputName("f1")]: ["a", "b"] })),
    ).toEqual({ f1: ["a", "b"] });
  });

  it("converts a numeric field to a number but keeps a text-typed one as typed", () => {
    const numeric = fieldOf("n1", "number", { valueType: "int" });
    const textual = fieldOf("n2", "number", { valueType: "string" });

    expect(valuesFromForm([numeric], form({ [valueInputName("n1")]: "7" }))).toEqual(
      { n1: 7 },
    );
    expect(
      valuesFromForm([textual], form({ [valueInputName("n2")]: "007" })),
    ).toEqual({ n2: "007" });
  });

  it("reads a blank number as empty rather than as zero", () => {
    // Number("") is 0, which would silently invent a value for a blank input.
    const field = fieldOf("n1", "number");
    expect(valuesFromForm([field], form({ [valueInputName("n1")]: "" }))).toEqual({
      n1: "",
    });
  });

  it("reads only fields belonging to the collection", () => {
    const mine = fieldOf("f1", "string");

    const values = valuesFromForm(
      [mine],
      form({
        [valueInputName("f1")]: "Mine",
        [valueInputName("foreign")]: "Smuggled",
      }),
    );

    expect(values).toEqual({ f1: "Mine" });
  });

  it("skips a misconfigured field instead of guessing its shape", () => {
    const broken = fieldOf("f1", "select", { options: [] });
    expect(broken.ok).toBe(false);

    expect(
      valuesFromForm([broken], form({ [valueInputName("f1")]: "anything" })),
    ).toEqual({});
  });
});
