# Lesson material editing and approval

## Purpose

A teacher can revise any review note, worked example, practice activity, or
solution directly in the lesson document. Each saved change remains attributable
to the teacher and survives an application restart. When the wording is final,
the teacher approves one exact version for export and later classroom workflows.

## Guarantees

- Every saved text block is stored in SQLite before the interface reports success.
- Saving one block creates a new complete document version; it never mutates a
  previous version or an original generated block.
- A teacher-edited marker follows the block through the document and the
  traceability table.
- Two windows cannot silently overwrite one another. A save or approval carrying
  an older version number is rejected and the teacher is asked to reopen the lesson.
- Approval is explicit and irreversible for that version. An approved version is
  read-only and is the only version eligible for export or group-material creation.
- Empty content, content over 12,000 characters, and embedded Markdown or HTML
  images are rejected at both the React and native persistence boundaries.

## Version model

Migration `013_lesson_material_editing.sql` adds an append-only document ledger:

- `lesson_material_document_versions` records ordered `draft` and `approved`
  versions for one completed materials run;
- `lesson_material_document_blocks` stores a full block snapshot for each version;
  and
- `lesson_material_runs.current_document_version_number` is the compare-and-swap
  pointer to the current version.

The generated rows in `lesson_material_blocks` remain the immutable source record.
When generation completes, the repository creates draft version 1 by copying those
rows. Each edit copies the current complete snapshot into version N+1, replaces only
the selected block text, and permanently sets its `teacher_edited` value. The copy is
committed in the same transaction as the current-version pointer update.

Database triggers prohibit updates to every version block and prohibit changes or
deletion after a version is approved. This makes revision history a storage invariant,
not a convention held only by the interface.

## Application and command boundaries

React depends on `LessonMaterialsGateway`; it does not call Tauri directly. The
gateway exposes two version-aware operations:

- `editBlock(runId, blockId, expectedVersionNumber, text)`; and
- `approveVersion(runId, expectedVersionNumber)`.

The native commands validate the active academic context, confirmed lesson version,
completed materials run, current draft status, requested block ownership, expected
version, and text contract. Each command returns a fresh workspace snapshot only
after the SQLite transaction commits.

The editor uses pinned TipTap packages with StarterKit, tables, and Markdown
serialization. Its local dirty state controls the save action, but durable state
always comes from the returned native snapshot. Only one block can be edited at a
time, which keeps version ownership explicit and prevents locally queued edits from
being based on the same stale version.

## Approval and downstream ownership

Approval changes the current draft to `approved` and records its approval time in one
transaction. The interface then removes editing actions and presents the document as
read-only.

Group-material creation requires the current complete base run to have an approved
document version. Its immutable snapshot uses text and teacher-edited status from
that approved version while retaining the generated block identifiers for learning
goal and published-source relationships. A draft can therefore never bypass teacher
review and become the basis for adjusted classroom materials.

Section recreation and one-section restoration extend this same append-only lineage;
see `lesson-material-section-recreation.md`. Export rejects any run whose current
version is not approved; see `lesson-material-export-and-print.md`. Neither concern weakens the append-only
and approval invariants defined here.

## Verification strategy

Domain tests pin whitespace, length, and image validation. Editor tests pin Markdown
dirty tracking, cancellation, table support, and failed-save recovery. Workspace
tests pin durable gateway requests, teacher-edited traceability, version advancement,
approval confirmation, and the read-only approved state. Native repository tests pin
append-only history, stale-write rejection, approval immutability, persistence, and
the downstream use of teacher-reviewed wording.
