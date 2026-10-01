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
