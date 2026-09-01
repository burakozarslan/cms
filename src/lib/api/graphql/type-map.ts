import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLString,
  type GraphQLOutputType,
} from "graphql";

import type { NumberConfig, ParsedField, RelationshipConfig } from "@/lib/widgets";

/**
 * `richtext` and `image` fields deliver a fixed shape regardless of config
 * (see `serialize.ts` — rich text always carries `{ html, text }`, image
 * always `{ url, publicId, width, height, format, bytes }`), so their
 * GraphQL types are built once and shared across every collection, rather
 * than per-field.
 */
export const RichTextType = new GraphQLObjectType({
  name: "RichText",
  fields: {
    html: { type: GraphQLString },
    text: { type: GraphQLString },
  },
});

export const ImageType = new GraphQLObjectType({
  name: "Image",
  fields: {
    url: { type: GraphQLString },
    publicId: { type: GraphQLString },
    width: { type: GraphQLInt },
    height: { type: GraphQLInt },
    format: { type: GraphQLString },
    bytes: { type: GraphQLInt },
  },
});

export const EntryMetaType = new GraphQLObjectType({
  name: "EntryListMeta",
  fields: {
    total: { type: GraphQLInt },
    limit: { type: GraphQLInt },
    offset: { type: GraphQLInt },
  },
});

/**
 * The GraphQL output type for a non-relationship field, mirroring the output
 * type rules `outputRelevantConfig` (`src/lib/api/serialize.ts`) reports on
 * the REST schema endpoint: a `number` field's type follows its `valueType`,
 * a `select` field's type follows `multiple`. Relationship fields are typed
 * separately by the schema builder, since their type depends on the target
 * collection's generated object type.
 */
export function scalarOutputType(field: ParsedField): GraphQLOutputType {
  switch (field.widget) {
    case "number": {
      const { valueType } = field.config as NumberConfig;
      if (valueType === "int") return GraphQLInt;
      if (valueType === "float") return GraphQLFloat;
      return GraphQLString;
    }
    case "boolean":
      return GraphQLBoolean;
    case "select": {
      const { multiple } = field.config as { multiple?: boolean };
      return multiple ? new GraphQLList(GraphQLString) : GraphQLString;
    }
    case "richtext":
      return RichTextType;
    case "image":
      return ImageType;
    case "datetime":
    case "string":
    case "text":
      return GraphQLString;
    default:
      return GraphQLString;
  }
}

export function relationshipIsMultiple(field: ParsedField): boolean {
  return (field.config as RelationshipConfig).multiple === true;
}

export function relationshipTargetCollectionId(field: ParsedField): string {
  return (field.config as RelationshipConfig).targetCollectionId;
}
