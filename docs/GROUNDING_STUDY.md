# Does writing from the curriculum make better lessons?

Decision note for getlatentic/planning#537. Rubric: [GROUNDING_RUBRIC.md](GROUNDING_RUBRIC.md), committed in `ad2a2d2` before any lesson was generated or scored. Run on 2026-11-18.

## Answer

Grounded lessons are better aligned with the official NERDC objectives. This study does not show that they are better lessons in any other way: correctness, level fit, usability and invented claims all fail the rubric's own gate. Coverage is the only measure that passes it, and it is measured against objectives that only the grounded arm was shown.

## Recommendation: keep grounding

This is a product judgement, not a finding. graspy wants its lessons to follow NERDC, and grounding is what makes a lesson do so (coverage 4.35 against 3.10; the objectives the judge found taught 89% against 59%). That is reason enough to keep it, and nothing here argues for making it optional. If alignment were not wanted, this study would not justify the extra inputs on quality grounds.

Two changes follow from the failures below, and neither is about grounding:

1. A topic with many objectives is not covered by a lesson of about five slides. Give the plan a slide count that follows the number of objectives, or split the topic.
2. Wrong marked answers are in both arms and are the larger problem: about one lesson in five by the judge, four of 16 clearly (seven counting ill-posed questions) by Claude Code's reading. The answer gate (`checked.py`, `answers/`) ran on every one of these English lessons and let them through. Widen the gate; grounding is not the cause.

## Who did what

- **Lessons:** written by `openai.gpt-oss-120b` on Bedrock (temperature 0.0, reasoning effort low), the model of `.env`.
- **Judge:** the same model, one lesson at a time, shown the topic's official objectives and the lesson, never the arm.
- **Second reader:** Claude Code, the assistant that built this study, so a Claude model, not a human and not a teacher. The owner's rule is that no Claude model is used in anything graspy runs, a judge included; Claude Code authoring data and code is allowed. No Claude model wrote or judged a lesson. The readings below are Claude Code's, and it also designed the rubric and the scripts, so it is not independent of the study.
- The scripts now refuse a Claude model and write the model id, temperature and seed into every output file. The files of this run were written before that and have the model added from `.env` as it was after the run (marked in their `meta`).

## What was measured

All 24 topics of NERDC JSS 1 Mathematics (September 2025), English, written two ways with the same model, the same sampling, the same stage inputs and the same answer checks. Grounded is `main` as it is. Ungrounded is the same request with `LessonRequest(grounded=False)`: no objectives and no passages, nothing else changed (a test asserts that every model call has the same inputs except those two). Two draws per topic per arm.

- **Lessons generated: 96**, plus 2 trial lessons. All from a laptop straight to Bedrock; staging's API was not called.
- 95 finished. The one that did not was ungrounded (Data Collection, draw 1): the practice question came back with 8 options and the lesson model allows 5. Grounded: 48 of 48 finished. One failure in 48 against none in 48 is no evidence of anything. Every table below is the same with and without unfinished lessons, since none of the judged lessons was unfinished.
- **285 judge calls** (95 lessons, each three times).
- **16 lessons read by Claude Code** (8 per arm, random, shuffled, no labels), scores written to a file before the judge's scores or the arm key were opened.
- **No shared state touched.** The scripts call `LessonService().events(...)` and nothing else. Saving a lesson is done by `LessonRunner`, which they do not use, and they write only local files. The service keeps no cache keyed by country, topic or class; the one `functools.cache` in `writers.py` is keyed by the signature actually built, which differs between the arms; DSPy's cache is off. Only two places build a `LessonRequest` (the service's own `generate_lesson` and `LessonRunner`), neither takes the `grounded` flag, and no route builds one from client input, so the flag cannot be set from outside.

## Numbers (judge; mean per topic over two draws; 24 topics)

| Criterion | Grounded | Ungrounded | Diff | Topics won / lost / tied | Sign p | Signed-rank p | Holm p |
|---|---|---|---|---|---|---|---|
| coverage (1 to 5) | 4.35 | 3.10 | +1.24 | 17 / 2 / 5 | 0.001 | <0.001 | 0.004 |
| objectives the judge found taught | 89% | 59% | +30 points | 14 / 0 / 10 | <0.001 | <0.001 | 0.001 |
| correctness | 4.53 | 4.35 | +0.19 | 8 / 6 / 10 | 0.79 | 0.30 | 0.79 |
| level fit | 4.94 | 4.68 | +0.26 | 10 / 3 / 11 | 0.09 | 0.019 | 0.37 |
| teachable | 4.94 | 4.79 | +0.15 | 8 / 3 / 13 | 0.23 | 0.15 | 0.68 |
| no invention | 4.98 | 4.85 | +0.12 | 4 / 1 / 19 | 0.38 | 0.25 | 0.75 |

Holm's correction is over the six rows, applied to the sign-test p. Level fit is nominal on the signed-rank test (0.019) and not after correction. Differences that are only float error from averaging count as ties; an earlier count of 18 coverage wins included one such tie.

Lessons with a wrong item, by the judge: grounded 8.0 of 48, ungrounded 10.3 of 47. With an invented claim: 0.3 of 48 and 2.3 of 47.

**The judge against itself.** Its three scores of a lesson are at temperature 0.0, so they are not independent draws, and most of its scores are 5: "within one point" would be near 100% for any judge. The measure to read is the weighted kappa between two scores of one lesson: coverage 0.91, correctness 0.82, level fit 0.74, teachable 0.54, no invention 0.38. The last two are weak: the judge is not stable on exactly the criteria that matter for usability.

**The judge disagrees with its own list.** The ten ties on "objectives taught" against five on the coverage score come from topics where the judge lists every objective as taught in both arms and still scores coverage 5 against 3.67 (Addition, Subtraction and Multiplication in base 2, for example). Its coverage score is not just the fraction it lists, so the two coverage numbers are two measures, not one measured twice.

Coverage is the one clear result, and the largest gains are where the topic is wide: Angles 93% against 10%, Whole Numbers 95% against 0%, Fractions 72% against 24%. Without the objectives the model writes a reasonable lesson on the topic's title, and the title is a poor guide: NERDC's "Whole Numbers" is counting in millions and billions, and the ungrounded lesson teaches defining and ordering whole numbers. So coverage partly measures something an ungrounded lesson cannot know. It says grounded lessons match NERDC; it does not say they teach better. The grounded lessons also tend to echo the objectives' wording, which makes the arm guessable from the text and makes coverage partly lexical matching; the judge was not shown the arm, but a judge can tell.

Grounded lessons still miss much of a wide topic: Approximation 56% of 15 objectives, Three dimensional figures 60% of 10, Fractions 72% of 17. A lesson of four to six slides cannot hold them.

## Where Claude Code's reading and the judge disagree

On the 16 lessons read:

| Criterion | Reader | Judge | Reader minus judge | Same score | Within one point |
|---|---|---|---|---|---|
| coverage | 3.81 | 3.90 | -0.08 | 16 / 16 | 16 / 16 |
| correctness | 3.12 | 4.25 | -1.12 | 8 / 16 | 9 / 16 |
| level fit | 3.94 | 4.88 | -0.94 | 4 / 16 | 12 / 16 |
| teachable | 2.88 | 4.88 | -2.00 | 0 / 16 | 3 / 16 |
| no invention | 4.44 | 5.00 | -0.56 | 10 / 16 | 14 / 16 |

- **Coverage agrees.** Same level, and the same score on every lesson. Where the two arms differ on coverage I trust the judge's number.
- **Teachable and level fit are at the ceiling for the judge** (4.9 on almost every lesson). It did not see a repeated worked example across three slides, a table with the wrong rows, a "your turn" that is already solved above it, or a practice question that cannot be answered as asked. Its small differences between arms on these two are not worth reading.
- **Correctness: the judge catches a key that contradicts its own feedback and misses the rest.** Of the four lessons where I found a clearly wrong marked answer, the judge flagged all four (rounding 184 to 190, an LCM practice question with a key of 4, 2/7 - 1/3 marked 5/21, 9/4 divided by 3/8 marked 4). It missed an outlier called "not an outlier" so the mean is marked right, a median of fruit names, a packing question whose box is smaller than the oranges, and a claim that 1 megabit is 1,000,000 in binary.
- **No invention: the judge gave 5 to all 16.** I scored it below 5 on six lessons, for invented local or technical facts: a hexagonal speed-limit sign, a pentagonal bus sign, a digital clock that stores "10 am" as 1010, 1 megabit as a one followed by six zeros in binary, crates "common among Nigerian traders".
- Direction of the arm difference in the reader's scores, eight lessons each: coverage 4.38 against 3.25, correctness 3.75 against 2.50, level fit 4.12 against 3.75, teachable 3.25 against 2.50, no invention 4.75 against 4.12. Clearly wrong marked answers: 1 of 8 grounded, 3 of 8 ungrounded; counting ill-posed questions too, 2 and 5.

Same direction on eight lessons per arm is weak: a flip of two lessons erases most of these gaps.

## Is the sample big enough?

For coverage, yes: 24 topics, 17 to 2, the reader and the judge agree, and it holds after correction. For everything else, no. The judge's correctness, level and teachable differences are not significant and its scores are inflated, so they cannot support a claim either way. Claude Code's reading points the same way (grounded better) but rests on 8 lessons per arm and a lesson at a time, so it is a lead, not a result. By the rule fixed in the rubric (same direction in both and p below 0.05 on the 24 topics) only coverage counts as real, and it is the criterion that the grounded arm had the answer to.

## Limits

- The judge is the model that writes both arms (the owner's choice). It may favour its own style. Both arms share the bias, so a difference is less affected than the level, but the inflated level is the likely cause of the ceiling.
- The second reader is a Claude model and the study's designer, read 16 lessons, and was blind to arm but not to the rubric. It is not a teacher.
- Coverage was scored against NERDC's objectives, which only the grounded arm saw.
- The judge is run at temperature 0.0, so its repeats understate its noise.
- One model, one subject, one class, English only, one run of two draws.

## What I would do next

- Widen the answer gate (`apps/server/src/app/domains/lesson/checked.py`, `answers/`). It repairs a wrong key only where code can work the answer out, and it let through the cases above (rounding 184 to the nearest ten, 2/7 - 1/3, a quotient of fractions). Which escapes code could have worked out, and which no code can, is not yet counted. A separate test is cheaper than any of those: a marked option that disagrees with the lesson's own feedback text. This is the largest measured defect and it is in both arms.
- Slide count by objectives for wide topics (Approximation, Angles, Fractions, Three dimensional figures).
- To claim anything about correctness or usability, read about 30 lessons per arm with a JSS 1 Mathematics teacher.

## Evidence

In `docs/baselines/grounding/`: `lessons.json.gz` (all 96 lessons, both arms, with the model), `judged.json` (every judgment, with the arm key, model, temperature and seed), `hand-sample.md` (the 16 lessons as read, unlabelled), `hand.json` (Claude Code's scores) and `hand-key.json` (which arm each was, kept apart until the scores were written). To score the saved lessons again, `gunzip -k lessons.json.gz` and give the result to `grounding_judge.py` as `--arms`. Reproduce with `scripts/grounding_arms.py`, `scripts/grounding_judge.py judge`, `sample` and `report` (see their docstrings); lessons are generated afresh each run, so numbers will differ in detail.
