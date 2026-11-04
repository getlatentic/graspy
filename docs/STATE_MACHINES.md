# Implicit state machines

These parts of graspy depend on a status, a flag, a nullable or a set that changes over time, with no transition table in the code. Writing them down is the first step to making each explicit: a table or reducer where that is enough, a formal spec in [docs/specs](specs/README.md) where crash points and several actors make it worth it.

Paths are under `apps/` unless they start with `.github` or `scripts`. A machine marked **TLA+** is a candidate for a spec; `ChatTurn` is the first one written.


## A. Children's data: recordings, consent, erasure (highest damage)

| Machine | Where | Implicit states | Next step |
|---|---|---|---|
| Recording retention × consent | `server/src/app/voice/recording_retention.py:27-118`, `samples` cols `audio_key`, `audio_deleted_at`, `expires_at`; `account/consents.py` | awaiting_audio / undecided / kept / gone, all read from NULL combinations | **TLA+**, with the tutoring turn |
| Parental consent record | `account/consents.py:28-82`, table `consents`, `listed_learners.py:39` | none / active / revoked per scope (`service`, `recordings`) | Table; TLA+ for the learner-removal saga |
| Tutoring turn (marking a recording) | `voice/worker_evaluation.py:65-125,371-444`, `voice/exercises.py:283-350`, `tutoring_turns.state` + `attempts` + `claim_token` | no row / placeholder failed(0) / processing live / lease expired / failed waiting / failed given up / complete | **TLA+**, with recording retention |
| Learner erasure across stores | `account/learners.py:87-116`, `voice/keeping.py:16-77`, `threads/store.py:127`, DOs `Learner.forget`, `Conversation.forget` | present / being removed / gone | **TLA+** |
| Voice sample upload | `voice/samples.py:27-181`, `samples.state` | awaiting_audio / ready | Fold into recording retention |
| Lesson step controller | `voice/progress*.py`, `sequencing.py`, `side_steps.py`, `progress_state.py:26-63`, `lesson_store.py` | a fold over the evidence log into about 20 sets and flags (`paused_today`, `echoed/recheck_due/rechecked`, `probed/shown/resume_at`, `guidance_owed/rung_owed`) | **TLA+** (top of the tutor side) and Props |
| Learner Durable Object (tutor) | `tutor/src/learner.ts:42-193`, `replies.ts:44-64`, `schedule.ts:52-56` | turn new / running / kept 24 h; FSRS card new → learning/review; `unheard` is a no-op | **TLA+** |

## B. The chat turn and lessons on the server

| Machine | Where | Implicit states | Next step |
|---|---|---|---|
| **Chat turn (A2A task)** | `server/src/app/agent/a2a.py:63-84`, `tutor.py:154-190`, `InMemoryTaskStore` | submitted / working (per tool) / completed / failed / rejected; `cancel` unsupported | **TLA+** (written: `docs/specs/ChatTurn.tla`) |
| Lesson making job | `server/src/app/lessons/making.py:60-79`, `worker.py:291-319` (`LessonMaker` DO, alarm) | absent / making fresh / making stale / failed / ready whole / ready not kept | **TLA+** |
| Learner record and plan sync | `learner/record.py:77-366`, `learner/plan.py`, `learner/store.py:105-108` | `imported`, `joined` devices, plan matched by `plan_id` and `written_for` | TLA+ for join and agree |
| Tutor thread sync | `threads/store.py:255-273`, `tutor_sync.seq` | per-owner monotone `seq`, cursors `(seq, id)` | Small model |
| Session token | `security/session.py:25-107`, Firebase fresh-sign-in check | valid / expired | Fix with learner erasure |
| Per-answer decision cascade | `tutor/src/turn.ts:401-511`, `router.ts`, `observer.ts`, `policy.ts:52-66` | fixed cascade: need → router/observer → don't know → plain number → plain list → model loop; flags `ROUTER`/`OBSERVER`/`INTERPRETER` | Table of the order and flags; Props |
| Hint ladder and told memory | `tutor/src/told.ts`, `praise.ts:62-72`, `server/.../progress.py:50` | tutor rung = wrong rows among the last 4 told within 30 min; server rung = per-day miss streak | Fix: one source of truth |
| Teacher audio store and publisher | `server/.../speech/teacher_audio.py:53-92`, `scripts/voice/publish_teacher_audio.py` | line recorded better / fallback only / none; notes file | Fix |

## C. Web and Android clients

| Machine | Where | Implicit states | Next step |
|---|---|---|---|
| Android recorded answer → Room submission → WorkManager | `mobile/.../CollectionViewModel.kt:29-168`, `SubmissionUpload.kt:64-164`, `Submission.kt:19` | PENDING / UPLOADING / COMPLETED / FAILED plus `serverSampleId`, file exists, `feedbackHeard` | **TLA+**, with the web kept answer |
| Web kept voice answer | `web/src/.../answer-store.ts`, `send-answer.ts:47`, `answer-outbox.ts`, `follow-answer.ts` | key-only → sampleId → uploaded → marked/refused → forgotten | **TLA+**, same protocol as the Android submission |
| Learner switch, wipe, pinned work | `web/src/lib/account/{account-store,learner-pin,learner-choice,device-wipe}.ts`, `mobile/.../{LearnerChoice,DeviceWipe,LeavingLearner}.kt` | signed out / signed in no learner / learner chosen / switching / wiping | **TLA+** |
| Android sign-in / sign-out | `mobile/.../AccountEntry.kt:112-250` | prefs `SIGNING_IN`/`SIGNING_OUT`/`GOOGLE_ACCOUNT` × Firebase user × two mutexes, reconciled at start | State chart; TLA+ for crash points |
| Android classroom lesson | `mobile/.../PracticeLessonViewModel.kt`, `ClassroomState.kt:8`, `LessonFloor.kt:27` | `ClassroomState` plus about eight hidden vars, jobs and prefs flags | Reducer shared with web |
| Web voice-lesson phase reducer and mic take | `web/src/.../lesson-state.ts`, `recorder.ts`, `use-answer-take.ts:51-61` | idle…recording…kept…moving-on | Add a phase |
| Chat turn and unanswered retry (clients) | `web/.../use-tutor-turn.ts`, `lib/a2a/client.ts`, `tutor-turn.ts:90-207`; `mobile/.../AskViewModel.kt:40-148` | pending / answered / stopped / failed, derived by `unansweredIn` | Table; TLA+ with the chat turn |
| Consent gates | `web/.../use-service-standing.ts:12-50`, `mobile/.../ServiceConsentViewModel.kt:21` | checking / unchecked / needed / agreed; a device with no signed-in learner is `agreed` | Table |
| Session renewal on 401 | `web/.../session.ts:39-240`, `mobile/.../SessionTokens.kt`, `SessionInterceptor.kt:31` | cached / pending / renewing | Table |
| Plan generation and onboarding | `web/.../plan-setup-state.ts:15`, `use-learner-start.ts:18-35`, `generate-plan.ts:53`; `mobile/.../PlanSetupViewModel.kt` | form / generating / ready / kept; a one-shot `generated` latch | Reducer on Android |
| Plan and thread sync (clients) | `web/.../plan-sync.ts`, `thread-sync.ts`; `mobile/.../Resending.kt`, `ThreadSync.kt` | "unsent" is a diff against an agreed stamp | TLA+ for join and agree |
| MCP view bridge | `web/.../view-bridge.ts:99`, `app-frame.tsx:76-103`; `mobile/.../ViewSession.kt:116-120` | proxy-ready → document → initialized → input → result → teardown | Table of methods per phase |
| View-call outbox | `web/.../mcp/outbox.ts`, `use-app-host.ts:36`; `mobile/.../McpOutbox.kt` | kept / sending / refused (implicit) | Explicit states |
| Offline lessons, marks, service worker | `web/.../lesson-offline.ts`, `learner-record.ts:118`, `use-topic-progress.ts:43-46`, `public/sw.js`; `mobile/.../OfflineLessons.kt` | local mark vs server record; two caches | Marks as intent plus server state, merged |

## D. Build, deploy, teacher app

| Machine | Where | Implicit states | Next step |
|---|---|---|---|
| Deploy pipeline | `.github/workflows/deploy.yml`, `scripts/deploy.sh:60-221`, `scripts/check-deploy-environment.sh` | CI → environment check job → approval → migrate → tutor → API (4 retries on 10013) → web | Expand/contract CI check |
| Generation run / background task (Rust) | `teacher/src-tauri/src/generation_program/repository.rs:284-306`, `task_registry/repository.rs:112-157`, `lib.rs:95-141` | run queued/running/interrupted/completed/failed/cancelled; node and task states | TLA+ (moderate) |
| Model acquisition and engine | `teacher/.../model_acquisition/service.rs:447-771`, `inference/runtime.rs:302-309` | Absent / Partial / Installed × phase; engine up / down | TLA+ for the rename and shutdown |
| Curriculum package install and trust | `teacher/.../curriculum_catalog/repository.rs:188-322`, `package/mod.rs:37-109` | School / Verified | Fix |
