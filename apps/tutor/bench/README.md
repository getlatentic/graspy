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

## Clef as the router (2026-10-02)

`run-clef-routing.ts` scores Clef and Clef-flash on the same 71 cases with a router-only schema (one `action` question, no number
question). Raw top choice: Clef 53 right, Clef-flash 45. At a threshold of 0.7: Clef 39 right with 4 wrong and 28 handed on; Clef-flash
36 right with 2 wrong and 33 handed on. At 0.85 neither is wrong, and 49 to 58 of 71 are handed on. At its top choice Clef-flash sent 13
non-answers to "mark this" and missed 2 of the hurt-child cases: its probabilities are flat. Latency inside the Worker under `wrangler dev
--remote`: Clef 0.92 s median, Clef-flash 0.55 s, against about 0.6 s for the Gemma call; Cloudflare's post gives 209 ms and 39 ms, which this
setup did not reproduce and which the deployed Worker may. A model that decides and a model that writes are separate jobs, and six of the seven
actions need no written line, but at these numbers a Clef router would hand a third to a half of utterances on to a second model. Re-run this when
Clef is fine-tuned on routed turns, or when its latency is measured in the deployed Worker.
