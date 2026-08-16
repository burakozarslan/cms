import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * Shape only. `targetCollectionId` names a collection but this schema cannot
 * confirm it exists, belongs to the same project, or isn't the field's own
 * collection — those need a database read, so they are enforced in
 * `src/lib/collections/service.ts` at field create/update time instead (design
 * decision 7).
 */
export const relationshipConfigSchema = z.strictObject({
  targetCollectionId: z.string().trim().min(1, "Choose a target collection."),
  multiple: z.boolean().optional(),
});

export type RelationshipConfig = z.infer<typeof relationshipConfigSchema>;

export const relationshipWidget: WidgetDefinition<RelationshipConfig> = {
  type: "relationship",
  label: "Relationship",
  description: "A reference to one or more entries in another collection.",
  icon: "M7 9a2 2 0 1 0 0 -4a2 2 0 0 0 0 4M17 19a2 2 0 1 0 0 -4a2 2 0 0 0 0 4M8.7 7.7l6.6 8.6M8.7 16.3l6.6 -8.6",
  configSchema: relationshipConfigSchema,
  /**
   * Shape only — a string id, or an array of them when `multiple`. Whether
   * each id actually exists in the target collection is checked separately, on
   * save, against the database (design decision 1-2): this schema alone
   * cannot tell a real entry id from a made-up one.
   */
  valueSchema(config) {
    const one = z.string().trim().min(1, "Choose an entry.");
    return config.multiple ? z.array(one) : one;
  },
};
