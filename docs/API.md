# API

Local base: `http://localhost:8081`. Interactive docs are at `/api/docs`, except in production.

## Session

Generation, the learner's record, `/a2a` and `/mcp` need an anonymous session token. The token names the device, and the device owns the record. Tokens are signed with HMAC-SHA256 and expire after 12 hours. The app gets a new one when a request returns `401`.

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
| `/api/learner` | GET | ✓ | The device's record for `planId`: topics with a lesson or finished, and answers |
| `/api/learner/plan` | POST | ✓ | Keeps the record in step as the plan changes |
| `/api/learner/import` | POST | ✓ | Brings what an earlier app version kept on the device to the record, once |
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

## Errors

| Status | Meaning |
|---|---|
| 401 | No token (`session_required`), or a malformed, forged or expired one (`session_invalid`). The body is the same on `/api`, `/a2a` and `/mcp` |
| 422 | Invalid request. `detail` names the field, never the value |
| 429 | Rate limited. Wait `Retry-After` seconds |
| 5xx | Server failure. The details are logged, not returned |
