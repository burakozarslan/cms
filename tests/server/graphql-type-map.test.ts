/**
 * @jest-environment node
 *
 * Widget -> GraphQL output type mapping, and slug -> GraphQL name mapping.
 * Covers `content-delivery-graphql-api` -> "The schema is derived from live
 * collection and field definitions" (the type-follows-widget-config part).
 */
import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLString,
} from "graphql";

import { camelCaseFromSlug, pascalCaseFromSlug } from "@/lib/api/graphql/naming";
import { ImageType, RichTextType, scalarOutputType } from "@/lib/api/graphql/type-map";
import type { ParsedField } from "@/lib/widgets";

function field(widget: ParsedField["widget"], config: unknown = {}): ParsedField {
  return {
    ok: true,
    id: "f1",
    collectionId: "c1",
    key: "field",
    label: "Field",
    widget,
    required: false,
    position: 0,
    config,
  };
}

describe("scalarOutputType", () => {
  it("maps number valueType int/float/string to the matching GraphQL scalar", () => {
    expect(scalarOutputType(field("number", { valueType: "int" }))).toBe(GraphQLInt);
    expect(scalarOutputType(field("number", { valueType: "float" }))).toBe(GraphQLFloat);
    expect(scalarOutputType(field("number", { valueType: "string" }))).toBe(GraphQLString);
  });

  it("maps boolean to GraphQLBoolean", () => {
    expect(scalarOutputType(field("boolean"))).toBe(GraphQLBoolean);
  });

  it("maps a single-value select to String and a multiple select to a String list", () => {
    expect(scalarOutputType(field("select", { options: [], multiple: false }))).toBe(
      GraphQLString,
    );
    expect(scalarOutputType(field("select", { options: [], multiple: true }))).toBeInstanceOf(
      GraphQLList,
    );
  });

  it("maps richtext and image to their shared object types", () => {
    expect(scalarOutputType(field("richtext"))).toBe(RichTextType);
    expect(scalarOutputType(field("image"))).toBe(ImageType);
  });

  it("maps string, text, and datetime to GraphQLString", () => {
    expect(scalarOutputType(field("string"))).toBe(GraphQLString);
    expect(scalarOutputType(field("text"))).toBe(GraphQLString);
    expect(scalarOutputType(field("datetime"))).toBe(GraphQLString);
  });
});

describe("naming: slug -> GraphQL identifiers", () => {
  it("pascal-cases a kebab-case slug for type names", () => {
    expect(pascalCaseFromSlug("blog-posts")).toBe("BlogPosts");
    expect(pascalCaseFromSlug("authors")).toBe("Authors");
  });

  it("camel-cases a kebab-case slug for field names", () => {
    expect(camelCaseFromSlug("blog-posts")).toBe("blogPosts");
    expect(camelCaseFromSlug("authors")).toBe("authors");
  });

  it("prefixes a leading-digit result rather than producing an invalid GraphQL name", () => {
    expect(pascalCaseFromSlug("2024-posts")).toMatch(/^[A-Za-z_]/);
  });
});
