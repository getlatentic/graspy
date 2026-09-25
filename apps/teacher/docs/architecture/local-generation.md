# Local lesson-material generation

## Purpose

A teacher creates lesson materials from a confirmed lesson and receives a review,
worked example, practice task, and solution without sending school data to a remote
service.

## Guarantees

- The application sends the included mathematics lesson through the production
  lesson-material prompt, not a prewritten response.
- The inference request uses a strict JSON Schema response format.
- Returned content is validated again at the application boundary before it reaches
  UI state.
- Every material item identifies its learning goal and source material.
- Creation reports durable section progress, records its quality outcome, and supports
  cancellation through both generation and repair.
- Engine startup, health, request failure, invalid output, and cancellation are
  explicit states. There is no synthetic production fallback.
- The complete path works with network access disabled.

## Technical specification

```text
LessonMaterialsWorkspace
  -> LessonMaterialGenerator
     -> LessonMaterialCompletionGateway
        -> Tauri command
           -> managed llama-server process
              -> POST /v1/chat/completions
```

The feature owns its prompt, JSON Schema, validation, and mapping into the lesson
materials domain. The native runtime owns the child process, port selection, health
checking, localhost request transport, and shutdown. Model acquisition owns file
selection and checksum verification. These boundaries allow the runtime and model to
be replaced independently without putting engine details into product UI.

The application request contract is an OpenAI-compatible chat completion with:

- a system message defining the teacher-facing output and source constraints;
- a structured user message containing the lesson, confirmed learning goal, and
  source materials;
- `response_format.type = "json_schema"` and `strict = true`;
- deterministic sampling settings appropriate to instructional content.

The model returns teacher-facing content plus explicit learning-goal numbers and
source-material keys for every block. The response is untrusted until it passes the
generated-content schema and the deterministic quality cascade in the application.
The native completion boundary validates those identifiers again before assigning
stable block identifiers and committing the section. Schema-constrained decoding
prevents malformed JSON; boundary validation additionally protects against
engine/version regressions, scope drift, invalid citations, and semantically
incomplete output. See `lesson-material-quality.md`.

## Test contract

- A valid completion produces domain lesson materials and all three progress stages.
- Invalid JSON and schema violations receive one bounded repair attempt before failure.
- A response missing a required material kind enters the same quality cascade.
- An aborted request becomes `MaterialGenerationCancelledError`.
- The gateway receives the strict JSON Schema request and the confirmed lesson data.

## Sidecar lifecycle contract

The packaged engine is built from a pinned llama.cpp commit and named with the Rust
target triple required by Tauri. It must not link to Homebrew or another package
manager. At runtime the native layer:

1. resolves the checksum-approved model from the application data directory;
2. chooses a loopback port and starts exactly one engine process;
3. drains process output, polls `/health` with a bounded deadline, and reports startup
   errors with the final diagnostic lines;
4. registers each completion by request identifier so cancellation targets only that
   request;
5. rejects duplicate active identifiers and removes every registration on completion;
6. terminates the engine during orderly application exit.

Native tests must cover single-start behavior under concurrent requests, health
timeout, process exit during startup, duplicate request rejection, cancellation
cleanup, malformed completion envelopes, and shutdown idempotence. A packaged runtime
test must additionally prove that the distributed binary has no Homebrew linkage and
that application exit leaves no engine process.
