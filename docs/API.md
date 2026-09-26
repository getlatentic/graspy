# API

Local base: `http://localhost:8081`. Interactive docs are at `/api/docs`, except in production.

## Session

Generation, the learner's record, `/a2a` and `/mcp` need a session token. It names the device, or, when someone signs in, their account and the learner the device learns as. Send `firebaseIdToken` with `deviceId`, and `learnerId` once the device has chosen a learner: Google verifies the token. Without a learner, or with one the account no longer holds, the token manages the account's learners only, and the learner's endpoints answer `409 learner_required`. Tokens are signed with HMAC-SHA256 and expire after 12 hours. The app gets a new one when a request returns `401`.

```bash
TOKEN=$(curl -sX POST localhost:8081/api/session -H 'content-type: application/json' \
  -d '{"deviceId":"my-device-01"}' | jq -r .token)
```

## REST

| Endpoint | Method | Token | Returns |
|---|---|---|---|
| `/api/health` | GET | | Liveness and environment |
| `/api/session` | POST | | A session token for `deviceId` |
| `/api/subjects/generate-stream` | GET | ✓ | Subjects for a country, language and level (SSE) |
| `/api/curriculum/generate-stream` | GET | ✓ | Subjects and their topics (SSE) |
| `/api/curriculum/path` | GET | ✓ | Topics in order, from the learner's level to a `goal` |
| `/api/learner` | GET | ✓ | The record of the learner the session names, for `planId`: topics with a lesson or finished, and answers |
| `/api/learner/plan` | POST | ✓ | Keeps the record in step as the plan changes |
| `/api/learner/import` | POST | ✓ | Brings what an earlier app version kept on the device to the record, once |
| `/api/learner/curriculum` | GET, PUT | ✓ | The plan the learner's devices share. PUT keeps the newer by `updatedAt` and returns the plan to hold |
| `/api/learner/curriculum/join` | POST | ✓ | A device's first choice of a learner, returning the learner's one plan. A plan for the same country, language and class merges into the learner's and brings its progress; for another class, the newer plan wins whole |
| `/api/account/learners` | GET, POST | ✓ signed in | The account's learners; POST adds one, with `guardian: true` from their parent, guardian or themselves. At most 8 |
| `/api/account/learners/{id}` | PATCH, DELETE | ✓ signed in | Renames a learner, or forgets them with their record, plan, lessons, tutor conversations and voice lessons |
| `/api/account/learners/{id}/session` | POST | ✓ signed in | A session as that learner. With `deviceId`, the device's own record joins them once |
| `/api/account` | DELETE | ✓ signed in | Forgets every learner and everything kept for them. The Google account is Google's |
| `/api/education/systems` | GET | | Every school system in the catalogue |
| `/api/education/countries/{country}` | GET | | A country's systems and classes, main system first |
| `/api/education/systems/{id}` | GET | | One system, such as `NG` or `GB-SCT` |

The app sends the level as the catalogue names it, such as `JSS 1 (Junior Secondary School), Nigeria, age 12`. Catalogue responses are cached for an hour.

## Streams

Each `-stream` endpoint sends server-sent events of JSON with a `type`:

| `type` | Meaning |
|---|---|
| `status` | Progress text |
| `subjects` / `result` | The subjects, or the curriculum's subjects and topics |
| `error` | Generation failed and the stream ends. `message` is safe to show |

A `ping` event comes every 20 seconds, so a proxy keeps the stream open. The stream ends with `data: [DONE]`.

## Tutor (A2A)

| Endpoint | Method | Token |
|---|---|---|
| `/.well-known/agent-card.json` | GET | |
| `/a2a` | POST: JSON-RPC, A2A 1.0 or 0.3, streamed | ✓ |

The `contextId` names the conversation. Send the learner's situation as message metadata under `learner`. Every field is optional and capped:

```json
{ "learner": { "country": "Nigeria", "language": "Yoruba", "gradeLevel": "JSS 1",
  "subject": "Mathematics", "subjectSlug": "mathematics", "topic": "Number Systems",
  "topics": ["Number Systems", "Fractions and Decimals"] } }
```

A reply is the answer as text plus a data part:

- `followUps`: the question the learner is most likely to ask next.
- `actions`: what the app should do. One of `open_topic`, `open_subject`, `add_topic`, `change_subjects`, `rebuild_plan` or `propose_path`.
- `cards`: practice or reading cards, each an MCP Apps tool result for the app to show.

## Views (MCP)

`/mcp` is a stateless MCP server over Streamable HTTP. It lists the tools that show UI (`give_practice`, `give_passage`, `give_lesson`), the app-only tools their views call, and the `ui://` resources. A lesson is not a REST endpoint: the app calls `give_lesson` and frames the view it returns.

## Voice

Voice lessons for the learner the session names: an account's learner or a signed-out device. They run on the Worker only; under uvicorn every endpoint answers `503 voice_unavailable`. Their errors carry `detail` as a sentence, as the Android app reads them.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/voice/lesson` | GET | The teacher's next step (`move`), for `learner_class`, `language` (`en`, `yo`, `pcm`) and optionally `plan`, the lesson the learner opened. The step is recorded as offered |
| `/api/voice/catalogue` | GET | Every lesson of `learner_class`, with where the learner stands on it |
| `/api/voice/lesson/events` | POST | Records that the learner heard `plan_id` and `event_id`. `409` for a step never offered |
| `/api/voice/teacher-audio/{utterance}` | GET | The teacher's voice for a lesson line, in `language`, with an `ETag`. `If-None-Match` with it answers `304` |
| `/api/voice/samples` | POST | A new recording's metadata, with an `Idempotency-Key` header. `201` with `sample_id` and `upload_path`; the same key and metadata again answer `200` with the same sample, other metadata `409` |
| `/api/voice/samples/{id}/audio` | PUT | The recording: WAV or Ogg (`415` otherwise), a positive `Content-Length` (`411`), at most 10 MiB (`413`) |
| `/api/voice/samples/{id}/evaluation` | POST | Marks the recording and returns the turn: `decision` (`correct`, `try_again`, `not_understood`), `feedback`, `transcript`. `409` when it answers a step the learner was never offered; `502` when recognition failed, `422` when the audio held no speech |
| `/api/voice/samples/{id}/reply-audio` | GET | The teacher's voice for the turn's `feedback` |

A recording's metadata needs `speaker_id`, `language_pair` (`yo-en` or `pcm-en`), `task`, `topic` and `consent: {"granted": true}`. With `plan_id` and `event_id` it answers that lesson step, and its `prompt_id` must be one that step asks; `400` otherwise. Another learner's sample is `404`. Marking a recording spends the generation budget; the rest spend the API's.

## Errors

| Status | Meaning |
|---|---|
| 401 | No token (`session_required`), or a malformed, forged or expired one (`session_invalid`). The body is the same on `/api`, `/a2a` and `/mcp`. A refused sign-in is `sign_in_invalid` |
| 403 | A device's session asked for the account's learners (`account_required`) |
| 409 | An account session asked for a learner's record (`learner_required`), or the account holds 8 learners (`too_many_learners`) |

Voice errors keep the shape the Android app was built against: `{"detail": text, "code": …}`, with the code on every `409` (`step_not_offered`, `audio_not_ready`, `unsupported_prompt`, `idempotency_conflict`) and on `no_speech` and `provider_failure`.
| 422 | Invalid request. `detail` names the field, never the value |
| 503 | Voice lessons outside the Worker (`voice_unavailable`) |
| 429 | Rate limited. Wait `Retry-After` seconds |
| 5xx | Server failure. The details are logged, not returned |
