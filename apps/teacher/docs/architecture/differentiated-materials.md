# Group materials and comparison

## Purpose

A teacher creates a version of the approved lesson materials for each of three
teaching groups, then checks every adjusted block beside the original before using
it. The learning goals and approved source boundary do not change.

## Guarantees

- Creation uses the finished class results and optional overall lesson signals for
  the selected group.
- Each adjusted section preserves the original section and block learning goals.
- The local model receives only source excerpts already cited by the original
  section; it cannot widen the source set.
- Every candidate passes deterministic structure, alignment, source, change, and
  unsupported-claim checks before SQLite accepts it.
- Original and adjusted review, worked example, practice, and solution blocks are
  shown side by side for the selected group and section.
- Failure, cancellation, interrupted work, and success are durable, explicit states.
  The application never substitutes the original section as an adjusted result.

## Immutable input snapshot

Migration `011_differentiated_materials.sql` creates one run bound to an exact:

- confirmed lesson version;
- complete original-material run;
- complete class-results set and revision;
- ordered set of three teaching groups;
- mapped learner state and optional overall lesson signals;
- original section and block content; and
- subset of source excerpts cited by the original section's blocks.

The snapshot makes a completed run reviewable after class results or the lesson are
later changed. Changed class results cannot be mixed into an active run: a revision
check rejects the next claim and the teacher must create a new run.

## Boundaries and data flow

The feature uses ports and adapters. React coordinates work through
`DifferentiatedMaterialsGateway` and
`DifferentiatedMaterialSectionGenerator`. The gateway owns durable native
transitions; the generator owns one constrained section request. Neither contract
depends on Tauri or a particular model server.

1. The native repository checks that original materials are teacher-approved and
   class results are complete for the current immutable lesson version.
2. Starting a run snapshots the three groups, the current approved wording, and exact
   source boundary in one SQLite transaction.
3. `begin_differentiated_material_section` claims one group-section pair and issues
   a unique generation token.
4. The generator keeps one section-level application contract but makes one strict,
   item-sized request for each original block, then assembles the four results.
5. The result is checked in TypeScript, then checked again at the native persistence
   boundary before it is committed.
6. The comparison workspace renders the committed snapshot returned by SQLite.

The generator interface remains section-sized, so persistence and UI orchestration do
not depend on request granularity. Item-sized generation is enabled inside that
interface because a current qualified-model run copied the entire original section,
and repeated the copy after a whole-section repair. The item-sized strategy produced
three distinct, validated support, consolidation, and challenge sections through the
same installed model and production single-slot server configuration.

## Constrained generation and quality policy

The prompt adapts teaching support, explanation density, practice difficulty, hints,
and feedback according to the group's mastery band, exact score, optional confidence
and difficulty, teacher-recorded common misunderstanding, interest, and end-of-lesson
feeling. It explicitly prohibits changing the learning goal, inventing source
provenance, or exposing a group's test answer.

The local server receives a strict JSON Schema for exactly one block per request. Four
bounded calls cover review, worked example, practice, and solution. The assembled
section then passes the deterministic validator, which checks:

1. complete four-block structure;
2. exact section learning-goal preservation;
3. exact block-to-goal alignment;
4. source keys contained by the immutable original-section source set;
5. at least one material change; and
6. no invented-source claim or learner-identifying test wording.

A failed candidate receives one bounded repair request containing the exact findings.
If unsupported-source wording is the sole remaining failure, only the offending
sentences may be removed deterministically and revalidated. Any other remaining
failure becomes a retryable failed section; it is never hidden.

## Durable state machine

Each group section moves through:

```text
pending -> generating -> done
                     -> failed -> generating
                     -> pending  (when creation is stopped)
```

The containing run is `running`, `paused`, `failed`, `cancelled`, or `complete`.
Every completion, failure, and cancellation must own the current generation token.
Late results from an older request are rejected. Reopening interrupted work converts
`generating` to a visible, retryable failure.

## Comparison workspace

The screen uses a Workbench comparison desk rather than cards or a dashboard. The
group selector and ordered section index remain visible while the document area shows
each original block beside the adjusted block. Teacher-facing support labels replace
internal mastery policy keys. At narrow widths the pair becomes a single reading
column while preserving original-first order, full keyboard operation, visible focus,
and 44-pixel targets.

## Verification strategy

Domain tests pin learning-goal, block, source, change, unsupported-claim, repair, and
cancellation behavior. Native repository tests pin the three-group snapshot, exact
source scoping, generation-token fencing, durable completion, and interruption
recovery. Component tests pin comparison semantics, prerequisite messaging, group
switching, and automatic continuation after retry.
