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
results-llama-gemma.jsonl   the same lines on four Llama and two Gemma 3 models, and the Workers AI Gemma that gave no reply
results-gemma-4.jsonl   the same lines on three Gemma 4 models
probe/          the small Worker that produced the replies (see below)
tts-roundtrip/  how each version of each line sounds: Spitch speaks it, Whisper transcribes it (see below)
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

## Llama and Gemma

Six more models on the 120 lines with digits (`results-llama-gemma.jsonl`), by the same method. Llama runs on Workers AI; Bedrock's model list has no Llama. Latency is from one run.

| Model | Checkable lines passed (of 57) | good | awkward | bad | median / slowest call |
|---|---|---|---|---|---|
| llama-4-scout-17b-16e-instruct, Workers AI | 57 | 41 | 20 | 2 | 0.29 s / 1.05 s |
| llama-3.3-70b-instruct-fp8-fast, Workers AI | 55 | 34 | 21 | 8 | 0.38 s / 5.0 s |
| llama-3.1-8b-instruct-fast, Workers AI | 52 | 40 | 17 | 6 | 0.23 s / 0.41 s |
| llama-3.2-3b-instruct, Workers AI | 45 | 41 | 7 | 15 | 0.23 s / 0.42 s |
| gemma-3-27b-it, Bedrock | 56 | 35 | 21 | 7 | 0.9 s / 15.8 s |
| gemma-3-12b-it, Bedrock | 53 | 50 | 7 | 6 | 0.65 s / 11.2 s |

Not usable: `@cf/google/gemma-3-12b-it` on Workers AI (the account is not allowed to use it); its rows carry no reply. Gemma 4 was first reported unusable here by mistake: it is served at `https://bedrock-mantle.{region}.api.aws/openai/v1`, not `/v1`. It is in the next section.

- **Llama 4 Scout** follows the instruction on all 57 checkable lines, was the fastest of the models that did, and made only two bad replies on the others. Its habit is to capitalise number words (`Seven Hundred Fifty`, `Class Three B`), and it leaves the naira sign in front of them (`₦Twenty`), so those replies are `awkward`, not `bad`.
- **Gemma 3 12B** reads best on the hard lines (it turns `₦500` into `five hundred naira` and `U12` into `under twelve`), but it also rewrites symbols and units beyond the numbers (`+` to `plus`, `cm` to `centimeters`), so 4 checkable lines fail the strict check. Those four are better to say aloud and are judged `good`. It had one call of 11 s.
- **The small Llamas** are fastest, but lose numbers or words more often: `llama-3.2-3b` turned `12 plus 8` into `one two plus eight`, `2500` into `two hundred fifty`, and `Primary 4` into `Fourth`.
- **Llama 3.3 70B** copied the prompt into the reply (`The line: "..."`) more than once.

## Gemma 4

Three Gemma 4 models on Bedrock (`results-gemma-4.jsonl`), called at `/openai/v1/chat/completions`, temperature 0, no reasoning mode.

| Model | Checkable lines passed (of 57) | good | awkward | bad | median / slowest call |
|---|---|---|---|---|---|
| gemma-4-31b | 57 | 37 | 16 | 10 | 0.8 s / **58.7 s** |
| gemma-4-26b-a4b | 56 | 34 | 21 | 8 | 0.7 s / 3.9 s |
| gemma-4-e2b | 46 (all 11 rejections are better-aloud rewrites) | 51 | 7 | 5 | 0.66 s / 1.5 s |

- `gemma-4-e2b` does what `gemma-3-12b` does: it turns `₦500` into `five hundred naira`, `+` into `plus`, `cm` into `centimeters`, so the strict check rejects 11 of the 57 checkable lines although each rewrite reads better aloud. It has the best "good" count on the hard lines of any model here, and its slowest call was 1.5 s.
- `gemma-4-31b` passed every checkable line but did worse than Gemma 3 12B on the hard ones (`Form OneA`, `two.five metres`, `Under 12`) and had one call that took 58.7 s.
- `gemma-4-26b-a4b` once ran on into its own reasoning instead of answering (over 400 characters).

A bug in the automated check was found while scoring these: a length cap (2.5 times the line) rejected `12 times 12 is 144.` spelled as `Twelve times twelve is one hundred and forty-four.`, which is right. The cap was redundant once the word-for-word comparison existed, and was removed. Every reply in every results file was rescored with the corrected check and none of the earlier verdicts changed.

## All models at a glance

Checkable lines passed under the strict check (a rejection is not always an error: many are symbol or unit rewrites that read better aloud), then good, awkward and bad on the 63 lines code cannot check, median and slowest call. Where a model ran on both hosts the faster is shown.

| Model | Host | Passed of 57 | good | awkward | bad | median / slowest |
|---|---|---|---|---|---|---|
| llama-4-scout-17b | Workers AI | 57 | 41 | 20 | 2 | 0.29 s / 1.05 s |
| qwen3-next-80b-a3b | Bedrock | 57 | 42 | 16 | 5 | 0.7 s / 1.3 s |
| qwen3-32b | Bedrock | 53 | 48 | 13 | 2 | 0.6 s / 0.9 s |
| gemma-4-e2b | Bedrock | 46 | 51 | 7 | 5 | 0.66 s / 1.5 s |
| gemma-3-12b | Bedrock | 53 | 50 | 7 | 6 | 0.65 s / 11.2 s |
| llama-3.1-8b-fast | Workers AI | 52 | 40 | 17 | 6 | 0.23 s / 0.41 s |
| llama-3.2-3b | Workers AI | 45 | 41 | 7 | 15 | 0.23 s / 0.42 s |
| gpt-oss-20b | Workers AI | 57 | 32 | 26 | 5 | 0.5 s / 1.5 s (stalls of 10 s or more seen) |
| gemma-4-31b | Bedrock | 57 | 37 | 16 | 10 | 0.8 s / 58.7 s |
| qwen3-235b-a22b | Bedrock | 55 | 43 | 16 | 4 | 1.1 s / 6.3 s |
| gpt-oss-120b | Workers AI | 57 | 35 | 19 | 9 | 2.2 s / 19.6 s |
| gemma-3-27b | Bedrock | 56 | 35 | 21 | 7 | 0.9 s / 15.8 s |
| llama-3.3-70b | Workers AI | 55 | 34 | 21 | 8 | 0.38 s / 5.0 s |
| gemma-4-26b-a4b | Bedrock | 56 | 34 | 21 | 8 | 0.7 s / 3.9 s |
| qwen3-30b-a3b-fp8 | Workers AI | 57 | 27 | 23 | 13 | 2.4 s / 7.9 s |

## How it sounds (Spitch and Whisper)

The point of writing numbers as words is that a voice reads the line well, so the test that matters is to speak it. For 75 lines (the 63 that code cannot check and 12 checkable ones with symbols or units) each version was spoken by Spitch (voice `lucy`, English, the voice Aunty Chioma uses), transcribed by Whisper (`whisper-large-v3-turbo` on Workers AI) and scored against one or two readings a teacher would give (`tts-roundtrip/references.jsonl`, written by Claude Code). The versions are the raw line and the replies of six models: 255 distinct clips. Scores (`tts-roundtrip/score.py`) run from 0 to 1 and reduce written and spoken number forms to one shape first (`nineteen sixty` and `1960` agree, and so do `three thirty` and `3.30`).

| Version spoken | Mean score | Read exactly as a teacher would |
|---|---|---|
| gemma-4-e2b | 0.91 | 55 of 75 |
| gemma-3-12b | 0.85 | 42 |
| qwen3-32b | 0.84 | 40 |
| qwen3-next-80b | 0.82 | 39 |
| llama-4-scout | 0.82 | 38 |
| gpt-oss-20b | 0.79 | 36 |
| the raw line, digits and symbols as written | 0.78 | 33 |

gemma-4-e2b's lead over gemma-3-12b is +0.066 in the mean (standard error 0.025 over the 75 lines): better on 17 lines, worse on 6, tied on 52. Over Llama 4 Scout it is +0.091 (0.029). The lead is concentrated in the categories with symbols and units; it is level with or behind the others on fractions, large numbers and letter-plus-digit labels.

By category (raw line / gpt-oss-20b / Llama 4 Scout / qwen3-next / qwen3-32b / gemma-3-12b / gemma-4-e2b):

| Category | raw | gpt-oss-20b | scout | qwen3-next | qwen3-32b | gemma-3-12b | gemma-4-e2b |
|---|---|---|---|---|---|---|---|
| sums | 0.30 | 0.00 | 0.20 | 0.20 | 1.00 | 0.50 | 1.00 |
| times tables | 0.12 | 0.47 | 0.38 | 0.47 | 0.47 | 0.47 | 0.88 |
| signs, ranges, negatives | 0.65 | 0.56 | 0.58 | 0.55 | 0.68 | 0.72 | 0.87 |
| money | 0.72 | 0.74 | 0.76 | 0.74 | 0.74 | 0.93 | 0.98 |
| measurements | 0.80 | 0.76 | 0.76 | 0.76 | 0.76 | 0.76 | 0.89 |
| fractions, decimals, percent | 0.83 | 0.80 | 0.98 | 0.94 | 0.94 | 0.88 | 0.94 |
| large numbers | 0.82 | 0.88 | 0.88 | 0.88 | 0.88 | 0.82 | 0.85 |
| mixed letters and digits | 0.79 | 0.85 | 0.85 | 0.92 | 0.83 | 0.79 | 0.76 |
| years, dates, phones | 0.91 | 1.00 | 1.00 | 1.00 | 0.93 | 1.00 | 1.00 |
| time | 0.92 | 0.95 | 0.92 | 0.95 | 0.95 | 0.95 | 0.95 |
| ordinals and labels | 0.94 | 0.94 | 0.94 | 0.94 | 0.94 | 0.94 | 0.94 |
| counting | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

(An earlier scorer could not read decimals, thousands or leading zeros, and scored every version too low; the numbers above are from the corrected `score.py`.)

What Spitch does with what it is given:

- `=` and `x` are the worst. `3 + 4 = 7.` is said "three plus four, seven": the `=` is dropped. `3 x 4 = 12.` is heard as "three, four, twelve", and `three x four = twelve.` as "three day four twelve". Only a version that writes `plus`, `equals` and `times` in words is read right.
- A model that spells the digits but leaves the symbol makes it no better than the raw line, and often worse: on sums the raw line scored 0.30 and gpt-oss-20b, which leaves `+` and `=` in, 0.00. Llama 4 Scout, gpt-oss-20b and qwen3-next leave the symbols in.
- The naira sign is not spoken: `₦1,500` is heard as "1,500", with no currency, in the raw line and in every version that keeps the sign. Only versions that write `naira` are heard with it.
- `8:00` is heard as "8 Cologne"; `3:30` is read correctly. `school starts at eight o'clock` is right.
- Units after a digit are read well: `3 kg` is said "three kilograms". After a number word they are not: `three kg` is said "three kilidj". Spelling the digit made that line worse.
- Ranges: `5-10` is read "5 to 10"; `five-ten` is heard as "510". Spelling the digits made that worse too.
- Phone numbers: `08012345678` loses a digit when spoken raw and comes out complete when written digit by digit.
- Years, plain sums of counting and most ordinals are read well raw or spelled.

Caveats: one voice, one listener (a Whisper mishearing looks like a Spitch fault: `B7` came back garbled in every version), readings written by one reviewer, and a scorer that reduces forms and so hides a few differences (`12` and `one two`). The per-clip transcripts are in `tts-roundtrip/results.jsonl`.

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
