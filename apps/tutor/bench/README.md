# Reading benchmark

How well the tutor reads what a child meant from the words a recogniser wrote. `interpretation.jsonl` holds 91
distinct recognised answers from the pedagogy rig's staging runs, each with what the simulated child meant
(`number` with its value, `dont_know`, or `unclear` for words that were no answer) and what the recogniser wrote.
The voice is a cloned, pitched-up one, so these are **not children**; the corpus measures the readers, not children.

```bash
node bench/build-corpus.ts            # rebuild the corpus from ../pedagogy/runs (not committed)
npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799
node bench/run.ts                     # in another terminal
```

`run.ts` scores today's reader (sound-alike table, the small model, the plain "I don't know") against Clef
(`src/interpret.ts`): right, a wrong answer, a wrong "don't know" (the mistakes that matter), or asked again.
Run it after changing a threshold in `src/interpret.ts`, and put the result in the commit.

Latency here is through a laptop and Cloudflare's remote preview, so it is higher than in the Worker; read it as a
comparison, and read the tutor's own `{"part":"clef","ms":…}` log lines for the real one.

## What it says (2026-10-01)

On these 91 answers, with the prompt written without any of the corpus's own mishearings in it, in the order turn.ts
tries them, with Clef asked only about a word or two, and with its answer taken only above the thresholds:

| | right | wrong answer | wrong "don't know" | asked again | median (preview) |
|---|---|---|---|---|---|
| today: table, small model, regex | 58 | 3 | 0 | 30 | 0.24 s |
| Clef first, small model after | 59 | 5 | 0 | 27 | 1.16 s |

Of the five wrong answers, three are the recogniser's ("210", "14" and "to 10" are written that way and both readers read
them as written); Clef adds one ("Two, two." as 22) and fixes one ("I don't" as not knowing). An earlier run scored Clef at 64
because the prompt listed mishearings taken from this corpus: that was in-sample and is not the figure. So `INTERPRETER=clef`
stays off. Two limits on the verdict: 85 of the 91 rows were written by Whisper or Intron, not Nova-3 (now the English
recogniser, whose errors are mostly "no number" and not a different one), and none is a child. Run it again on Nova-3's
errors, and on real children's, before the verdict is trusted either way.

## Routing (what a child said)

`run-routing.ts` scores `src/router.ts` on `routing.jsonl` (71 hand-written cases: answers, sound-alike answers,
garbled words, "I don't know" in English and Pidgin, requests to hear the question again, needing the toilet or water,
questions, off-topic). Every utterance goes to one model (Gemma 26B on Bedrock) that chooses a tool. For an answer the model reports the number, and
the Worker checks it against the words by sound (`src/sounds-like.ts`) before it counts as marked. It needs the bench Worker with
`AWS_BEARER_TOKEN_BEDROCK` in the git-ignored `bench/.dev.vars`. A word or two is acted on only as not knowing, asking to hear it
again or needing help; anything else is left to the marking.

On 2026-10-02, after review fixes: 71 cases, 46 right, 24 left to the marking (safe, and slower), 1 wrong action (a garbled
phrase read as needing help, which lets the child go), median about 0.65 s for the one call through the laptop and remote
preview. Clef, tried first on 2026-10-01, gave 0 false answers but could not write a reply and added a second call; one model is
simpler. The cases were written by the person who wrote the router.

The sound check (`src/sounds-like.ts`) accepts a word as a number only when it is about as long, with the same first and last
sounds and at most one sound different. Over a 210,000-word dictionary, 0.1 to 3.5 percent of words pass for any one
number (before the length bound and the last-sound rule it was up to 28 percent). Some common words still do: "play", "ball", "fun",
"water" and "done" pass for three and ten, and "don't" and "toilet" for twenty and forty. The check is a net under the model, which is told
never to answer the sum; it does not replace that.

## The same boundary (2026-10-02)

`run-routing.ts <url> <gemma|clef|clef-flash> [threshold]` runs each router through the same rules `turn.ts` applies: the safety words
(src/safety.ts) before every action, an action that is not an answer left to the marking where the words may be one, a word or two acted on
only as not knowing, asking again or a need, and a need the model found in words that are no more than the answer misheard marked as the answer.
A Clef "answer" goes to the usual reading, which gives no number, so it is counted right for an answer row without a number check, and a wrong action on a row that expects a need (the child would not be let go); Gemma's is
right only if the number it reports sounds like the words and is the one said. Clef writes no reply, so a child who says something else costs a
second call to a language model. Latency is inside the remote preview and varies run to run (Clef 0.4 to 1.0 s).

On the 82 cases (the first 71 plus eleven with a need beside an answer, a word for a need that is the answer misheard, or a need in other words):

| router | right | left to marking | wrong action |
|---|---|---|---|
| Gemma 26B, about 0.5 s | 56 | 25 | 1 |
| Clef at 0.7 | 41 | 41 | 0 |
| Clef at 0.5 | 49 | 32 | 1 |
| Clef-flash at 0.7 | 50 | 32 | 0 |

The one Gemma wrong action is "To me, sink." read as a need to go.

## The observation boundary (2026-10-02)

The router chooses one of seven actions, which cannot say that a child is ill and gave a number. An observation reports independent
judgments (the number read, not knowing, asking again, a question or something else, garbled, the toilet, water, illness, injury, fear,
asking for a grown-up), each a probability; `src/policy.ts` decides in a fixed order with a threshold per judgment (safety, a need,
a usable answer, not knowing, asking again, a question or something else, garbled). The model is not told the answer to the question;
code applies it (a lone word that is the number asked for, misheard as a word for a need, is the answer).

`bench/observation.jsonl` labels each case by what the child communicated, not by an action (the set has grown; see "The observation set"
below). The first 132 cases were the 82 of the router bench and 50 more that overlap on purpose (ill and a number, thirsty and a number,
"number two" as an answer and as a need, "pain", "sick", "pee", "I am afraid it is five" and "I am afraid because someone hit me", ten litres of
water, "I fell down", Pidgin). `run-observation.ts <url> <gemma|clef|clef-flash> [train|dev|test|routing|all|real] [thresholds]` scores each judgment (precision and recall at its threshold), the number
read, and what the controller decides against the order above, after the rule turn.ts applies to a word or two called garbled or
something else (left to the marking). The router is scored by `run-routing.ts` with the same rules, so the two tables are comparable.

The table below is from 2026-10-02, on those 132 cases with the split they had then (assigned by hand: dev 88, test 44; Clef's thresholds were
tuned on that dev). Those splits no longer exist: every case now has the split its id gives (next section), so these rows are not comparable
with the baseline there.

| as decided | right | left to marking | need or safety missed | wrong number | marked a non-answer | wrong action | no observation | median |
|---|---|---|---|---|---|---|---|---|
| observation, Gemma 26B: dev (88) | 64 | 16 | 0 | 0 | 0 | 2 | 6 | 1.0 s |
| observation, Gemma 26B: test (44) | 31 | 9 | 0 | 0 | 1 | 3 | 0 | 0.9 s |
| observation, Gemma 26B: the router's 82 | 55 | 21 | 0 | 0 | 1 | 2 | 3 | 0.9 s |
| the router, Gemma 26B: the same 82 (PR 116) | 56 | 25 | 0 | 0 | | 1 | 0 | 0.5 s |
| observation, Clef (talk and garbled at 0.8): test (44) | 25 | 16 | 0 | 0 | 0 | 3 | 0 | 0.9 s |
| observation, Clef: the router's 82 | 47 | 33 | 0 | 0 | 0 | 2 | 0 | 0.8 s |

Read plainly: on these cases the observation is not more accurate than the router once both go through the same gates, and it is
slower and sometimes empty. What it has that the router cannot: a child who is ill and gave a number, or who needs the toilet and
thinks it is ten, is handled (a test per case), every judgment can be scored and thresholded alone, and a fine-tuned model has
labelled fields to learn. It never missed a need or safety concern and never marked a wrong number.

- "No observation" is the 3 s call timing out under the bench's load (no non-OK status and no bad JSON was logged): 0 to 7% of calls,
  p50 1.0 s, p90 1.5 s. A timeout leaves the usual marking, as the router's does, but costs the child 3 s.
- Its mistakes are "garbled" against "something else" (a different line, no try either way), two garbled turns it read as a number
  (`To recent.`, `What is five?`), and safety false positives on lone words that may be an answer (`pain`, `tummy`, `sicks`): the safe direction.
- The number asked for is credited only where it is written in the words and no other number was read (a sound-alike is never credited
  with it: "tree" is three, though it is a "ten" to the sound check); a number the question holds, said by a child who is asking, is the
  child's echo of it; water in a question about water is its subject.
- Gemma's tool arguments fall apart when a dozen scores sit flat in one tool (keys wrapped in quotes, repetition to the token limit: 4
  of 6 valid with the flat tool, 2 of 6 with it reordered, 6 of 6 nested). Structured output with the nested shape is 8 of 8, so it is what is used.
  Leaving out what is not true (a sparse shape) collapses to empty objects.
- Clef at the default 0.5 reads 6 more on dev for 8 more wrong actions (its probabilities for "garbled" and "something else" are too
  high to use there); it writes no reply, so a child who says something else costs a second model's call.
- `OBSERVER=on` turns the observation on. The router stays the default; the next step is the output cost (about 90 tokens of scores),
  by fewer or terser fields or a smaller model, and fine-tuned judgments on the labelled data.
- A whole set sent at once is throttled by the hosts (7% empty and the latency measured was the queue's); the scorer sends four at a time.

## Router with the observer beside its second request (`run-hedge.ts`, 2026-11-07)

`worker.ts` has a `/hedge` endpoint and `run-hedge.ts` sends each routing case to two arms, alternating: today's router alone and
the router with the observer started at 1.2 s (`src/hedge-route.ts`). Local Worker to Bedrock, 71 cases x 4 rounds, 328 turns each:

| | median | p90 | p99 | max | over 3 s | observer asked | no action |
|---|---|---|---|---|---|---|---|
| router | 809 ms | 1050 | 2233 | 3002 | 2 | 0 | 2 |
| hedged (before the 3 s cap) | 819 ms | 1084 | 2781 | 4205 | 2 | 21 (answered first 1) | 1 |

The observer's own median is about a second, so started at 1.2 s it almost never beats the router's second request; what it buys is an
action where the router gives none (2 turns became 1 in this run), which is the case that fell through to the 10 s teacher loop. Before the
cap the observer could also be waited for to 4.2 s; the hedge now stops at the router's own 3 s.

## The observation set, its split and the baseline (2026-11-18)

`observation.jsonl` has 802 cases (it had 132). Each is `{id, source, heard, prompt, expected, labels}`: what the recogniser wrote, the
question, the number it asks for, and what the child communicated, field by field (an answer and its number, not knowing, asking again, garbled,
a question, something else, the toilet, water, illness, injury, fear, asking for a grown-up). Several fields can be true in one case.
All of it is synthetic: no case is a child.

| source | cases | train | dev | test | how it was made |
|---|---|---|---|---|---|
| hand | 130 | 85 | 24 | 21 | the earlier 132 less two exact duplicates; written by hand (the 82 of the router bench have `"set":"routing"`) |
| template | 221 | 139 | 42 | 40 | `template-cases.ts`: 18 hand-written templates (a phrase, a question, a number), expanded and cut to a fixed share by the hash of each id; `add-template-cases.ts` |
| staging | 69 | 40 | 16 | 13 | the answers of the pedagogy rig's staging runs (`interpretation.jsonl`: cloned adult voice, not children), labelled by `add-staging-cases.ts`, which says how each kind of case is labelled (`meant` keeps what the child meant) |
| gpt-oss-120b | 382 | 221 | 85 | 76 | `model-cases.ts` and `add-model-cases.ts`: gpt-oss-120b on Bedrock (the bench Worker's `/generate`) writes 12 lines at a time to a brief such as "a child who needs the toilet and also gives a number"; the label is the brief |
| all | 802 | 485 | 167 | 150 | |

No model that graspy runs is a Claude model: gpt-oss-120b writes and re-reads the model cases, Gemma 26B is the observer. The templates, the staging rules and the reading of samples below are the coding agent's own work, as the rest of the repo's data is. Each id is kept for ever and never reused (two removed duplicates and the dropped model lines leave gaps).

### The split rule

The split of a case is the first eight hex digits of SHA-256 of its id, as a number, modulo 100: below 60 is `train`, below 80 is `dev`,
the rest is `test` (`splitOf` in `observation-set.ts`; the file stores no split). The id alone decides it, so a case never moves when others are
added, removed or reordered, and anyone can recompute it in any language. The shares are 60, 20 and 20 percent and hold to within a point over many ids.

- `train`: what a prompt is written from, a model is fine-tuned on, a template is made to cover.
- `dev`: where thresholds and prompts are chosen, and where the baseline below is taken. `run-observation.ts` accepts thresholds only on dev and train.
- `test`: read once for each change to the model, the prompt or the policy that was chosen on dev, never to choose. Not read for this baseline.
- `real`: real children's turns. A different set, never hashed into the three above, empty until the pilot (#547): see `REAL_TURNS.md`.

A case written to fill a gap that a score showed is added with a new id; where it lands is its hash, so a gap seen on dev is not closed by
putting the case into dev.

### How the model-written labels were checked

A label made by brief is true only when the model wrote to the brief, so each model line was read twice.

1. A blind second reading: gpt-oss-120b is given the words and the question and none of the label or the brief, and labels the line
   (`screen-model-cases.ts`). It disagreed with the brief on 63 of 368 lines (17%).
2. I read all 63, and a random 60 of the 305 it agreed with (the 60 whose ids hash lowest under `"s"+id`). Read cases carry `review`: `agreed`, or `relabelled`.
   - Of the 63 it disagreed on, 27 had a wrong label (20 removed, 7 relabelled) and 36 were right. Most of the 36 are one reading against another
     of overlapping definitions: a child asking about school is a question and, to the reader, something else; "my head hurts" is pain, so illness, and
     to the reader an injury; fear is a complaint, which the reader's "no need and no complaint" excludes from something else.
   - Of the 60 it agreed on, 1 was wrong (1.7%, from 60 reads: it could be anywhere from about 0 to 9%). So about 4 of the 245 unread lines are probably still wrong (1%).
   - Counting both, about 9% of the lines were wrongly labelled before the check, and the 28 found were removed or fixed.
   - The worst brief was "gives a number in a sentence that uses a word like water or sick for its own meaning": 6 of its 12 lines described a complaint of the child's own and were removed.
3. A second batch of 48 lines (to bring fear to 30 cases) was read in full: 13 wrong, 12 of them one brief ("gives a number and says they are afraid", which produced
   "seven makes me nervous"); that brief was taken out of `model-cases.ts` and the 13 lines removed.
4. I read 40 template cases, picked by hash: no wrong label; one ambiguous ("can we sing a song?" is something else or a question).

An earlier draft of these lines was discarded: the same screen showed that my own line parser cut the first digit of every two-digit number
("ten" became 0), so the check found a bug in the instrument before it found a bad line (`tests/model-cases.test.ts` keeps it fixed).
The labeller and the writer are the same model, so a misreading it shares is not seen; the 60-line read is the only independent check, and it is small.

### The baseline

`node bench/run-observation.ts http://localhost:8799 gemma dev`, the observer as it is on main (Gemma 26B on Bedrock, `src/observation.ts`,
policy thresholds as in `src/policy.ts`), the bench Worker running locally. Twice, with the same counts both times:

| as decided, dev (167 cases) | right | left to marking | need or safety missed | wrong number | marked a non-answer | wrong action | no observation | median |
|---|---|---|---|---|---|---|---|---|
| observation, Gemma 26B | 147 | 17 | 1 | 0 | 1 | 1 | 0 | 1.0 to 1.2 s |

Right by source: hand 20 of 24, template 38 of 42, staging 11 of 16, gpt-oss-120b 78 of 85. By field at its threshold (precision, recall):
not knowing 100%, 100%; asking again 100%, 100%; garbled 100%, 86%; physical need 95%, 100%; safety 98%, 98%; question or something else 41%, 100%;
the number read exactly on 62 of 66 answers, and an answer reported where none was said on 2 of 101.

Read it with care:
- The hand-written cases are the hardest (20 of 24, 83%) and the model-written ones the easiest (92%): a model writes the sentences a model reads easily. The
  figure that is comparable with the earlier tables is the hand row, and 24 cases are too few to say more than that it did not get worse.
- "Question or something else" has low precision because it fires beside a need or a safety concern too ("I want to drink water"); the controller acts on the
  need first, so it is not a wrong action. Its misses to read: `water` (the child meant ten; the observer took it as a request), a number marked where the
  case asks for a grown-up ("ask my mom if ten is correct"), and a sum the model worked out ("I'm not sure how to add five and one" marked as 6).
- Staging is 11 of 16 because it holds what the recogniser wrote for a voice that is not a child's: "Fiennes" for three, "Zen" for ten.
- This is a baseline for changes, not a claim about children. What it says about real children waits for `REAL_TURNS.md`.

Rebuild or extend the set (Node 24.2 or later, from apps/tutor; each script adds only the ids that are not in the file):

```bash
node bench/add-template-cases.ts
node bench/add-staging-cases.ts
npx wrangler dev --config bench/wrangler.jsonc --port 8799   # with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars
node bench/add-model-cases.ts            # asks gpt-oss-120b; ids it already holds are not asked again
node bench/screen-model-cases.ts http://localhost:8799 screen.json   # blind second reading of the lines nobody has read; then read the differences
node bench/run-observation.ts http://localhost:8799 gemma dev
```

`tests/observation-set.test.ts` fails when the split rule moves a case, an id is used twice, the same words are put to the same question twice, a
real turn is in the file, or a field has fewer than thirty cases.
