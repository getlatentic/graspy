# Lesson evidence

## Product contract

Class results are an optional record attached to one immutable confirmed lesson
version. A teacher records the outcome of an exit test for exactly three named
teaching groups and each confirmed learning goal. The record is independent of
lesson-material creation: opening, saving, or skipping class results does not call
the local model and does not block the base lesson materials.

The teacher can save incomplete work as a draft. Finishing requires a correct and
total score for every group and learning goal. A finished record remains editable,
but it cannot be returned to draft. Confidence and difficulty use the explicit
one-to-five scale; the common-misunderstanding note is optional.

## Aggregate and invariants

`LessonEvidence` is the transaction boundary. It owns:

- one confirmed lesson-version identifier;
- status `draft` or `complete`;
- a monotonically increasing revision;
- exactly three ordered, uniquely named teaching groups;
- one evidence entry per group and confirmed learning-goal position.

Score values are an all-or-nothing pair. Correct is non-negative and cannot exceed
total; total is between 1 and 1,000. Optional notes are capped at 500 characters.
Confidence and difficulty, when recorded, are integers from one through five.

The application service authorizes the academic session, term, teaching assignment,
lesson and current confirmed lesson version before reading or writing the aggregate.
Supplying an older lesson version or revision fails explicitly. The revision check is
optimistic concurrency control: two open windows cannot silently overwrite each
other.

## Persistence

Migration `010_lesson_evidence.sql` adds three normalized tables:

- `lesson_evidence_sets` stores the lesson-version binding, lifecycle and revision;
- `lesson_evidence_groups` stores the three ordered teacher-owned group names;
- `lesson_evidence_entries` stores per-group, per-learning-goal results.

The lesson-version link is unique. Group and entry replacement happens inside one
SQLite transaction, so a save is visible in full or not at all. Foreign keys cascade
only inside the aggregate. Reopening the database reconstructs the same ordered
workspace without deriving data from model output.

## Commands and dependency direction

The frontend depends on `LessonEvidenceGateway`, not on Tauri. The Tauri adapter maps
the two native commands:

- `get_lesson_evidence_workspace` returns the current confirmed lesson and its saved
  class results, if any;
- `save_lesson_evidence` validates and transactionally returns the new authoritative
  snapshot.

Native commands delegate to the application/domain module; the domain does not know
about Tauri, React, Carbon or a model server.

## Interface state

The interface follows an index-first working pattern. A persistent learning-goal
index shows which goals have scores, while the active goal presents the three groups
in a stable order. Initial setup asks the teacher to name the groups. Draft actions
save and advance or return to lessons; finished results preserve their completed
state when edited.

Carbon supplies accessible form behaviour and focus states. The graspy CSS layer owns
layout and brand tokens. At narrow widths the score pair becomes a single column so
Carbon number inputs remain fully visible; from 960 pixels the learning-goal index is
sticky beside the active editor.

## Test contract

Pure domain tests pin group-name and score validation. Adapter tests reject malformed
native payloads. Component tests cover initial group setup, draft advancement and
editing a finished aggregate without lifecycle regression. Native repository tests
prove atomic save/reopen behaviour and stale-revision rejection. The lessons
integration test proves that opening class results does not invoke material creation.
