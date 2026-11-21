# Tutor model comparison: gpt-oss-120b and Gemma 4 31B

Measured 2026-11-21. The tutor chat as it runs on main (DSPy ReAct in text mode, the `load_skill` skills of #207 to #209) on two models, the model being the only change.

Reproduce:

    cd apps/server
    uv run python scripts/measure_model_compare.py --env-file oss.env --out oss.json
    uv run python scripts/measure_model_compare.py --env-file gemma.env \
        --base-url https://bedrock-mantle.us-east-1.api.aws/openai/v1 --out gemma.json

`oss.env` holds the Bedrock key and region. `gemma.env` adds `LLM_MODEL_ID=google.gemma-4-31b`. The script runs the cases of `measure_skill_loading.py` (12 single messages, a two-turn and a four-turn ladder), 10 draws each, 140 conversations and 180 turns a model, and keeps every model call with its reply, `finish_reason`, usage and latency. DSPy's cache is off.

## Where Gemma 4 31B is served

- Id: `google.gemma-4-31b`.
- It is on the mantle host's `/openai/v1` route, not on `/v1`, which is where the repo's `bedrock-mantle-chat` provider sends gpt-oss. On `/v1` it answers 400 "isn't supported on this route". On bedrock-runtime it answers "model identifier is invalid", and that host's model list has Gemma 3 only.
- lm15 builds the mantle URL itself, so the harness reaches Gemma by the plain `openai-chat` provider with the same key (`--base-url`). Production code is unchanged.
- The two models therefore ran on different routes of one host: the route is part of the difference measured here. gpt-oss ran on its production route.
- Workers AI was not checked: Bedrock serves the model.
- PR #210 (native tool calls) had not merged, so only text mode was measured.

Wire, read end to end before the batch: the request has no `tools` array, `max_completion_tokens` 8192, temperature 0, `reasoning_effort: low`, and the reply is `[[ ## next_thought ## ]] ... [[ ## next_tool_name ## ]] calculate ... [[ ## next_tool_args ## ]] {...}`. Gemma accepts `reasoning_effort` and ignores it (`reasoning_tokens` 0, no `message.reasoning`), so its reasoning is not mixed into the answer.

## Results (text mode, 10 draws a case)

| | gpt-oss-120b | Gemma 4 31B |
|---|---|---|
| Conversations that crashed | 0 of 140 | 3 of 140 (3 of 24 when the passage and four-turn cases were redrawn) |
| Right tool on the tool cases | 60 of 60 | 59 of 59 |
| `load_skill` on the three skill cases | 29 of 30 | 30 of 30 |
| Right skill named | 29 of 30 | 30 of 30 |
| Plain turns that load nothing and call nothing | 30 of 30 | 11 of 30 (19 loaded `checking-understanding`) |
| Replies replaced by "I could not check that reply" | 0 of 180 turns | 16 of 173 turns |
| Judge verdicts that were not a bare `safe` | 0 of 770 | 110 of 682 (`'safe'` 105, `"safe"` 5) |
| Calls with `finish_reason` other than `stop` | 0 of 1278 | 0 of 1181 |
| Empty answers, HTTP errors | 0, 0 | 0, 0 |
| Tool or ReAct markup in an answer | 0 | 0 |
| Ladder turn 2 shows the converted fractions (3/6) | 2 of 10 | 7 of 9 |
| Ladder turn 2 gives the full answer (5/6) | 0 of 10 | 0 of 9 |
| Turn latency, median / p90 / max | 5.4 / 8.7 / 25.0 s | 10.3 / 21.0 / 57.7 s |
| ReAct step latency, median | 1.06 s | 2.30 s |
| Tokens a turn, in / out | 15,024 / 1,013 | 15,439 / 737 |
| Model calls a turn (tutor, answer and safety judge) | 7.1 | 6.8 |
| Cost a turn | $0.0029 | $0.0025 |

Prices, USD per million tokens in and out. Gemma 4 31B: 0.14 and 0.40, from the AWS Bedrock pricing page (us-east-1). gpt-oss-120b: 0.15 and 0.60 is assumed. The page lists no us-east-1 price for it, only Sydney (0.1545 and 0.618) and gpt-oss-safeguard-120b (0.15 and 0.60). Cost is about 14 percent lower on Gemma, before the 16 replaced replies and 3 crashes are retried.

A "turn" is one learner message. The three crashed Gemma conversations are counted out of the turn-level rows, so those rows use 173 turns.

## What the failures are

- **Empty 200.** Three Gemma conversations ended in `LMUnexpectedError`. The last call before each was HTTP 200 with an empty body. The stage-writing run (`measure_stage_writing.py`, 3 draws) died on the same error on its first lesson draw, so its reading-level checks have no Gemma column; gpt-oss completed them (0 failed draws).
- **Safety judge.** The judge is a DSPy `Literal` field. Gemma writes the verdict as `'safe'` in 16 percent of judge calls. That fails the parse, the retry fails too, the 6 s limit ends it, and the tutor fails closed with "I could not check that reply". The tutor's own text is fine in those turns. The judge runs on the same model as the tutor.
- **Plain questions.** Gemma loads `checking-understanding` on "What is a numerator?" and "Why do we write decimals with a point?" (19 of 20). The skill is meant for checking understanding, and the answers still end with a question, so this is not harmful, but it costs two extra calls (the turn took 46.9 s once).

## What was read

Every Gemma answer shown here was read in full: calculate, practice, lesson, mistake, example, check, numerator, point, thanks, passage, three two-turn ladders, and the four turns of a four-turn ladder; and the first and second turns of three gpt-oss ladders and two of its "point" answers for comparison.

- Language and register are right: plain English, Nigerian examples (agege bread, chin-chin, naira and kobo, meat pie), LaTeX in `\( \)`. No tool syntax, skill names or reasoning reached any answer on either model (checked by search on every answer of both runs).
- Correct: the 15 percent of 240 working, the `1/2 + 1/3` example, the numerator and decimal-point answers, and the four-turn ladder, which ends by confirming 5/6 and giving a new sum.
- Ladder, turn 1: in one of the three Gemma draws read, it says the learner "correctly added the top numbers (numerators) and the bottom numbers (denominators)", which praises the wrong method; the others praise the numerators only, as gpt-oss does.
- Ladder, turn 2: gpt-oss asks one question ("what is the smallest number both 2 and 3 divide into?") and stays short. Gemma writes the conversion to sixths for the learner (`1/2 = 3/6`, `1/3 = 2/6`) in 7 of 9 draws and asks for the last step. It never gives 5/6, but it does more than one small step, which is what the ladder skill exists to prevent.
- gpt-oss is not clean either: its "point" answer states a history error (a Swiss mathematician "Johannes Rodrigues, also known as John Napier"), and in one draw it called `give_passage` three times in a turn.
- Gemma's `give_practice`, `give_passage` and `open_topic` answers are one short line pointing to the card, as the tutor rules ask.

## Limits

- Ten draws a case at temperature 0. Counts like 30 of 30 against 11 of 30 are clear; 29 of 30 against 30 of 30 is not.
- The two models ran on different routes of the host (see above), one after the other, six conversations at a time. Latency includes that load and the time of day.
- Tutoring quality is the author's reading of a sample of about 15 Gemma answers, not a blind or rubric score, and nothing here was judged by a model.
- The Gemma crashes and the judge format are measured. Whether a retry, a looser verdict parse or a different judge model would remove them was not tried.
- Native tool calls (#210) were not run.
- No Workers AI check, and no stage-writing result for Gemma.
