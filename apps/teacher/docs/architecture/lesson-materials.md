# Lesson materials creation

## Purpose

A teacher creates complete lesson materials from a confirmed lesson and can see which lesson step is waiting, being created, ready, or needs attention. The teacher can stop a long-running creation, retain every completed section, and retry only the section that failed.

## Guarantees

- Every confirmed lesson step produces one ordered materials section.
- A section contains review notes, a worked example, practice, and a solution.
- Creation uses the immutable confirmed lesson version, the active step, its learning goals, and only source material linked to that step.
- Sections are created sequentially and committed independently.
- Stopping creation cancels the active model request and preserves committed sections.
- A failed section can be retried without recreating completed sections.
- Reopening the application recovers the durable run instead of presenting abandoned work as active.

## Boundaries and data flow

The feature follows ports and adapters. React owns interaction state and presentation, but it does not own durable progress. The application gateway defines the persistence operations. Tauri commands implement that gateway, and the Rust repository owns every state transition in SQLite. Local model transport remains behind `LessonMaterialSectionGenerator`.

1. The teacher opens materials for a confirmed lesson.
2. `start_lesson_material_run` snapshots one ordered section per confirmed lesson step.
3. `begin_lesson_material_section` atomically claims the next eligible section and issues a unique generation token.
4. The frontend sends the returned immutable job context to the local model.
5. The result is committed with `complete_lesson_material_section`, or the error is committed with `fail_lesson_material_section`.
6. The next section is claimed only after the previous transition is durable.

The frontend never infers a successful transition from an in-memory model response. It renders the workspace snapshot returned after the SQLite commit.

## Durable state machine

A materials run is bound to one confirmed lesson version. Its sections move through these states:

```text
pending -> generating -> done
                     -> failed -> generating
                     -> pending  (when stopped)
```

The containing run is `running`, `paused`, `failed`, `cancelled`, or `complete`. A failed section blocks automatic continuation until that exact section is retried. A cancelled run keeps completed sections and may continue from its next pending section.

Each claim receives a generation token. Completion, failure, and cancellation must present the same token. This fences late model responses after cancellation or retry and prevents them from overwriting newer work.

If the application restarts while a section is marked `generating`, opening the workspace marks that section as failed with an interruption message. The teacher can then retry it explicitly.

## Persistence

Migration `006_lesson_materials.sql` introduces:

- `lesson_material_runs`: one durable run per confirmed lesson version;
- `lesson_material_sections`: ordered section state, attempts, generation token, and errors;
- `lesson_material_blocks`: the four structured teacher-facing material blocks;
- `lesson_material_sources`: durable source text and identifiers;
- `lesson_material_section_sources`: the explicit section-to-source relationship.

Migration `008_lesson_material_quality.sql` adds durable quality outcomes, validation
passes, block-to-learning-goal links, and block-to-source links. See
`lesson-material-quality.md` for the validate, repair, and scrub contract.

Migration `009_lesson_material_documents.sql` adds immutable run figures linked to
their exact published source. It stores only package-relative PNG names plus caption,
alternative text, dimensions, origin address, ordering, and integrity hash. Figure
bytes remain in the read-only content package rather than the teacher database.

Migration `013_lesson_material_editing.sql` adds an append-only document-version
ledger. A completed run starts at draft 1; every teacher save creates the next full
snapshot, and approval makes the selected version immutable. See
`lesson-material-editing.md` for the edit, concurrency, approval, and downstream-use
contract.

Migration `014_lesson_material_section_regeneration.sql` versions section metadata
and every block's goal/source links, then adds a token-fenced recreation job. A
validated replacement appends a complete draft while changing only the selected
section; history can restore that section into a new draft without rewinding other
edits. See `lesson-material-section-recreation.md`.

The confirmed lesson version and lesson steps are immutable inputs. If the teacher confirms a newer lesson version, the existing run remains an audit record but cannot be continued with the changed lesson.

## Source policy

Generation receives only published excerpts explicitly attached to the active section,
with a maximum of three relevant excerpts. The exact excerpts and attribution are
snapshotted when the run is created. Every generated block must reference only keys
from that bounded set.

Source material is evidence, not an instruction channel. The prompt labels it separately and requires the model to avoid unsupported claims.

## Native command contract

- `get_lesson_materials_workspace` returns the confirmed lesson and its current durable run.
- `start_lesson_material_run` creates or returns the version-bound run.
- `begin_lesson_material_section` claims the next pending section or one explicitly failed section.
- `complete_lesson_material_section` validates and atomically commits the four blocks,
  their goal/source links, and their complete quality history.
- `fail_lesson_material_section` records an actionable failure and any quality findings.
- `cancel_lesson_material_run` returns the claimed section to pending and marks the run cancelled.
- `get_lesson_material_figure` authorizes one stored figure against the active lesson
  version, verifies the bundled hash, and returns local PNG data. It never accepts a
  path or remote address from the UI.
- `edit_lesson_material_block` appends a complete draft from the expected current
  version and returns the committed workspace snapshot.
- `approve_lesson_material_version` freezes the expected current draft and returns
  the read-only approved snapshot.
- `begin_lesson_material_section_regeneration` claims one section against the exact
  current draft and returns the replacement job.
- `complete`, `fail`, and `cancel_lesson_material_section_regeneration` close that
  token-fenced job without hiding failure or changing the draft on failure.
- `get_lesson_material_section_history` loads the selected section's immutable
  versions on demand.
- `restore_lesson_material_section` appends a new draft with only the selected
  section restored from the requested earlier version.

## Verification strategy

Repository tests cover atomic ordering, complete job context, cancellation token fencing, exact-section retry, crash recovery, and persistence across transitions. Frontend tests cover durable progress rendering, sequential completion, and exact failed-section retry. The local model integration test is opt-in and exercises the production grammar and parser against a running llama.cpp-compatible server.
