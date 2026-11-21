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

## 2026-11-21: native tool calls on both models, and model against route

The same cases (12 single messages, a two-turn and a four-turn ladder, 10 draws each, 140 conversations a column), the tutor as on main with `LLM_NATIVE_TOOLS=true` (PR #210), DSPy's cache off, Bedrock only. The text columns are the saved results of the run above, counted again by `scripts/report_model_compare.py`, which is why p90 latency differs slightly from the first table.

Reproduce (PR #211 had not merged, so `--base-url`):

    uv run python scripts/measure_model_compare.py --env-file oss-native.env --out oss-native.json
    uv run python scripts/measure_model_compare.py --env-file gemma-native.env \
        --base-url https://bedrock-mantle.us-east-1.api.aws/openai/v1 --out gemma-native.json
    uv run python scripts/measure_model_compare.py --env-file oss-native.env \
        --base-url https://bedrock-mantle.us-east-1.api.aws/v1 --out ossplain-native.json
    uv run python scripts/report_model_compare.py "gpt-oss native=oss-native.json:0.15:0.60" ...
    uv run python scripts/probe_route.py --env-file gemma.env --base-url <route> \
        --prompt-from gemma-text.json --calls 100 --out probe.json

The harness now also keeps a call that was cancelled or failed before its reply (`raised`, `status` null), and a conversation that crashed keeps the calls it made. Without that the 6 s judge cancellations below could not be seen. The gpt-oss native run (`oss-native`) was made before that change; it had no crash and no replaced reply, so nothing there was hidden.

### Results

| | gpt-oss text | gpt-oss native | Gemma text | Gemma native |
|---|---|---|---|---|
| Conversations that crashed | 0 of 140 | 0 of 140 | 3 of 140 | 4 of 140 |
| Replies replaced by "I could not check that reply" | 0 of 180 | 0 of 180 | 16 of 173 | 11 of 176 |
| Judge verdicts that were not a bare `safe` | 0 of 770 | 0 of 817 | 110 of 682 | 119 of 704 |
| Calls with `finish_reason` other than stop or tool_calls | 0 of 1278 | 0 of 1329 | 0 of 1181 | 15 of 1219 (12 judge calls cancelled at 6 s, 2 `length`, 1 answer stream closed by the tutor) |
| Calls with no HTTP status (no response), empty answers | 0, 0 | 0, 0 | 0, 0 | 12, 0 |
| Tool or ReAct markup in an answer | 0 | 0 | 0 | 0 |
| Right tool on the tool cases | 60 of 60 | 57 of 60 | 59 of 59 | 55 of 56 |
| `calculate` on the calculate case | 10 of 10 | 7 of 10 | 10 of 10 | 10 of 10 |
| `calculate` on any other case | 0 of 170 | 0 of 170 | 2 of 163 | 2 of 166 |
| `load_skill` on the three skill cases | 29 of 30 | 24 of 30 | 30 of 30 | 30 of 30 |
| Right skill named | 29 of 30 | 18 of 30 | 30 of 30 | 30 of 30 |
| Plain turns that load nothing and call nothing | 30 of 30 | 30 of 30 | 11 of 30 | 30 of 30 |
| Ladder turn 2 shows the converted fractions (3/6) | 2 of 10 | 2 of 10 | 7 of 9 | 8 of 10 |
| Ladder turn 2 gives the full answer (5/6) | 0 of 10 | 1 of 10 | 0 of 9 | 0 of 10 |
| Turn latency, median / p90 / max | 5.4 / 8.7 / 25.0 s | 4.5 / 9.1 / 20.5 s | 10.3 / 21.9 / 57.7 s | 7.6 / 16.6 / 88.1 s |
| Tool step latency, median | 1.06 s | 0.63 s | 2.30 s | 1.11 s |
| Tokens a turn, in / out | 15,024 / 1,013 | 14,071 / 860 | 15,439 / 737 | 13,729 / 647 |
| Model calls a turn | 7.1 | 7.4 | 6.8 | 6.9 |
| Cost a turn | $0.0029 | $0.0026 | $0.0025 | $0.0022 |

Turn-level rows leave out the crashed conversations. Native-mode wire, from the kept request bodies: every tool step of both models sent the same keys, `max_completion_tokens, messages, model, reasoning_effort, temperature, tool_choice, tools`, with `tool_choice: "auto"` and ten tools in `tools` (gpt-oss 322 of 322 steps, Gemma 329 of 329). A call that made a tool call ends with `finish_reason: tool_calls` on both.

| Native mode | gpt-oss | Gemma |
|---|---|---|
| Malformed tool arguments | 4 (`give_practice`: a LaTeX backslash in the JSON string, "Invalid \escape") | 0 |
| Unknown tool names; markup or empty reply instead of a call | 0; 0 | 0; 0 |
| Steps with more than one call (parallel) | 0 | 0 |
| Turns that call the same tool twice or more | 20 of 180 | 12 of 176 |
| `calculate` not called on "What is 15% of 240?" | 3 of 10 (it worked the sum itself) | 0 of 10 |

### Route against model

- gpt-oss-120b is not served on Gemma's route: `openai.gpt-oss-120b` at `/openai/v1` answers 400 "isn't supported on this route", and `google.gemma-4-31b` at `/v1` answers 400 the same. The two models cannot be put on one route.
- What could be separated is the provider. gpt-oss through the plain `openai-chat` provider at `/v1` (the provider Gemma needs) instead of `bedrock-mantle-chat`: text 0 crashes, 0 replaced replies, 0 non-`safe` verdicts, turn 5.3 s median (5.4 s on the production provider); native 0 crashes, 0 replaced, `calculate` 7 of 10, right skill 21 of 30 (18 of 30 on the production provider), turn 4.3 s median. The provider and client are not the cause of Gemma's crashes, replaced replies or latency.
- Plain calls, 100 each of a one-line request and of a tutor tool-step prompt (the same words to every model), six at a time, through the repo client, 600 calls:

| | short line: failed or empty / median / p90 / max | tutor tool step: failed or empty / median / p90 / max |
|---|---|---|
| gpt-oss, `bedrock-mantle-chat` `/v1` | 0 / 0.33 / 0.47 / 0.8 s | 0 / 0.67 / 0.90 / 3.4 s |
| gpt-oss, `openai-chat` `/v1` | 0 / 0.29 / 0.50 / 3.2 s | 0 / 0.70 / 1.04 / 1.6 s |
| Gemma, `openai-chat` `/openai/v1` | 0 / 0.43 / 0.96 / 31.9 s | 0 / 1.62 / 2.61 / 5.7 s |

  No empty reply and no failure in 600 calls. Gemma is about 2.4 times slower on the tool step (2.1 times in the tutor run) and has one 31.9 s call in 200.
- The empty 200 of the first report did not show up again, and the tutor runs show a different failure. In `gemma-native` all 4 crashes are tool-step requests that got no response until the 60 s read timeout (`ReadTimeout`, no HTTP status), and all 12 unanswered safety-judge calls were cancelled by the 6 s judge limit before a response started. These are requests that hang, not a 200 with an empty body. gpt-oss had none: no crash and no replaced reply in any of its four runs, and no cancelled or failed call in the two runs (2,621 calls) that kept them. The Gemma rate is 16 of 1,219 calls under the tutor's load (six conversations at a time, several calls each) and 0 of 200 in single calls.
- Model or route? Not separable with what Bedrock serves. The provider, client, wire and prompt are those that work for gpt-oss, so the cause is in the Gemma 4 31B serving at `/openai/v1` (model, route or capacity), and no run here says which.

### Gemma's judge verdict

Quoted verdicts (`'safe'`, `"safe"`) are 110 of 682 stored judge replies in the text run and 119 of 704 in the native run, and they are not what replaced the replies. DSPy's own parse of the judge's `ForAChild` signature (`ChatAdapter.parse`) accepts every stored reply that has a body (682 and 692), quoted ones included. A parse that strips matching quotes would therefore remove **0 of the 16** replaced replies in the stored text results, and 0 of the 11 in the native run. In the text run, 10 of the 16 replaced turns have only bare `safe` verdicts or no recorded judge call, 6 have one quoted verdict beside bare ones, and no block had two failed tries. In the native run, all 11 replaced turns have a judge call cancelled at 6.0 s with no response. The first report's explanation (a quoted verdict fails the parse, the retry fails, the limit ends it) was wrong. The cause is a judge request to Gemma that does not answer within the 6 s limit. A longer limit, a retry that starts a new request, or another judge model is what to try; none was tried.

### What was read

Fourteen Gemma native answers in full: calculate, practice, lesson, subject, add, three mistake draws, example, two equivalent-fraction answers, numerator, point, thanks, passage, a two-turn ladder and a four-turn ladder (all four turns). The first answer of every ladder draw was checked by search. This is the author's reading, not a rubric, and no model judged anything.

- Correct and in the learner's language: 15% of 240 is 36 with a Naira example, 1/2 + 1/3 = 5/6 with agege bread and a second sum, the decimal-point answer with Naira and Kobo, equivalent fractions with bread and cake. LaTeX in `\( \)`. No tool syntax, skill names, reasoning or field markers in any answer (search over all 176 turns: 0).
- Card answers (`give_practice`, `open_topic`, `open_subject`, `add_topic`, `give_passage`) are one short line pointing to the card, as the rules ask. One turn called `give_passage` three times and took 28.9 s; one called `give_practice` twice.
- Mistake and ladder turn 1: in 8 of 20 first turns Gemma says the learner "correctly added the top numbers and the bottom numbers" (found by pattern, so approximate), which praises the wrong method; in the text run it was 12 of 18. gpt-oss did it 0 of 20 in both modes.
- Ladder turn 2 and 3: Gemma writes the conversion to sixths for the learner (`3/6 + 2/6`) in 8 of 10 draws and then asks for the addition. That is more than one small step. gpt-oss native does it in 2 of 10 on the production provider (7 of 10 on the plain route, which also gave the full 5/6 in 4 of 10).
- In the four-turn ladder read, turn 4 confirms 5/6 and sets a new sum, as wanted. One "numerator" turn read was a replaced reply.
- Plain questions: in native mode Gemma loads nothing on all 30 (11 of 30 in text mode).

### Limits

- Ten draws a case at temperature 0. 30 of 30 against 24 of 30 is a difference; 29 of 30 against 30 of 30 is not. gpt-oss native's right skill was 18 and 21 of 30 on two providers, so that row moves by several draws between runs.
- The runs were one after the other on one afternoon, six conversations at a time; text and native runs were hours apart, and the load on the host was not controlled.
- gpt-oss prices are assumed, as in the first section. One Gemma native run: whether the hang rate (16 of 1,219) moves between runs was not measured.
- The probe has 100 calls per cell and one request shape.
- Stage-writing and Workers AI were not run.
