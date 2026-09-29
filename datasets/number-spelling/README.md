---
pretty_name: "graspy number spelling"
language:
  - en
license: cc-by-4.0
task_categories:
  - text-generation
tags:
  - education
  - numbers
  - text-normalization
  - speech
---

# graspy number spelling

Lines a voice teacher might say to a Nigerian primary-school child, each with digits in it, and what a small language model made of them when asked to write every number as words so the line can be spoken. 125 English lines in twelve categories, run on two hosts (Cloudflare Workers AI and Amazon Bedrock, both gpt-oss-20b), 250 replies in all.

It was made to decide which lines graspy's tutor may trust the model with. The tutor only accepts a spelling that code can verify. This set shows what the model does with the lines code cannot verify.

## Files

```text
lines.jsonl     one line per input: id, category, line
results.jsonl   gpt-oss-20b: one row per line and host: the reply, latency, the automated check's verdict, a judgement
results-gpt-oss-120b.jsonl   the same lines on gpt-oss-120b (Workers AI and Bedrock); judgements for replies that differ from 20b's
results-qwen.jsonl   the same lines on four Qwen models
probe/          the small Worker that produced the replies (see below)
```

Fields of `results.jsonl`: `id`, `category`, `host` (`workers-ai` or `bedrock`), `line`, `reply`, `latency_ms`, `automated` (`pass`, `uncheckable`, or `no_digits`), `judged` (`good`, `awkward`, `bad`), `note`, `judged_by`.

## Method

The prompt is the tutor's own (`spellingBrief` in `apps/tutor/src/spell.ts`): rewrite the line so every number written in digits is written in words, change nothing else, reply with the line only. Temperature 0.

- **Automated.** When every run of digits in a line stands alone (`5`, `45`, `120`, not `3:30`, `50%` or `1,000`), the reply is checked against the line with each number written out by code: it must read the same, word for word, punctuation included. 57 of the 120 lines with digits were checkable, and the model passed all 57 on both hosts. Those rows are `good`, judged by `automated check`.
- **Judged by a reader.** The other 63 lines have numbers joined to other things (`3:30`, `₦500`, `50%`, `1st`, `3B`, `1/2`, `2.5`, `1990`, `1,000`) with no single correct reading for code to compare against. Each reply was read by Claude Code (an Anthropic model, acting as the reviewer at the owner's request) and labelled:
  - `good`: ready to say to a child as it is
  - `awkward`: the meaning is right but the text reads oddly (a leftover `₦`, `%`, `:` or `/`, or a year read as a quantity)
  - `bad`: wrong, a digit left in, or words glued together
- **These labels are one reviewer's, not a human's, and have not been checked by a person.** Treat them as a first pass. Where the two hosts differ, each has its own label.

## Results

Of the 63 lines code cannot check (Workers AI; Bedrock is the same on all but one line):

| Category | good | awkward | bad |
|---|---|---|---|
| ordinals and labels (`1st`, `Class 3B`) | 5 | 0 | 1 |
| large numbers (`1,000`, `2500`, `200,000,000`) | 7 | 1 | 0 |
| mixed letters and digits (`B12`, `A4`, `1A`) | 6 | 1 | 1 |
| decimals, fractions, percent | 4 | 4 | 2 |
| years, dates, phone numbers | 4 | 3 | 0 |
| signs, ranges, negatives | 3 | 3 | 0 |
| time (`3:30`) | 2 | 5 | 0 |
| money (`₦500`) | 0 | 9 | 0 |
| measurements | 1 | 0 | 0 |
| times tables (`9s`) | 0 | 0 | 1 |

What this says:

- Standalone numbers, ordinals (`1st` to `first`), decimals (`2.5` to `two point five`), negatives, big numbers with separators, phone numbers and letter-plus-digit labels come out right. They are the categories worth adding a code check for, so the tutor can accept them without relying on a reader.
- Money is never wrong, but every reply leaves the naira sign in the text (`₦five hundred`) instead of `five hundred naira`. Times leave the colon (`ten: fifteen`, `seven:zero five`), and Bedrock once dropped a zero (`7:05` to `seven: five`). Percent signs and fraction slashes are left in (`fifty%`, `one/two`), and one fraction kept a digit (`three/4`).
- Years come out as quantities (`one thousand nine hundred ninety`) where a teacher says `nineteen ninety`. IDs read as quantities too. Ranges come out as `five-ten`, not `five to ten`.
- Glued labels (`Class threeB`, `Form oneA`) are wrong.
- Latency was about one second per line on both hosts, with occasional stalls of ten seconds or more, which is why the tutor gives up on a spelling after four seconds.

The tutor's rule follows from this: a line whose numbers all stand alone is checked by code and the model may spell it; every other line is left to the teacher model to rewrite.

## A bigger model

The same 125 lines were run on `gpt-oss-120b` on both hosts (`results-gpt-oss-120b.jsonl`). Of the 63 lines code cannot check:

| Model and host | good | awkward | bad | median latency |
|---|---|---|---|---|
| 20b, Workers AI | 32 | 26 | 5 | 0.5 s |
| 20b, Bedrock | 32 | 25 | 6 | about 1 s |
| 120b, Workers AI | 35 | 19 | 9 | 2.2 s (one call took 19.6 s) |
| 120b, Bedrock | 34 | 25 | 4 | 0.9 s |

The 57 lines code can check were passed by 120b too. The bigger model is better at some things (it writes `one half` for `1/2`, `fifty percent` for `50%`, `nineteen sixty` for a year, `Nine nines`) and worse at others (it glued letters to numbers, `Afour`, `Bseven`, `HtwoO`, `xtwo`, and `1st` became `onest` once). It is not a clear improvement on this set, and on Workers AI it is four times slower. The failures differ by model and host and are not consistent from line to line, which is the reason a spelling on a line code cannot check should not be trusted, whichever model wrote it.

## Qwen

Four Qwen models on the 120 lines with digits (`results-qwen.jsonl`; three on Bedrock, one on Workers AI), with the same prompt and the same automated check. The 63 lines code cannot check are judged as above. Latency is from one run.

| Model | Checkable lines passed (of 57) | good | awkward | bad | median / slowest call |
|---|---|---|---|---|---|
| gpt-oss-20b (for comparison) | 57 | 32 | 26 | 5 | 0.5 s / 1.5 s (stalls of 10 s or more seen) |
| qwen3-next-80b-a3b-instruct, Bedrock | 57 | 42 | 16 | 5 | 0.7 s / 1.3 s |
| qwen3-235b-a22b-2507, Bedrock | 55 | 43 | 16 | 4 | 1.1 s / 6.3 s |
| qwen3-32b, Bedrock | 53 (see below) | 48 | 13 | 2 | 0.6 s / 0.9 s |
| qwen3-30b-a3b-fp8, Workers AI | 57 | 27 | 23 | 13 | 2.4 s / 7.9 s |

- `qwen3-next-80b-a3b-instruct` follows the instruction exactly on every checkable line and does markedly better than gpt-oss on the others: `10:15` becomes `ten fifteen`, `7:05` becomes `seven oh five`, `80%` becomes `eighty percent`, `1/2` becomes `one-half`, `Class 3B` becomes `Class three B`, and no reply took over 1.3 s. It still glues some letters to numbers (`Utwelve`, `Nseven hundred`) and once left `two:30`.
- `qwen3-32b` reads best aloud but does not do only what it was told: it also turns `+` and `=` into `plus` and `equals` (`3 + 4 = 7` becomes `Three plus four equals seven`) and `21 July` into `twenty-first July`. The automated check rejects those four lines for changing words other than the numbers, though they are better to say aloud; they are judged `good` here. It once dropped a leading zero from a phone number and once dropped the letter from `Q3`.
- `qwen3-235b-a22b-2507` left digits in two replies and once copied the prompt text into its answer.
- The Workers AI Qwen (`qwen3-30b-a3b-fp8`) returned nothing for 6 of the 120 lines and was the slowest.

## Reproducing

`probe/` is a Worker that runs the same prompt and check. From `apps/tutor`, with `SPELLER_HOST` and the Bedrock key in a `.dev.vars` next to `probe/wrangler.jsonc`:

```bash
npx wrangler dev --config ../../datasets/number-spelling/probe/wrangler.jsonc --port 8797
curl localhost:8797 -d '{"lines":[{"id":"x","line":"You said 45."}]}'
```

## Limits

- English only, and lines written for this test, not taken from lessons.
- The two hosts serve the same model, so they are one system twice, not two systems.
- Judgements are by one model reader, unchecked by a person, and about how a line reads, not how it sounds when spoken.
- Licence and where to publish are the owner's to settle.
