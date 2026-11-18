# Real children's turns: the held-out set

Rule for the held-out half of the observation set. **Nothing here is collected, copied or created yet**: the set is filled only after the pilot
(planning #547), and only with the owner's yes. The synthetic set and its split are in `README.md`; this is the part of #548 that waits for the pilot.

A real turn is what a real child said in a real lesson, as the recogniser wrote it, with the question that was asked and a label by a person of what the child
communicated.

## Where it lives

- One JSONL file **outside this repository**, whose path is in the environment variable `GRASPY_REAL_TURNS`, on the owner's encrypted disk. Not in `apps/`, not in a
  branch, not in a pull request, an issue, a chat or a log. The root `.gitignore` also ignores `*.real.jsonl` and `apps/tutor/bench/real/` as a net under a mistake.
- Same row as the synthetic set (`Row` in `observation-set.ts`) with `source: "real"` and `id: "real-<number>"`, numbered in the order turns are added and never reused.
  There is no split field and the split rule is never applied to it: a real turn is not train, dev or test, it is `real`. `loadReal` refuses a file with a row that is not `real`,
  and `problems` refuses a `real` row in `observation.jsonl`, so neither set can be mistaken for the other.
- A row holds the words, the question, the number it asks for and the labels, and nothing else: no name, learner id, device, audio, time of day or school.

## What may go in

- Only turns whose recordings consent stands (the `recordings` scope of the voice-consent design), for as long as it stands and inside its retention period;
  a withdrawal or an expiry deletes the row. Under-13 consent is an open legal question (see the voice-consent notes); the first row waits for its answer.
- A person reads every turn when labelling it. A turn with a name, an address, a phone number or anything else that names a person or a place is left out, not edited.
- Labels are made by a person from the words, with a second person on at least one in five; the agreement is reported for each field. No model writes or checks a real label,
  gpt-oss-120b included, and no Claude model sees the turns at all.

## What it may never be used for

- Never to tune: not thresholds, prompts, templates, few-shot examples, fine-tuning, the choice between models, or the choice of what to build next from a particular turn.
  `run-observation.ts` refuses thresholds on `real` (and on `test`).
- A failure seen on real turns is fixed by writing synthetic cases for the kind of failure, in new words (never the child's words, never a paraphrase kept close), into the
  synthetic set, where their hash puts them in train, dev or test.
- Not sent to any model that writes or labels cases. The only model that reads a real turn is the one being scored, on the host the tutor already sends that turn to.

## What stays out of git and logs

- The text of a real turn is never printed, committed, logged or pasted. `run-observation.ts real` prints counts and the ids of the cases that failed, never the words
  (`score(rows, replies, false)` in `observation-score.ts`, with a test that the report holds none of the words). To read a failed case, open the file on the owner's machine by id.
- The bench Worker logs a status and an error, never a child's words. `OBSERVER_LOG_TEXT` in the tutor Worker stays off for any lesson whose turns may enter the set.
- Numbers about the set (counts, rates, intervals) may be reported anywhere; a quoted example may not.

## How it is scored

```bash
GRASPY_REAL_TURNS=/path/outside/the/repo/turns.real.jsonl node bench/run-observation.ts http://localhost:8799 gemma real
```

- The same report as dev: each field's precision and recall at the policy's thresholds, the number read, and what the controller decides, with a count for each way of being wrong. A need or
  safety concern that is missed, and a wrong number, are reported first.
- It is run once for each model or policy that was chosen on dev, after the choice is made, and its result is reported next to the dev result as the gap between synthetic and real. A worse score on real
  turns than on dev is a finding about the synthetic set, not a reason to retune on the real one.
- A number is quoted for a field only with at least 100 real turns in all and 20 that have that field; below that the report says "no estimate". Rates come with a 95% interval (Wilson), not a bare percent.
- The set grows only by adding turns; a turn already scored is not edited to change a result.
