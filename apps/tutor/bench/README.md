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

## Routing (what a child says that is no number)

`run-routing.ts` scores `src/router.ts` on `routing.jsonl` (62 hand-written cases: answers, sound-alike answers, garbled
words, "I don't know" in English and Pidgin, requests to hear the question again, questions, off-topic). It needs the
bench Worker with `AWS_BEARER_TOKEN_BEDROCK` in the git-ignored `bench/.dev.vars`. It applies the rules turn.ts applies:
words with a number or a table sound-alike are left to the marking, and a word or two is acted on only as not knowing or
asking to hear it again.

On 2026-10-01: 62 cases, 21 handled by the router and right, 40 left to the marking (safe, and slower), 1 wrong action
("I don tire", Pidgin for being tired, read as not knowing), median about 1.3 s through the laptop and remote preview for
Clef then the model. Before the gates, a word or two called "garbled" or "something else" was taken, which would have
thrown away right answers written as sound-alikes (tin, tim, sicks); the cases are the same, and that is why they are gated.
The cases were written by the person who wrote the router.
