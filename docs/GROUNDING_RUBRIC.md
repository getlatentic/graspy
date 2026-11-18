# Grounded against ungrounded lessons: the rubric

Fixed on 2026-11-18, before any lesson of this study was generated or scored (planning issue getlatentic/planning#537).

## The question

Does a lesson written from the official objectives and textbook passages of its topic (grounded, as `main` writes a held topic) come out better than the same topic written without them (ungrounded)? The held course is NERDC JSS 1 Mathematics (September 2025): 24 topics, written in English.

## The two arms

- **Grounded.** The lesson service as it is: the topic's objectives and passages are inputs to the plan, slide and practice writers.
- **Ungrounded.** The same service, same model, same sampling, same stage inputs and checks; the topic has no objectives and no passages. Only the objectives and passages differ.

Each topic is written twice per arm (two draws), so each arm has 48 lessons.

## What a scorer sees

One lesson at a time: the class, the subject, the topic, the topic's official NERDC objectives (the same list for both arms), and the lesson as a learner reads it (objectives, key points, slides with their checks, the practice question). Never the arm, never which passages were used. Lessons are shuffled and identified by a random id. The judge scores each lesson three times, so its noise can be measured.

## The five criteria

Each is scored from 1 (poor) to 5 (excellent).

1. **coverage.** How much of the topic's official objectives the lesson teaches. 5 = every objective is taught, 3 = about half, 1 = almost none. The scorer also lists the numbers of the objectives it finds taught, from which a coverage fraction is computed.
2. **correctness.** Every statement, worked step, marked answer and feedback in the lesson is mathematically right. A single wrong marked answer or wrong working caps this at 2.
3. **level_fit.** Vocabulary, notation and the size of each step suit a JSS 1 pupil (about 11 to 12 years old, Nigeria), and the content is within the objectives' level, not above or below.
4. **teachable.** A JSS 1 maths teacher could use the lesson in class as it stands: ordered, worked examples before practice, checks that test what was taught, no slide that needs rewriting first.
5. **no_invention.** The lesson makes no claim about the curriculum, an exam, a textbook, a standard or a rule that the objectives do not support. 5 = none, 3 = one doubtful claim, 1 = several invented ones. The scorer also counts the invented claims it finds.

Not scored: length, wording style, or whether the lesson mentions its sources.

## The judge, and its limits

- Judge: `openai.gpt-oss-120b` on Bedrock. No Claude model for anything in this study (owner's rule), including writing cases.
- The judge is the model that writes both arms. It may favour its own style; the same bias is in both arms, so a difference between arms is less affected than the absolute level. This is a stated limit, not a correction.
- A sample of each arm is read by hand, shuffled and unlabelled, with scores written down before the judge's scores or the arm key are opened. Where the two disagree is reported.

## Deciding

- Difference per topic (grounded minus ungrounded, mean of draws) on each criterion; the mean difference, and how many of the 24 topics favour each arm (sign test, two-sided).
- A difference counts as real only if it is in the same direction in the hand reading and the judge, and the sign test on the 24 topics gives p < 0.05. Otherwise the sample is called too small to decide.
- Failures are counted separately and read: a wrong marked answer, an invented claim, a lesson that did not finish.
- Recommendation is one of: keep grounding, change it, make it optional.
