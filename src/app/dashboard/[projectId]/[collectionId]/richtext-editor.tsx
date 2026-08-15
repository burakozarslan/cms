"use client";

import { useEffect, useRef, useState } from "react";

import { $toggleLink, LinkNode } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  HeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type RangeSelection,
} from "lexical";

import { Icon } from "@frontend/ui";
import { valueInputName } from "@/lib/widgets";

/** The node types the fixed toolbar can produce (mirrors richtext.ts). */
const nodes = [HeadingNode, ListNode, ListItemNode, LinkNode];

const BOLD_PATH = "M7 5h6a3.5 3.5 0 0 1 0 7h-6zM7 12h7a3.5 3.5 0 0 1 0 7h-7z";
const ITALIC_PATH = "M11 5h6M7 19h6M14 5l-4 14";
const UNDERLINE_PATH = "M7 5v6a5 5 0 0 0 10 0v-6M5 19h14";
const BULLET_LIST_PATH =
  "M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01";
const NUMBER_LIST_PATH = "M11 6h9M11 12h9M11 18h9M4 6h1v3M4 13h2l-2 2h2M4 19h2";
const LINK_PATH =
  "M9 15l6 -6M10 6l1 -1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1 -6 -6l1 -1";

const HEADING_OPTIONS: Array<{ value: HeadingTagType | "paragraph"; label: string }> = [
  { value: "paragraph", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
];

function ToolbarButton({
  path,
  label,
  className,
  onClick,
}: {
  path: string;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "btn btn-square btn-text btn-xs",
        className ?? "",
      ].join(" ")}
      aria-label={label}
      // A button's default mousedown behavior steals focus from the
      // contentEditable before the click handler runs, collapsing the text
      // selection the command is meant to act on. Preventing it keeps focus
      // (and the selection) in the editor throughout the click.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon path={path} className="size-4" />
    </button>
  );
}

/** The fixed formatting toolbar — bold, italic, underline, headings, lists, links. */
function Toolbar() {
  const [editor] = useLexicalComposerContext();

  // The heading <select> is a native form control: opening it moves focus
  // away from the contentEditable (unlike the buttons, this can't be
  // prevented without breaking the dropdown), which collapses the live
  // selection before `onChange` fires. Tracking the last real selection lets
  // heading changes still target the text the user had selected.
  const lastSelectionRef = useRef<RangeSelection | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          lastSelectionRef.current = selection.clone();
        }
      });
    });
  }, [editor]);

  function applyHeading(tag: HeadingTagType | "paragraph") {
    editor.update(() => {
      const current = $getSelection();
      const target = $isRangeSelection(current)
        ? current
        : lastSelectionRef.current;
      if (!target) return;
      $setBlocksType(target, () =>
        tag === "paragraph" ? $createParagraphNode() : $createHeadingNode(tag),
      );
    });
  }

  function applyLink() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
      const url = window.prompt("Link URL");
      if (!url) return;
      $toggleLink(url);
    });
  }

  return (
    <div
      className="border-base-content/10 flex flex-wrap items-center gap-1 border-b p-1"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarButton
        path={BOLD_PATH}
        label="Bold"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      />
      <ToolbarButton
        path={ITALIC_PATH}
        label="Italic"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      />
      <ToolbarButton
        path={UNDERLINE_PATH}
        label="Underline"
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
        }
      />
      <select
        className="select select-xs"
        aria-label="Heading level"
        defaultValue="paragraph"
        onChange={(event) =>
          applyHeading(event.target.value as HeadingTagType | "paragraph")
        }
      >
        {HEADING_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ToolbarButton
        path={BULLET_LIST_PATH}
        label="Bulleted list"
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      />
      <ToolbarButton
        path={NUMBER_LIST_PATH}
        label="Numbered list"
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      />
      <ToolbarButton path={LINK_PATH} label="Link" onClick={applyLink} />
    </div>
  );
}

/**
 * The richtext widget's input.
 *
 * The only client-only widget in the registry (design decision 5): it still
 * participates in the entry form's ordinary native `<form>` submission by
 * syncing its serialized document into a hidden input on every change, rather
 * than forking its own save path.
 */
export function RichTextEditor({
  fieldId,
  label,
  required,
  value,
  error,
}: {
  fieldId: string;
  label: string;
  required: boolean;
  value: unknown;
  error?: string;
}) {
  const name = valueInputName(fieldId);

  const initialJson =
    value !== undefined && value !== null ? JSON.stringify(value) : undefined;

  const [json, setJson] = useState(initialJson ?? "");

  const initialConfig: InitialConfigType = {
    namespace: `richtext-${fieldId}`,
    nodes,
    editorState: initialJson,
    onError(caught) {
      // A malformed stored document (or a genuine editor bug) should not take
      // the whole entry form down with it.
      console.error(caught);
    },
  };

  function handleChange(editorState: EditorState) {
    setJson(JSON.stringify(editorState.toJSON()));
  }

  return (
    <div className="w-full">
      <label className="label-text">
        {required ? `${label} *` : label}
      </label>
      <div
        className={[
          "border-base-content/20 overflow-hidden rounded-lg border",
          error ? "border-error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <Toolbar />
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="min-h-32 p-3 text-sm outline-none"
                  aria-label={label}
                />
              }
              placeholder={
                <div className="text-base-content/40 pointer-events-none absolute top-3 left-3 text-sm">
                  Start typing…
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <OnChangePlugin onChange={handleChange} />
        </LexicalComposer>
      </div>
      <input type="hidden" name={name} value={json} />
      {error ? <span className="helper-text text-error">{error}</span> : null}
    </div>
  );
}
