# Lesson-planning architecture

## Canonical lesson model

The original implementation stores each step as a title, one teacher-activity
string, one learner-activity string and an optional duration. That contract is
an accepted migration source, not the final lesson model. It loses the
objective, knowledge, assessment and content-block structure already proven in
plan-to-tutor and is too coarse for reliable generation or international
curriculum alignment.

The canonical lesson aggregate contains:

```text
Lesson
  -> curriculum alignments
  -> atomic objectives
  -> teacher-facing lesson objectives
     -> knowledge component and prerequisites
     -> one objective-aligned core step
        -> explanation blocks
        -> worked example with ordered solution steps
        -> practice with answer and hints
        -> verified source visuals
  -> intro step
  -> evaluation step with objective-aligned assessment items
```

Intro, core and evaluation are structural roles rather than prompt conventions.
Knowledge type controls the required teaching blocks: a concept requires an
explanation; a procedure or representation requires explanation, worked example
and practice. Evaluation contains assessment items with expected answers and
objective links. These invariants are enforced by the native domain before a
draft can be confirmed.

Pasted preparation and guided authoring both produce this same aggregate through
the self-contained program described in
`docs/architecture/generation-program-runtime.md`. Teacher and learner
activities remain ordered lists attached to the relevant step; they are not
used as containers for the instructional content itself.

Existing confirmed lesson versions remain immutable. Migration wraps their
coarse fields in an explicit legacy-import representation. A granular version
is appended only after the teacher reviews the prepared conversion; the system
never invents missing structure silently.

## Purpose

A teacher opens one academic session, term, subject and class, then creates a
lesson from a teaching week or deliberately starts an unscheduled lesson. The
lesson can be typed in structured fields or pasted exactly as written. Drafts
can be reopened and moved before confirmation; each confirmation creates an
immutable version.

## Teacher flow

1. The workspace keeps the active session, term, subject and class visible.
2. **Plan lesson** on a teaching-week entry opens a prefilled lesson and retains
   the weekly plan, curriculum unit and learning-outcome identifiers.
3. Break and examination weeks do not offer **Plan lesson**, and the native
   boundary rejects forged or stale launches.
4. **New lesson** starts an explicitly unscheduled draft.
5. The teacher either completes the starting fields or stores an exact pasted
   plan. Both routes remain drafts until **Prepare lesson** resolves their
   curriculum scope and installed source material.
6. Preparation runs the cancellable granular program and saves its complete
   record without confirming the lesson. A pasted source remains unchanged and
   visible throughout review.
7. The five-part review covers overview, learning goals, starting point, lesson
   flow and checks for understanding. Teacher-authored copy is editable;
   curriculum identity, source evidence, verified figures and program history
   are visible bindings rather than mutable fields.
8. **Save changes** validates and persists the complete granular record.
   **Confirm lesson** atomically promotes a pasted preparation when necessary
   and appends an immutable version with its curriculum, evidence and program
   snapshots.
9. Before confirmation, a teacher can move a lesson to a different term or to
   another assignment with the same subject and class level. The moved lesson is
   explicitly unscheduled unless a compatible weekly plan is supplied.

## Ownership and data flow

```text
SchemeOfWorkWorkspace
  -> LessonLaunch (week id + entry id)
     -> LessonsWorkspace (view and editor state only)
        -> LessonPlanningGateway
           -> typed Tauri command
              -> lesson_planning repository
                 -> SQLite transaction
```

React owns navigation, selection, editable teacher fields and pending/error
presentation. `useLessonPreparation` owns the explicit idle, preparing, failed
and cancelled request states. The planning gateway resolves the authoritative
curriculum and source input; the local generator owns completion transport and
strict response parsing, but not persistence. React does not decide academic
compatibility, curriculum linkage, source scope, confirmation eligibility or
version semantics. The native domain validates the complete aggregate, and the
repository resolves every supplied identifier against the active academic
context before committing a transaction.

## Persistence

- `lessons` is the editable aggregate and records its academic context, optional
  weekly plan, structured or pasted input, original pasted source after
  confirmation, and latest confirmed version number.
- `lesson_preparations` and `lesson_preparation_steps` store the editable review
  separately from the lesson working aggregate. The exact source text is bound
  to the preparation and cannot be updated.
- `lesson_steps` stores the ordered working steps.
- `lesson_curriculum_outcomes` stores identifier links copied from the selected
  weekly plan; curriculum statements are not converted into mutable lesson text.
- `lesson_versions`, `lesson_version_steps` and `lesson_version_outcomes` form
  the append-only confirmed history. SQLite triggers reject updates and deletes.
- `lesson_granular_drafts`, `lesson_granular_preparations` and
  `lesson_granular_versions` store hash-bound JSON aggregates for the canonical
  plan, curriculum snapshot and evidence snapshot plus the exact program
  identity, digest and run. The version table is immutable.
- `plan_format` is explicit on working, preparation and version rows. Migration
  labels every existing row `legacy_import`; only teacher-reviewed granular
  persistence changes the format.

Structured lists use validated JSON columns because they are aggregate-owned
values replaced together with the draft. Ordered steps and curriculum links use
relational tables because they have independent identity, ordering and foreign-key
integrity requirements.

## Invariants

1. A lesson's session, period and assignment must form a valid academic context.
2. A scheduled lesson requires a teaching week and entry from that exact context.
3. Scheduled lessons retain the curriculum course, unit and outcome identifiers
   resolved from the weekly plan.
4. An unscheduled lesson has no partial weekly-plan or curriculum linkage.
5. Pasted input preserves the exact text and cannot contain silently generated
   structured fields.
6. Preparing a pasted lesson does not change its input mode, status, source text
   or version number.
7. A prepared review requires at least one learning goal and one complete step.
   Missing materials and assessment remain visible omissions; confirmation
   requires the teacher to complete them.
8. A pasted lesson can be confirmed only when a prepared review is durably bound
   to its current exact source text.
9. Preparing, saving review changes and confirming are separate operations.
   Only confirmation converts the lesson to structured input and appends a
   version in one SQLite transaction.
10. Structured input requires at least one learning goal, step, material and
   assessment item.
11. Only structured drafts can be confirmed.
12. Confirmation appends a numbered version; previous versions cannot be changed
   or deleted.
13. Only drafts can move, and only to the same subject and class level in an
   explicitly selected class or term.
14. Every native mutation returns a fresh snapshot read after the transaction.
15. A granular record is accepted only when its plan matches its curriculum
   snapshot, its generated claims stay inside installed source evidence, its
   prerequisite graph is acyclic and every objective has at least one core step
   and an assessment.
16. Verified visual blocks must match an installed source figure by record,
   filename, checksum, caption and alternative text.
17. Saving a granular record updates flat columns only as a compatibility read
   model; the hash-verified granular aggregate remains the source of truth.
18. Model stages generate prose and ordinal selections. Curriculum, objective,
   knowledge-component, source-record and figure identities are resolved by the
   application from the immutable snapshots; a model cannot author or decorate
   those identifiers.
19. Fraction comparison and ordering answers are calculated by the mathematics
   verifier before validation and persistence. The model supplies the teaching
   approach, not arithmetic authority.

## Native contracts

- `get_lesson_workspace(request)`
- `get_granular_lesson_program_input(request)`
- `create_granular_lesson_completion(request_id, request)`
- `cancel_lesson_preparation_completion(request_id)`
- `save_granular_lesson(request)`
- `confirm_granular_lesson(request)`
- `save_lesson_draft(request)`
- `move_lesson_draft(request)`

The older preparation and confirmation commands remain registered only for
opening and completing explicit `legacy_import` records. New preparation does
not call them.

Requests and responses use teacher-domain names and remain independent of the
Tauri transport. Zod validates native responses before they enter React state.

## Verification contract

Automated tests cover strict domain decoding, prerequisite cycles,
knowledge-type block requirements, objective/core/assessment coverage, source
and visual integrity, curriculum drift, lossless legacy labelling, granular
save/reopen/confirm, immutable version hashes, multi-node assembly and malformed
node output, request cancellation, native command mapping and semantic teacher
editing. Visual verification covers 1440 px and 375 px review layouts with no
horizontal overflow, and the release-profile macOS bundle is launched as part
of verification. The installed Gemma E2B model passes the complete nine-node
canonical Ordering of fractions harness, including deterministic identity
binding, verified-figure resolution and canonical fraction answers. Core
instruction and independent practice are separate model-authored stages joined
by deterministic assembly, so practice repair cannot rewrite worked examples.
The exact
bundled Nigeria evaluation package also resolves through the installed
curriculum and corpus, runs on the production nine-node program and installed
Gemma model, and passes objective alignment, source boundary, mathematical
correctness and lesson completeness at `1.0`. The saved qualification artifact
is `output/ordering-fractions-qualification.json`. Stable artifact fingerprints
and gate scores are recorded in
[`../content/ordering-fractions-gemma-qualification.md`](../content/ordering-fractions-gemma-qualification.md).
