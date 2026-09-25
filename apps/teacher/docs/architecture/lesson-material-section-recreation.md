# Lesson material section recreation

## Purpose

A teacher can recreate one weak lesson-material section, optionally explain what
should change, and keep every edit in the rest of the document. The teacher can
review earlier versions of that section and restore one without rolling back any
other section.

## Guarantees

- Recreation is available only for a finished section in the current draft.
- The job receives the exact current section, confirmed lesson, active lesson step,
  scoped published sources, and the teacher's optional direction.
- The current document remains readable while the replacement is created and
  checked. No model response is visible or durable before validation succeeds.
- A successful replacement appends one complete document version and changes only
  the selected section. Titles, goal links, source links, quality results, and text
  are versioned together.
- Teacher edits in every other section are copied unchanged into the new version.
- Failure, cancellation, and application interruption leave the current document
  unchanged and record an explicit terminal job state.
- A late completion, stale document version, stale window, or second active job is
  rejected at the SQLite boundary.
- Restoring an earlier section appends another complete version; it never rewinds
  the document pointer or mutates history.

## Durable state and version model

Migration `014_lesson_material_section_regeneration.sql` extends the append-only
document ledger with three related records:

- `lesson_material_document_sections` snapshots each section title, learning-goal
  links, quality result, and recreation marker for every document version;
- `lesson_material_document_blocks` snapshots each block's learning-goal and
  published-source links alongside its text and teacher-edited marker; and
- `lesson_material_section_regenerations` records the source document version,
  selected section, teacher direction, generation token, terminal result, and
  target document version.

Document versions record whether they were created by initial generation, a teacher
edit, section recreation, or section restoration. They also identify the changed
section and, when applicable, the teacher direction or restored source version.

The recreation state machine is deliberately separate from the initial creation
state machine because the containing run remains complete and the current document
must stay visible:

```text
generating -> complete
           -> failed
           -> cancelled
```

Only one `generating` recreation may exist for a run. A unique partial index enforces
that rule. Terminal recreation rows and all version snapshots are immutable through
database triggers.

## Application and model boundary

`LessonMaterialsGateway` owns begin, complete, fail, cancel, history, and restore
operations. The React hook holds only the active abort controller; every durable
state comes back from the native gateway after commit.

The section job carries an optional recreation context containing the source version,
teacher direction, and full current section. The local generator labels the current
section as content to replace and labels the direction separately. The same strict
schema, six quality checks, one repair attempt, and unsupported-source scrub used for
initial creation remain in force. Recreation adds one more content-structure rule:
the replacement must materially differ from the current title or at least one block.
Rust repeats that difference check before persistence.

## Atomic replacement and recovery

Completion validates the generation token, selected section, source version, current
draft pointer, learning goals, sources, four block kinds, quality report, image ban,
and material difference. In one SQLite transaction it then:

1. appends document version N+1;
2. copies every unselected section and block from version N;
3. writes the replacement snapshot for only the selected section;
4. compare-and-swaps the run pointer from N to N+1; and
5. closes the recreation job against the new version.

Any failed condition rolls back the whole transaction. Opening a workspace after an
interruption converts an abandoned `generating` job to a durable failure and explains
that the current draft was not changed.

Section history is loaded on demand. Restoration copies the current complete document,
substitutes the selected section from the chosen earlier version, appends N+1 with a
restore marker, and compare-and-swaps the pointer. Edits made elsewhere after the
historical version therefore remain intact.

## Interface contract

Each draft section exposes `Recreate section` and `Version history`. Recreation uses
an optional teacher-language direction field, keeps the old content on screen, offers
an explicit stop action, and states that failure does not alter the draft. Success is
shown in place with the new draft number and a quiet `Recreated` marker; no success
toast is used.

The version-history dialog shows the current and earlier section titles, direction,
recreation marker, restoral origin, and a disclosure for the four saved activities.
Restoring is available only on a draft and only for a non-current version.

## Verification strategy

Repository tests prove cross-section edit preservation, stale-token rejection,
single-section replacement, history, and append-only restoration. Migration tests
prove backfill of existing completed documents. Domain and generator tests prove
direction isolation and rejection of repeated output. Workspace tests exercise the
complete recreate and restore flow. Responsive browser checks cover default, hover,
focus, active, disabled, loading, error, success, history, and 320–1440 px layouts.
