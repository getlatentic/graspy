# The lesson answer gate

Planning #902. Measured on the 96 English JSS 1 Maths lessons of the grounding study
(getlatentic/graspy PR 165, `docs/GROUNDING_STUDY.md`; its `lessons.json.gz`, both arms, 556 checks;
PR 165 was not merged when this was written, the lessons were read from its branch at 8f80e20).

## What it does

`domains/lesson/checked.py` runs on every slide check and on the practice question before a learner
sees them, in English, before any translation.

1. `answers/` works the answer out of the question where code can: arithmetic, a number in another
   form, a unit conversion, one linear equation, **a number rounded to a place (nearest ten,
   decimal places, significant figures, or each price rounded then added), the LCM and HCF of whole
   numbers and the LCD of fractions, the mean, median, mode and range of a listed set**. A wrong key
   is moved to the one right option; a second right option is taken out; no right option is refused.
   Options that are all exact fractions and none equal the answer (2/7 - 1/3 is -1/21; the options
   were 1/21, 5/21, 1/7, 5/14) are now refused; only decimal or whole options are read as rounded.
2. `answers/contradiction.py` refuses a check that contradicts itself, with no model:
   - its feedback corrects itself ("Oops", "Wait –", "Actually the correct", "sorry", "typo",
     "intended interpretation"), `answers/self_correction.py`;
   - its right-answer feedback points at another option by position ("option 2", "the second
     option", "index 0"), or gives a number that is another option and never the marked one;
   - the marked option says the data has an outlier, or none, against the 1.5 × IQR rule (both usual
     quartile methods must agree), or gives a row name as the median of a frequency table
     (`answers/ill_posed.py`).

A question the gate cannot read is left alone: a check refused wrongly is worse than one not checked.
Guards that keep it so: quantities and unit prices ("3 notebooks at ₦1 250") are never a list to add;
a total that rounds differently before and after adding is not worked out; a list with no single mode,
fractions in an LCM, a negative number to round, and a thousands separator inside a list are not read.

## What a refused question does for the child

A check that cannot be shown is written again, told why (`answers/repair.py:problem`, the same
"say what was wrong, ask for the whole thing again" form as the tutor's tool refusals,
`agent/refusal.py`). A slide check is written again once, the practice question twice, each time told what was
wrong with the last try. Failing that:

- a slide goes on without its check (it teaches nothing wrong);
- the lesson's practice question becomes the last slide question that survived the gate
  (`checked.py:practice_from`), so a lesson never ends with no question. The child answers a question
  they have met, not a wrong one;
- a lesson with no surviving question anywhere ends without one and logs it. This needs every slide
  and the practice question refused, and was not seen in the 96 lessons.

Each repair or refusal is logged without learner data (`answer_check` on the log record), so rates can be counted.

## Counts

Hand reading of the lessons the study flagged (22 by its judge, plus the 16 it read by hand) found
**26 wrong marked answers** (ill-posed questions included) in 22 of 96 lessons, listed in
`docs/baselines/answer-gate/wrong-marked.json` with how each was found. Reading for this found 4 more
in the same lessons (30 in all); the other lessons were not read check by check. The gate before this
change caught 0 of the 30: it worked out 18 of the 556 checks and all 18 were right.

| Kind | Study's | Caught now |
|---|---|---|
| Code can work the answer out from the question (rounding 184, 2/7 - 1/3, estimates, outlier, median of names) | 6 | 6 |
| The lesson's own feedback gives it away (a correction inside, another option named, another position) | 12 | 12 |
| A word problem a model must read (cakes 9/4 ÷ 3/8, 3/7 + 2/5 - 1/3 in a story, a table's mean) | 5 | 0 |
| Judgement about meaning (a box smaller than the oranges, two true statements, 27/4 pictures) | 3 | 0 |

18 of 26 caught (30 reading too: 19 of 30). The 8 left are the case for a model check; none was added
here. A model check would use gpt-oss-120b on Bedrock and must be measured on these 8 and on the right
checks first. Not counted: a claim in a slide's body (1 megabit as 1 000 000 in binary), since it is
not a marked answer.

**False refusals.** The gate acted on 19 of the 556 checks (15 refused for contradiction, 3 moved to the
right option, 1 refused for no right option). All 19 were read by hand against the lesson: 19 wrong, 0 right.
The other 537 were left as written. Reading found two false refusals before this was final, both
fixed and tested: a "–2" in feedback read as 2, and an option that is not a number (13x) looked for in the text.
This measures the 96 lessons only; a rate on other topics needs lessons of those topics.

## Replay

```bash
cd apps/server
PYTHONPATH=src uv run python scripts/answer_gate_replay.py path/to/lessons.json.gz \
    --wrong ../../docs/baselines/answer-gate/wrong-marked.json --show
```

## Shared with the typed tutor

`agent/answer_gate.py` judges the tutor's sentences and is a different gate. The tutor's practice card
(`agent/practice.py`) shares `self_correction`: a card whose feedback corrects itself is sent back to the
model like any refused card. Its `check` expression plays the part of the question reading in `answers/`,
and its `working`-reaches-the-key test plays the part of the feedback-names-the-option test, so nothing
else is shared.
