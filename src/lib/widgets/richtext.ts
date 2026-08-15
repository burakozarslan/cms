import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode } from "@lexical/rich-text";
import { $getRoot, type LexicalEditor } from "lexical";
import { z } from "zod";

import type { WidgetDefinition } from "./types";

/**
 * Empty and strict, like `boolean`'s: the toolbar is fixed in code (design
 * decision 2), so a richtext field has nothing to configure.
 */
export const richtextConfigSchema = z.strictObject({});

export type RichtextConfig = z.infer<typeof richtextConfigSchema>;

/**
 * The node types the fixed toolbar can produce — headings, lists, links. Core
 * nodes (paragraph, text, line break, root) are registered by every Lexical
 * editor regardless of this list.
 */
const richtextNodes = [HeadingNode, ListNode, ListItemNode, LinkNode];

/**
 * A throwaway editor used only to parse and inspect a serialized document,
 * never to render one. Structural validity is Lexical's own responsibility —
 * `parseEditorState` throws on a tree its registered nodes cannot represent —
 * so this is the enforcement point, not a hand-written schema of Lexical's
 * node shapes (design decision 1).
 */
function createValidationEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "richtext-validation",
    nodes: richtextNodes,
    onError: (error) => {
      throw error;
    },
  });
}

export const richtextWidget: WidgetDefinition<RichtextConfig> = {
  type: "richtext",
  label: "Rich text",
  description: "Formatted long-form text — bold, italic, headings, lists, and links.",
  icon: "M6 4h10a3 3 0 0 1 0 6h-10zM6 10h11a3 3 0 0 1 0 6h-11zM4 4v16",
  configSchema: richtextConfigSchema,
  valueSchema() {
    return z.custom<unknown>(
      (value) => {
        if (typeof value !== "object" || value === null) return false;
        try {
          createValidationEditor().parseEditorState(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value as any,
          );
          return true;
        } catch {
          return false;
        }
      },
      { message: "Must be a well-formed rich text document." },
    );
  },
  /**
   * An untouched document is a non-empty JSON object (an empty paragraph
   * node), so the generic `isEmptyValue` check (string/array/nullish) cannot
   * see it as empty. `required` is therefore judged on extracted plain text,
   * not on the JSON's presence (design decision 3).
   *
   * A value that fails to parse is reported as *not* empty — that is a
   * structural problem for `valueSchema` to reject with its own error, not an
   * absence to wave through as "nothing submitted."
   */
  isEmpty(value) {
    if (value === undefined || value === null) return true;
    try {
      const editor = createValidationEditor();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = editor.parseEditorState(value as any);
      let text = "";
      state.read(() => {
        text = $getRoot().getTextContent();
      });
      return text.trim() === "";
    } catch {
      return false;
    }
  },
};
