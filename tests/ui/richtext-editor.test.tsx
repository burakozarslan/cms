import { render, screen } from "@testing-library/react";

import { RichTextEditor } from "@/app/dashboard/[projectId]/[collectionId]/richtext-editor";
import { ValueInput } from "@/app/dashboard/[projectId]/[collectionId]/value-input";
import { parseFieldConfig, type StoredFieldRow } from "@/lib/widgets";

function richtextField(overrides: Partial<StoredFieldRow> = {}) {
  const parsed = parseFieldConfig({
    id: "f1",
    collection_id: "c1",
    key: "body",
    label: "Body",
    widget: "richtext",
    required: 0,
    position: 0,
    config: "{}",
    ...overrides,
  });
  if (!parsed.ok) throw new Error("fixture field failed to parse");
  return parsed;
}

describe("RichTextEditor", () => {
  it("renders a formatting toolbar and an editable surface", () => {
    render(
      <RichTextEditor
        fieldId="f1"
        label="Body"
        required={false}
        value={undefined}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Body" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
  });

  it("names the hidden input after the field, blank for an untouched new document", () => {
    // jsdom cannot simulate the native input events a real browser sends into
    // a Lexical-managed contentEditable, so typing isn't exercised here. An
    // untouched new document never fires OnChangePlugin, which is correct:
    // valueFromForm (form.ts) reads a blank hidden input as "no value
    // submitted", the same as leaving any other optional field untouched.
    const { container } = render(
      <RichTextEditor
        fieldId="f1"
        label="Body"
        required={false}
        value={undefined}
      />,
    );

    const hidden = container.querySelector(
      'input[type="hidden"][name="value:f1"]',
    ) as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("");
  });

  it("pre-fills the hidden input from an existing value with no edit required", () => {
    const doc = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "Existing text",
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

    const { container } = render(
      <RichTextEditor fieldId="f1" label="Body" required={false} value={doc} />,
    );

    const hidden = container.querySelector(
      'input[type="hidden"][name="value:f1"]',
    ) as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(JSON.parse(hidden.value)).toEqual(doc);
  });

  it("re-hydrates an existing document", () => {
    const doc = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "Existing text",
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

    render(
      <RichTextEditor fieldId="f1" label="Body" required={false} value={doc} />,
    );

    expect(screen.getByText("Existing text")).toBeInTheDocument();
  });
});

describe("ValueInput — richtext dispatch", () => {
  it("mounts the rich text editor for a richtext field", () => {
    render(<ValueInput field={richtextField()} value={undefined} />);
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("does not mount any rich text editor for a non-richtext field", () => {
    const stringField = parseFieldConfig({
      id: "f2",
      collection_id: "c1",
      key: "title",
      label: "Title",
      widget: "string",
      required: 0,
      position: 0,
      config: "{}",
    });
    if (!stringField.ok) throw new Error("fixture field failed to parse");

    render(<ValueInput field={stringField} value="" />);
    expect(screen.queryByRole("toolbar", { name: "Formatting" })).toBeNull();
  });
});
