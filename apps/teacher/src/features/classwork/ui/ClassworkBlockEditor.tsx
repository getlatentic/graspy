import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { useState } from "react";

import { validateClassworkEdit } from "../domain/classworkEditing";

type SaveState =
  | { readonly status: "editing" }
  | { readonly status: "saving" }
  | { readonly status: "failed"; readonly message: string };

interface Props {
  readonly label: string;
  readonly text: string;
  readonly onCancel: () => void;
  readonly onSave: (text: string) => Promise<void>;
}

/** TipTap renders its own DOM, so its surface is styled through the library's `.tiptap` class from out here. */
const tiptapSurface =
  "[&_.tiptap]:m-0 [&_.tiptap]:min-h-[12rem] [&_.tiptap]:overflow-auto [&_.tiptap]:resize-y [&_.tiptap]:border [&_.tiptap]:border-rule-strong [&_.tiptap]:bg-paper [&_.tiptap]:p-md [&_.tiptap]:text-base [&_.tiptap]:leading-body [&_.tiptap]:text-ink [&_.tiptap:focus-visible]:outline-2 [&_.tiptap:focus-visible]:outline-focus [&_.tiptap:focus-visible]:outline-offset-1 data-[state=failed]:[&_.tiptap]:border-error [&_.tiptap>:first-child]:mt-0 [&_.tiptap>:last-child]:mb-0 [&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child]:before:float-start [&_.tiptap_p.is-editor-empty:first-child]:before:h-0 [&_.tiptap_p.is-editor-empty:first-child]:before:text-muted [&_.tiptap_p.is-editor-empty:first-child]:before:content-['Add_lesson_content'] [&_.tiptap_table]:w-full [&_.tiptap_table]:table-fixed [&_.tiptap_table]:border-collapse [&_.tiptap_th]:min-w-[5rem] [&_.tiptap_th]:border [&_.tiptap_th]:border-rule-strong [&_.tiptap_th]:p-xs [&_.tiptap_th]:text-start [&_.tiptap_th]:align-top [&_.tiptap_th]:[overflow-wrap:anywhere] [&_.tiptap_th]:bg-paper-soft [&_.tiptap_th]:font-extrabold [&_.tiptap_td]:min-w-[5rem] [&_.tiptap_td]:border [&_.tiptap_td]:border-rule-strong [&_.tiptap_td]:p-xs [&_.tiptap_td]:text-start [&_.tiptap_td]:align-top [&_.tiptap_td]:[overflow-wrap:anywhere]";

export function ClassworkBlockEditor({ label, text, onCancel, onSave }: Props) {
  const [markdown, setMarkdown] = useState(text);
  const [saveState, setSaveState] = useState<SaveState>({ status: "editing" });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      Markdown,
    ],
    content: text,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": `Edit ${label}`,
        "aria-multiline": "true",
        class: "classwork-editor-content",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: activeEditor }) => setMarkdown(activeEditor.getMarkdown()),
  });
  const validation = validateClassworkEdit(markdown);
  const dirty = validation.valid && validation.text !== text.trim();
  const saving = saveState.status === "saving";

  async function save() {
    if (!validation.valid || !dirty || saving) return;
    setSaveState({ status: "saving" });
    try {
      await onSave(validation.text);
    } catch (error) {
      setSaveState({
        status: "failed",
        message: error instanceof Error && error.message.trim()
          ? error.message
          : "This change was not saved. Reopen the lesson and try again.",
      });
    }
  }

  return (
    <div className={`grid min-w-0 gap-sm bg-paper text-ink print:hidden ${tiptapSurface}`} data-state={saveState.status}>
      <div className="flex min-w-0 flex-wrap gap-2xs border-y border-rule py-xs" role="toolbar" aria-label={`${label} formatting`}>
        <EditorCommand
          label="Bold"
          pressed={editor?.isActive("bold") ?? false}
          disabled={!editor || saving}
          onRun={() => editor?.chain().focus().toggleBold().run()}
        />
        <EditorCommand
          label="Bullets"
          pressed={editor?.isActive("bulletList") ?? false}
          disabled={!editor || saving}
          onRun={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <EditorCommand
          label="Numbered list"
          pressed={editor?.isActive("orderedList") ?? false}
          disabled={!editor || saving}
          onRun={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <EditorCommand
          label="Table"
          pressed={editor?.isActive("table") ?? false}
          disabled={!editor || saving}
          onRun={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        <span className="hidden sm:block sm:flex-1" aria-hidden="true" />
        <EditorCommand
          label="Undo"
          pressed={false}
          disabled={!editor?.can().chain().focus().undo().run() || saving}
          onRun={() => editor?.chain().focus().undo().run()}
        />
        <EditorCommand
          label="Redo"
          pressed={false}
          disabled={!editor?.can().chain().focus().redo().run() || saving}
          onRun={() => editor?.chain().focus().redo().run()}
        />
      </div>

      <EditorContent editor={editor} />

      {!validation.valid ? (
        <p className="m-0 min-h-[1lh] text-sm leading-body text-error" role="alert">{validation.message}</p>
      ) : (
        <p className="m-0 min-h-[1lh] text-sm leading-body text-ink-secondary">Changes are saved as a new draft. The original wording remains in history.</p>
      )}

      {saveState.status === "failed" ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="This change was not saved"
          subtitle={saveState.message}
        />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-xs [&_.cds--btn]:whitespace-nowrap">
        <Button kind="secondary" disabled={saving} onClick={onCancel}>Cancel</Button>
        <Button disabled={!dirty || !validation.valid || saving} onClick={() => void save()}>
          Save changes
        </Button>
        {saving ? <InlineLoading description="Saving changes" status="active" /> : null}
      </div>
    </div>
  );
}

interface EditorCommandProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly onRun: () => void;
}

function EditorCommand({ label, pressed, disabled, onRun }: EditorCommandProps) {
  return (
    <button
      type="button"
      className="min-h-[2.75rem] whitespace-nowrap border border-rule bg-paper px-sm text-sm font-extrabold text-ink-secondary [font:inherit] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-paper-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink active:bg-ink active:text-paper aria-pressed:bg-ink aria-pressed:text-paper disabled:cursor-not-allowed disabled:opacity-50 focus-visible:relative focus-visible:z-[var(--z-raised)] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onRun}
    >
      {label}
    </button>
  );
}
