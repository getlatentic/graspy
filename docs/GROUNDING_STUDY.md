# Does writing from the curriculum make better lessons?

Decision note for getlatentic/planning#537. Rubric: [GROUNDING_RUBRIC.md](GROUNDING_RUBRIC.md), committed before any lesson was generated or scored. Run on 2026-11-18.

## Recommendation: keep grounding

Keep the held topic's objectives and passages as inputs to every lesson part. Do not make it optional. Two changes follow from the failures below, and neither is about grounding itself:

1. A topic with many objectives is not covered by a lesson of about five slides. Give the plan a slide count that follows the number of objectives, or split the topic.
2. Wrong marked answers are in both arms and are the larger problem: about one lesson in five by the judge, four of 16 clearly (seven counting ill-posed questions) by hand. The answer gate (`checked.py`, `answers/`) ran on every one of these English lessons and let them through. Widen the gate; the grounding is not the cause.

## What was measured

All 24 topics of NERDC JSS 1 Mathematics (September 2025), English, written two ways with the same model (gpt-oss-120b on Bedrock), the same sampling, the same stage inputs and the same answer checks. Grounded is `main` as it is. Ungrounded is the same request with `LessonRequest(grounded=False)`: no objectives and no passages, nothing else changed. Two draws per topic per arm.

- **Lessons generated: 96**, plus 2 trial lessons. All from a laptop straight to Bedrock; staging's API was not called.
- 95 finished. The one that did not was ungrounded (Data Collection, draw 1): the practice question came back with 8 options and the lesson model allows 5. Grounded: 48 of 48 finished. One failure in 48 against none in 48 is no evidence of anything.
- **285 judge calls** (95 lessons, each three times), `openai.gpt-oss-120b`, one lesson at a time, shown the topic's official objectives and the lesson, never the arm. No Claude model was used for any step.
- **16 lessons read by hand** (8 per arm, random, shuffled, no labels). I wrote my scores to a file before I opened the judge's scores or the arm key.

## Numbers (judge; mean per topic over two draws; 24 topics)

| Criterion | Grounded | Ungrounded | Diff | Topics won / lost / tied | Sign test p |
|---|---|---|---|---|---|
| coverage (1 to 5) | 4.35 | 3.10 | +1.24 | 18 / 2 / 4 | <0.001 |
| objectives the judge found taught | 89% | 59% | +30 points | 14 / 0 / 10 | <0.001 |
| correctness | 4.53 | 4.35 | +0.19 | 8 / 6 / 10 | 0.79 |
| level fit | 4.94 | 4.68 | +0.26 | 10 / 3 / 11 | 0.09 |
| teachable | 4.94 | 4.79 | +0.15 | 8 / 3 / 13 | 0.23 |
| no invention | 4.98 | 4.85 | +0.12 | 4 / 1 / 19 | 0.38 |

Lessons with a wrong item, by the judge: grounded 8.0 of 48, ungrounded 10.3 of 47. With an invented claim: 0.3 of 48 and 2.3 of 47. The judge agreed with itself within one point on 96% of repeated scores.

Coverage is the one clear result, and the largest gains are where the topic is wide: Angles 93% against 10%, Whole Numbers 95% against 0%, Fractions 72% against 24%. Without the objectives the model writes a reasonable lesson on the topic's title, and the title is a poor guide: NERDC's "Whole Numbers" is counting in millions and billions, and the ungrounded lesson teaches defining and ordering whole numbers. This also means coverage partly measures something an ungrounded lesson cannot know. It says grounded lessons match NERDC; it does not say they teach better.

Grounded lessons still miss much of a wide topic: Approximation 56% of 15 objectives, Three dimensional figures 60% of 10, Fractions 72% of 17. A lesson of four to six slides cannot hold them.

## Where my reading and the judge disagree

On the 16 lessons read by hand:

| Criterion | Hand | Judge | Hand minus judge | Within one point |
|---|---|---|---|---|
| coverage | 3.81 | 3.90 | -0.08 | 16 / 16 |
| correctness | 3.12 | 4.25 | -1.12 | 9 / 16 |
| level fit | 3.94 | 4.88 | -0.94 | 12 / 16 |
| teachable | 2.88 | 4.88 | -2.00 | 3 / 16 |
| no invention | 4.44 | 5.00 | -0.56 | 14 / 16 |

- **Coverage agrees.** Same level, and every lesson within a point. Where the two arms differ on coverage I trust the judge's number.
- **Teachable and level fit are at the ceiling for the judge** (4.9 on almost every lesson). It did not see a repeated worked example across three slides, a table with the wrong rows, a "your turn" that is already solved above it, or a practice question that cannot be answered as asked. Its small differences between arms on these two are not worth reading.
- **Correctness: the judge catches a key that contradicts its own feedback and misses the rest.** Of the four lessons where I found a clearly wrong marked answer, the judge flagged all four (rounding 184 to 190, an LCM practice question with a key of 4, 2/7 - 1/3 marked 5/21, 9/4 divided by 3/8 marked 4). It missed an outlier called "not an outlier" so the mean is marked right, a median of fruit names, a packing question whose box is smaller than the oranges, and a claim that 1 megabit is 1,000,000 in binary.
- **No invention: the judge gave 5 to all 16.** I scored it below 5 on six lessons, for invented local or technical facts: a hexagonal speed-limit sign, a pentagonal bus sign, a digital clock that stores "10 am" as 1010, 1 megabit as a one followed by six zeros in binary, crates "common among Nigerian traders".
- Direction of the arm difference by hand, eight lessons each: coverage 4.38 against 3.25, correctness 3.75 against 2.50, level fit 4.12 against 3.75, teachable 3.25 against 2.50, no invention 4.75 against 4.12. Clearly wrong marked answers: 1 of 8 grounded, 3 of 8 ungrounded; counting ill-posed questions too, 2 and 5.

## Is the sample big enough?

For coverage, yes: 24 topics, 18 to 2, hand and judge agree. For everything else, no. The judge's correctness, level and teachable differences are not significant and its scores are inflated, so they cannot support a claim either way. My own reading points the same way (grounded better) but rests on 8 lessons per arm and a lesson at a time, so it is a lead, not a result. By the rule fixed in the rubric (same direction by hand and judge, and p below 0.05 on the 24 topics) only coverage counts as real.

## Limits

- The judge is the model that writes both arms (the owner's choice). It may favour its own style. Both arms share the bias, so a difference is less affected than the level, but the inflated level is the likely cause of the ceiling.
- Hand reading was by one reader who also designed the study, on 16 lessons. It was blind to arm, not to the rubric.
- Coverage was scored against NERDC's objectives, which only the grounded arm saw. That is the point of grounding, and also a limit on what the number proves.
- One model, one subject, one class, English only, one run of two draws.

## What I would do next

- Widen the answer gate (`apps/server/src/app/domains/lesson/checked.py`, `answers/`). It repairs a wrong key only where code can work the answer out, and it let through the cases above (rounding 184 to the nearest ten, 2/7 - 1/3, a quotient of fractions). Which escapes code could have worked out, and which no code can, is not yet counted. A separate test is cheaper than any of those: a marked option that disagrees with the lesson's own feedback text. This is the largest measured defect and it is in both arms.
- Slide count by objectives for wide topics (Approximation, Angles, Fractions, Three dimensional figures).
- A sample of 8 per arm is too few to read correctness. If the owner wants that claim, read 30 per arm, with a teacher.

## Evidence

In `docs/baselines/grounding/`: `lessons.json.gz` (all 96 lessons, both arms), `judged.json` (every judgment, with the arm key), `hand-sample.md` (the 16 lessons as read, unlabelled), `hand.json` (my scores) and `hand-key.json` (which arm each was, kept apart until the scores were written). To score the saved lessons again, `gunzip -k lessons.json.gz` and give the result to `grounding_judge.py` as `--arms`. Reproduce with `scripts/grounding_arms.py`, `scripts/grounding_judge.py judge`, `sample` and `report` (see their docstrings); lessons are generated afresh each run, so numbers will differ in detail.
