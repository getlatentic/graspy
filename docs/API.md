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
| `/api/curriculum/generate-stream` | GET | ✓ | Subjects and their topics (SSE). With `system` and `level`, a subject whose curriculum graspy holds for that class takes its topics, and `sources` names the edition |
| `/api/curriculum/coverage` | GET | | Each class and subject with a held curriculum or voice lessons, and how they are grounded |
| `/api/curriculum/path` | GET | ✓ | Topics in order, from the learner's level to a `goal` |
| `/api/learner` | GET | ✓ | The record of the learner the session names, for `planId`: topics with a lesson or finished, and answers |
| `/api/learner/plan` | POST | ✓ | Keeps the record in step as the plan changes |
| `/api/learner/import` | POST | ✓ | Brings what an earlier app version kept on the device to the record, once |
| `/api/learner/curriculum` | GET, PUT | ✓ | The plan the learner's devices share. PUT keeps the newer by `updatedAt` and returns the plan to hold |
| `/api/learner/curriculum/join` | POST | ✓ | A device's first choice of a learner, returning the learner's one plan. A plan for the same country, language and class merges into the learner's and brings its progress; for another class, the newer plan wins whole |
| `/api/account/learners` | GET, POST | ✓ signed in | The account's learners; POST adds one, with `guardian: true` from their parent, guardian or themselves, and optionally the parent's `consent` to use graspy (see Consent). At most 8. Each learner, in the GET and the POST's answer, carries `serviceConsent` and `voiceConsent`, each `null` until a parent agreed |
| `/api/account/learners/{id}/consent` | PUT | ✓ signed in | The parent agrees to graspy teaching a learner who was added without consent (scope `service`). Body `{noticeVersion, firebaseIdToken}` as for `consent` above. Returns `{noticeVersion, grantedAt}`; asked again, it replaces the earlier consent. Refused with the codes of Consent (`503 consent_not_kept` when it could not be written: send it again), and `404 no_such_learner` for a learner the account does not hold, including one removed while the sign-in was being checked |
| `/api/account/learners/{id}` | PATCH, DELETE | ✓ signed in | Renames a learner, or forgets them with their record, plan, lessons, tutor conversations, voice lessons and the parent's consents |
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
| `/api/voice/teacher-audio/{utterance}` | GET | The teacher's voice for a lesson line, in `language`, with an `ETag`. `If-None-Match` with it answers `304`. Ogg Opus, or MP3 with `format=mp3` for a browser that cannot play Opus. English lines are served as the MP3 recorded in YarnGPT's Idera once it is published, whatever `format` asks for, and as Spitch's Lucy until then; the `X-Graspy-Voice-Provider` header names the one served |
| `/api/voice/samples` | POST | A new recording's metadata, with an `Idempotency-Key` header. `201` with `sample_id` and `upload_path`; the same key and metadata again answer `200` with the same sample, other metadata `409`. `lesson_language` (`en`, `yo` or `pcm`) is the language the teacher marks and replies in; English when it is missing |
| `/api/voice/samples/{id}/audio` | PUT | The recording: WAV or Ogg (`415` otherwise), a positive `Content-Length` (`411`), at most 10 MiB (`413`). Once it answers `200` graspy holds the recording, and the phone or browser may delete its own copy (see Recordings) |
| `/api/voice/samples/{id}/evaluation` | POST | Marks the recording and returns the turn: `decision` (`correct`, `try_again`, `not_understood`), `feedback`, `transcript`. `409` when it answers a step the learner was never offered; `502` when recognition or marking failed, `422` when the audio held no speech. A failed marking is tried again no sooner than 2 minutes after the first attempt failed, and 30 minutes after the second; until then the recording answers `202` as if still being marked, with the wait left in `retry_after_ms` and a `Retry-After` header, and no attempt is spent. One whose marking failed 3 times is not tried again: `409 marking_failed` |
| `/api/voice/samples/{id}/reply-audio` | GET | The teacher's voice for the turn's `feedback`, as Ogg Opus or with `format=mp3` |

A recording's metadata needs `speaker_id`, `language_pair` (`yo-en` or `pcm-en`), `task`, `topic` and `consent: {"granted": true}`. With `plan_id` and `event_id` it answers that lesson step, and its `prompt_id` must be one that step asks; `400` otherwise. Another learner's sample is `404`. Marking a recording spends the generation budget; the rest spend the API's.

### Consent

A parent's consent is kept for one learner, in one of two scopes. Consent is only ever asked of a parent who has just signed in with Google, and every consent names the version of the notice the parent was shown; the notice's text is below and clients must show it, unchanged, before agreeing.

| Scope | Agrees to | Recorded by | In the learner as |
|---|---|---|---|
| `service` | graspy teaching this learner at all | `consent` sent with `POST /api/account/learners`, or `PUT /api/account/learners/{id}/consent` for a learner added without it | `serviceConsent`: `{noticeVersion, grantedAt}` |
| `recordings` | keeping this learner's voice recordings, for 30, 90 or 365 days | `PUT .../voice/consent` (Recordings) | `voiceConsent`: `{noticeVersion, retentionDays}` |

`POST /api/account/learners` takes `{name, guardian: true}` as before, and, when the parent has agreed, also `consent: {noticeVersion, firebaseIdToken}`. `firebaseIdToken` is a fresh Firebase ID token from signing in again with Google, which must belong to the session's own account and have been issued by a sign-in within the last 5 minutes. With `consent` valid, the learner is added and the consent recorded; without it, the learner is added and nothing is recorded. With `consent` that does not hold, no learner is added: `400 notice_unknown` for a notice that does not exist, `401 sign_in_invalid` for a token Google does not vouch for, `401 sign_in_stale` for a sign-in older than 5 minutes or a token that does not say when it was, `403 sign_in_other_account` for another account's token, `403 sign_in_not_google` for a sign-in that was not with Google, `503 consent_unavailable` where consent cannot be kept (outside the Worker), and `503 consent_not_kept` when the consent could not be written: the learner is rolled back, only their entry in the account's list, since nothing else is kept for a new learner yet and the stores that failed may be the ones a full removal would use, so the request can simply be sent again. If that rollback itself fails, the answer is the same `503 consent_not_kept`, but the learner stays in the account without consent, and a retry adds a second one: the app should list the learners again before it retries, and may agree for the one that is there with `PUT /api/account/learners/{id}/consent`. Nothing yet stops a learner without `serviceConsent` from learning; the field is for the apps to gate their screens on.

Notice 1 of scope `service`:

> graspy teaches this learner with their name, class, language, questions, answers and voice. It sends them to Cloudflare, Amazon, Intron and Spitch to work. You can delete this learner and everything graspy keeps about them at any time.

Notice 1 of scope `recordings`, with the days the parent picks in place of the brackets:

> graspy will keep this learner's voice recordings for [30 / 90 / 365] days so you can listen to them and delete them. They are sent to Intron and Cloudflare to check the answers. You can delete any recording, or stop keeping them, at any time.

### Recordings

A recording is deleted as soon as its turn has ended (marked, heard to hold no speech, or failed on its last attempt), unless a parent agreed to keep the learner's recordings. Until then it stays, because a failed marking is tried again from the same audio. The transcript and the result stay either way, until the learner or the account is removed. A recording that was uploaded and never marked is deleted after a day. The server decides all of this from the learner's consent when the turn ends: a phone or browser sends nothing about it, and may delete its own copy once the upload was answered `200` (or the create answered `state: ready`), since graspy has the audio then. A marked turn asked for again answers with its result, audio or not; one never marked whose audio has gone answers `409 audio_not_ready`, and the answer cannot be sent again.

With a parent's consent a recording is kept until `expiresAt`, the days the parent chose counted from the end of its turn, and then deleted. Consent is one learner's, is given only by a signed-in account, and can be withdrawn at any time. A consent withdrawn while a recording is being marked wins: that recording is deleted. Recordings already kept stay until they expire, unless the parent asks for them to go. A parent changing the days changes the recordings made afterwards, not those already kept.

These need a signed-in account session and a learner the account holds. A device's own session answers `403 account_required`, and another account's learner `404 no_such_learner`. Bodies and queries are camelCase.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/account/learners/{id}/voice` | GET | `{consent, recordings, nextBefore, nextBeforeId}`. `consent` is `{noticeVersion, retentionDays, grantedAt}` or `null`. `recordings` are the kept ones, newest first, up to `limit` (1 to 200, 100 by default) after the cursor `before` (milliseconds) and `beforeId`: with none, the newest page; `before=0` is an empty page: each `{id, recordedAt, expiresAt, lesson, transcript, durationSeconds, bytes}`, with times in milliseconds since the epoch, `lesson` the lesson's title or `null`, `transcript` the words the teacher heard or `null`, and `durationSeconds` `null` for anything but the apps' own WAV. `nextBefore` and `nextBeforeId` are the `before` and `beforeId` for the next page, or `null` on the last. Send both: two recordings can share a millisecond. `before` is at most 2^52 |
| `/api/account/learners/{id}/voice/consent` | PUT | Agrees to keep this learner's recordings (scope `recordings`). Body `{noticeVersion, retentionDays, firebaseIdToken}`: `noticeVersion` is the notice the parent was shown (only `1` exists), `retentionDays` is `30`, `90` or `365`, and `firebaseIdToken` is a fresh Firebase ID token from signing in again with Google. Returns `{noticeVersion, retentionDays, grantedAt}` |
| `/api/account/learners/{id}/voice/consent` | DELETE | Stops keeping recordings. With `?deleteRecordings=true` it also deletes every kept one. Returns `{deleted, more}`; while `more` is `true`, call it again. Asked twice it answers the same |
| `/api/account/learners/{id}/voice/recordings/{sampleId}/audio` | GET | The recording itself, with its own `Content-Type` (`audio/wav` from the apps), never cached. `404 recording_gone` when it is not kept, has expired or was deleted |
| `/api/account/learners/{id}/voice/recordings/{sampleId}` | DELETE | Deletes that recording, its object in the bucket included. `204` also when it is already gone |
| `/api/account/learners/{id}/voice/recordings` | DELETE | Deletes the kept recordings a call can, and returns `{deleted, more}`; while `more` is `true`, call it again |

Agreeing needs the parent to have signed in within the last 5 minutes: the app signs in with Google again, and sends the new ID token as `firebaseIdToken`; the session's own token is not enough. It is refused with the codes of Consent above, and `422` for days other than 30, 90 or 365. Nothing is kept for a refusal.


## Threads

`/api/learner/threads` shares a signed-in account's learner's tutor conversations between their devices; a device signed out keeps its own. `POST` takes the threads a device has not sent and returns `{seq}`. `GET` returns what changed after `since` (default 0), up to `upTo`, continuing from the cursor `after`; `since` and `upTo` are at most 2^52, and above that, like a cursor the server does not know, the answer is `422`.

## Errors

| Status | Meaning |
|---|---|
| 401 | No token (`session_required`), or a malformed, forged or expired one (`session_invalid`). The body is the same on `/api`, `/a2a` and `/mcp`. A sign-in Google refused is `sign_in_invalid`, and one for a consent that is older than 5 minutes, or does not say when it was, is `sign_in_stale` |
| 403 | A device's session asked for the account's learners (`account_required`), or a consent came with a sign-in that is another account's (`sign_in_other_account`) or was not with Google (`sign_in_not_google`) |
| 409 | An account session asked for a learner's record (`learner_required`), or the account holds 8 learners (`too_many_learners`) |
| 422 | Invalid request. `detail` names the field, never the value. Among others: `retentionDays` other than 30, 90 or 365 for a consent, and a `before`, `since` or `upTo` above 2^52 |
| 503 | Voice lessons outside the Worker (`voice_unavailable`), consent that cannot be kept outside the Worker (`consent_unavailable`), a consent that could not be written, which is safe to send again (`consent_not_kept`), sign-in not set up (`sign_in_off`), or Google could not check a sign-in and a later try may pass (`sign_in_unchecked`) |
| 429 | Rate limited. Wait `Retry-After` seconds |
| 5xx | Server failure. The details are logged, not returned |

Voice errors keep the shape the Android app was built against: `{"detail": text, "code": …}`, with the code on every `409` (`step_not_offered`, `audio_not_ready`, `unsupported_prompt`, `idempotency_conflict`, `marking_failed`) and on `no_speech` and `provider_failure`. The parent's routes (Recordings) put `{"error", "code"}` in `detail`, as the account routes do.
