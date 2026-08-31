import { $isLinkNode, LinkNode } from "@lexical/link";
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  type LexicalNode,
  type TextNode,
} from "lexical";

/** Mirrors `richtext.ts`'s closed node set. */
export const richtextRenderNodes = [HeadingNode, ListNode, ListItemNode, LinkNode];

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * A stored `javascript:`, `data:`, or otherwise unrecognized URL is dropped
 * rather than emitted (design decision 9) — this HTML is meant to be injected
 * directly into a consumer's page.
 */
function safeHref(href: string): string | undefined {
  try {
    const protocol = new URL(href, "https://placeholder.invalid").protocol;
    return ALLOWED_LINK_PROTOCOLS.has(protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

function renderTextNode(node: TextNode): string {
  let html = escapeHtml(node.getTextContent());
  if (node.hasFormat("code")) html = `<code>${html}</code>`;
  if (node.hasFormat("underline")) html = `<u>${html}</u>`;
  if (node.hasFormat("italic")) html = `<em>${html}</em>`;
  if (node.hasFormat("bold")) html = `<strong>${html}</strong>`;
  return html;
}

/**
 * Whether the current environment should throw on an unknown node type
 * (development) or emit a warning and continue (production) — design.md's
 * risk note: "the renderer must throw... rather than dropping it."
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function renderChildren(node: LexicalNode & { getChildren: () => LexicalNode[] }): string {
  return node
    .getChildren()
    .map((child) => renderNode(child))
    .join("");
}

function renderNode(node: LexicalNode): string {
  if ($isTextNode(node)) return renderTextNode(node);
  if ($isLineBreakNode(node)) return "<br>";

  if ($isLinkNode(node)) {
    const href = safeHref(node.getURL());
    const inner = renderChildren(node);
    return href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
  }

  if ($isHeadingNode(node)) {
    const tag = node.getTag();
    return `<${tag}>${renderChildren(node)}</${tag}>`;
  }

  if ($isListNode(node)) {
    const tag = node.getListType() === "number" ? "ol" : "ul";
    return `<${tag}>${renderChildren(node)}</${tag}>`;
  }

  if ($isListItemNode(node)) {
    return `<li>${renderChildren(node)}</li>`;
  }

  if ($isParagraphNode(node)) {
    return `<p>${renderChildren(node)}</p>`;
  }

  // The root node itself: rendered by its children only.
  if (node.getType() === "root") {
    return renderChildren(node as LexicalNode & { getChildren: () => LexicalNode[] });
  }

  // An unrecognized node type must never silently vanish — either it throws
  // during development (surfacing a toolbar/renderer mismatch immediately)
  // or it is called out explicitly in production rather than disappearing.
  const message = `richtext renderer has no branch for node type "${node.getType()}".`;
  if (isDevelopment()) throw new UnknownRichTextNodeError(message);
  console.warn(message);
  return "";
}

/**
 * Distinguishes a genuine renderer gap (must propagate in development, never
 * be swallowed as "just an unparseable document") from an ordinary parse
 * failure.
 */
export class UnknownRichTextNodeError extends Error {}

export type RenderedRichText = { html: string; text: string };

/**
 * Render a stored richtext document to `{ html, text }`.
 *
 * Tractable only because `richtextNodes` is a closed set (design decision 9)
 * — this is a total function over the ~8 node types that set can produce,
 * not an open-world HTML renderer.
 */
export function renderRichText(
  editor: import("lexical").LexicalEditor,
  value: unknown,
): RenderedRichText | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = editor.parseEditorState(value as any);

    let result: RenderedRichText | null = null;
    state.read(() => {
      const root = $getRoot();
      const html = $isElementNode(root) ? renderChildren(root) : "";
      const text = root.getTextContent();
      result = { html, text };
    });
    return result;
  } catch (error) {
    if (error instanceof UnknownRichTextNodeError) throw error;
    return null;
  }
}
