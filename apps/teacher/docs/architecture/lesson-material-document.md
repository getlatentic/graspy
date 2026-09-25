# Lesson material document

## User contract

Completed lesson materials read as a teacher document, not as model output or stored
JSON. Each lesson step contains review, worked example, practice, and solution content
in a stable typographic order. The document remains usable at 320 CSS pixels and has a
dedicated print layout with avoidable page breaks removed.

Before approval, each text block can be revised in place. Saved changes append a
durable document version and are labelled **Edited by you** both at the block and in
the connection table. Approval makes that exact version read-only. The complete
version and concurrency contract is defined in `lesson-material-editing.md`.

The document ends with a table named **How each activity connects**. Every row is
derived from normalized database relationships and contains:

1. the teacher-facing material item name;
2. the exact confirmed learning-goal text;
3. the published source title and publisher; and
4. whether the wording is original or teacher-edited.

No model prose is parsed to infer these connections, and no source key or internal
learning-goal identifier is shown to the teacher.

## Renderer boundary

`lessonMaterialDocument.ts` is a framework-free presenter. It joins block goal numbers
to the immutable lesson goals, joins block source keys to the run's source catalogue,
and assigns each trusted figure once. A figure is placed after the first block citing
its source. If a confirmed source figure is not cited by a generated block, it is kept
at the end of the completed document rather than silently lost.

React components only render that contract. Review, worked example, practice, and
solution each have a named component. `LessonMaterialFigure` is the only component that
loads image data and synchronizes with the native gateway. Loading and failure states
are explicit.

## Figure trust contract

Figures are not part of the model output schema. The corpus exporter admits only local
PNG files referenced by the processed Siyavula record set and held in the verified
source-figure directory. It records source relationship, accessible text, dimensions,
origin, media type, and SHA-256 hash.

Material validation rejects Markdown and HTML image syntax. `MaterialText` also drops
Markdown image nodes, so a generated URL cannot render even if an older stored response
bypasses current validation. The native layer returns bytes only for a figure already
connected to the active lesson version and only after a hash match.

## Print and responsive contract

The screen uses the established graspy tokens, Carbon interaction semantics, and a
single-column reading measure. There are no rounded document cards or decorative
shadows. At narrow widths the traceability table becomes labelled rows; at 40 rem it
returns to a semantic table. Print removes application navigation and creation controls,
keeps figures within the page box, and avoids splitting material blocks and table rows.

The application export is a separate authorized document boundary rather than a
browser print stylesheet wrapped in a Save button. Student and teacher copies, atomic
PDF saving, offline asset embedding, true A4 pagination, and the native system print
operation are specified in `lesson-material-export-and-print.md`.
