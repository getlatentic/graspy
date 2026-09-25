# Lesson-material quality cascade

## Product contract

Every generated lesson-material section is untrusted until it passes deterministic
checks. A section may be shown as ready only after the application has either accepted
the first response, repaired it once, or removed unsupported source-attribution
sentences deterministically. Other unresolved failures remain attached to the section
as work that needs attention.

The teacher sees one of three completed quality indicators:

- **Quality checked**: the first response passed;
- **Improved automatically**: one bounded model repair passed;
- **Source wording adjusted**: unsupported source-attribution wording remained after
  repair and was removed without model judgement.

Internal check identifiers and model operations are not customer-facing language.

## Deterministic checks

`lessonMaterialValidation.ts` runs six checks in a fixed order:

1. `content_structure`: exactly one review, worked example, practice task, and
   solution, with usable bounded text and no model-authored image markup;
2. `learning_goal_alignment`: every block names at least one section learning goal,
   and the block union covers exactly the section goal set;
3. `scope_compliance`: every named goal belongs to the immutable confirmed lesson;
4. `source_presence`: when published sources are supplied, every block names at least
   one;
5. `source_validity`: every block source key is unique and belongs to the section's
   bounded source set;
6. `unsupported_source_claims`: generated exercises, answers, or solutions may not be
   described as coming from or mirroring a textbook or source.

These checks are structural and deterministic. They do not pretend to perform
semantic fact verification. Source excerpts remain bounded evidence, and the output
records explicit block-to-source links so later document traceability is derived from
stored identifiers rather than inferred from prose.

## Repair and scrub state machine

```text
generate -> validate(initial) -> pass
                            \-> repair once -> validate(repair) -> pass
                                                             \-> claim-only failure
                                                                 -> scrub sentences
                                                                 -> validate(scrub) -> pass
                                                             \-> any other failure -> failed
```

The repair call receives only the immutable section job, the failed complete section,
and actionable findings from the failing checks. It uses the same `AbortSignal` as the
original generation request, so stopping creation also stops repair. No recursive
repair or unbounded retry exists.

The scrubber is deliberately narrow. It removes complete sentences containing known
source-provenance claims such as “mirrors the textbook exercise”. It never rewrites
instructional content. The scrubbed candidate must pass all six checks; an empty or
otherwise invalid block fails instead of being presented as ready.

## Persistence and trust boundary

Migration `008_lesson_material_quality.sql` adds:

- section quality outcome, repair flag, and removed-claim count;
- normalized block-to-learning-goal links;
- normalized block-to-source links;
- validation passes and all six check outcomes, versioned by section attempt.

The native completion boundary independently validates goal ranges, exact block
kinds, block coverage, source membership, and report consistency before one atomic
commit. A failed quality report is persisted with the failed attempt. Retrying clears
the current indicator while preserving historical validation rows; a successful retry
records a new attempt rather than overwriting the audit trail.

Existing material sections created before this migration remain readable with no
quality indicator. New completed sections cannot omit the quality report.

## Test contract

Pure TypeScript tests cover valid material, missing goal coverage, out-of-scope goals,
missing and invalid source keys, unsupported source wording, repair success, bounded
repair failure, claim scrubbing, and cancellation during repair. Native tests cover
atomic persistence of block traceability and all check outcomes, failed-attempt
history, retry clearing, and generation-token fencing.
