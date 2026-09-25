# Group learner state

## Product contract

Group learner state is a deterministic interpretation of finished class results. It
does not call the local model and does not infer facts that the teacher did not
record. The output is the bounded input for group lesson materials.

The service accepts only a complete lesson-evidence aggregate tied to the current
immutable lesson version. Draft or malformed results fail explicitly. Missing scores
never become low mastery by default.

## Mastery bands

For each teaching group and confirmed learning goal:

```text
mastery = questions correct / questions total

mastery < 0.50          -> remediate
0.50 <= mastery < 0.75  -> reinforce
mastery >= 0.75         -> extend
```

The three identifiers are stable internal policy keys carried forward from the
qualified learner-state service. They are not customer-interface labels. The
differentiated-material generation policy owns the concrete teaching instruction
associated with each key.

The derived state retains the exact counts alongside the ratio and band. A small exit
test therefore remains visibly small evidence instead of being presented as a
precision percentage.

## Recorded signals

The optional common-misunderstanding note is teacher-authored. Derivation trims it and
otherwise preserves it exactly; it does not classify, rewrite or invent a diagnosis.

Confidence and difficulty use one canonical five-point vocabulary shared by the class
results form and the personalisation mapper:

| Score | Confidence | Difficulty |
| --- | --- | --- |
| 1 | Not sure at all | Very easy |
| 2 | A little sure | Easy |
| 3 | Somewhat sure | Okay |
| 4 | Mostly sure | Difficult |
| 5 | Very sure | Very difficult |

The mapper renders the label with its source value, for example `a little sure (2/5)`.
This prevents a model from confusing direction or scale when several numeric signals
appear together.

Mastery is rendered from counts, for example `1 of 4 exit-test questions correct`.
The raw typed state remains available beside these phrases; rendering does not replace
the source values.

Teachers may also record two optional whole-group signals for the lesson: interest and
how the lesson felt at the end. Both use bounded five-point vocabularies in the class
results form. The mapper carries their self-describing labels into the group-material
snapshot; an omitted signal stays absent and is never inferred.

## Boundaries and lifecycle

`deriveLessonLearnerState` creates one lesson-level aggregate containing:

- immutable lesson-version and evidence-set identifiers;
- the evidence revision used for derivation;
- exactly three ordered teaching groups;
- one state for every confirmed learning goal.

`toPersonalisationState` is a separate boundary mapper. It converts numeric signals
to self-describing phrases while preserving group identity, goal identity, band and
the teacher's common-misunderstanding note.

The current state is intentionally derived rather than stored. Class results can still
be edited, so storing a second mutable current copy would create drift. Creating a
group-material run snapshots the complete mapped state, its optional lesson signals,
and the class-results revision in one transaction. That immutable historical snapshot
belongs to the material run; it is not a second source of current learner state.

## Test contract

Tests pin both mastery boundaries and the values immediately below them, all ten
confidence and difficulty phrases, lesson-signal mapping, count rendering,
misunderstanding preservation, group and goal ordering, revision binding, and
rejection of draft, incomplete or goal-mismatched evidence. A component assertion
verifies that the class-results form uses the same canonical scale labels as the
mapper.
