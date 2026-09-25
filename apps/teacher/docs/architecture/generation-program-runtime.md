# Self-contained generation-program runtime

## Purpose

Graspy executes the complete lesson-planning and lesson-material workflows on a
teacher's computer without Python, DSPy, a hosted API or an application-specific
model server contract. Each long-running workflow is typed, resumable,
inspectable and evaluated before a prompt-program version is released.

The runtime is internal product infrastructure. Teachers see actions such as
**Prepare lesson**, **Create materials**, **Try again** and **Review changes**.
They do not see signatures, modules, model messages, traces or repair programs.

## Why this is not a DSPy reimplementation

The donor application proves the useful architecture: typed signatures,
composable modules, strict structured output, deterministic validation, bounded
repair and evaluation-driven prompt improvement. Graspy ports those properties,
not DSPy's Python runtime or its research vocabulary.

The boundary is deliberately product-specific:

- Rust owns execution, persistence, cancellation and recovery.
- Application domains own their input, output and validation contracts.
- A completion port owns communication with the qualified local inference
  engine.
- Evaluation datasets and scorers qualify versioned programs before release.
- No general-purpose Python execution, dynamic code loading or arbitrary prompt
  plugin system is shipped.

## Core contracts

### Generation signature

A signature is an immutable, versioned declaration containing:

- stable signature identifier and semantic version;
- typed input contract;
- strict JSON output schema;
- system and task instructions;
- named validation policy;
- completion limits and timeout;
- optional dedicated repair-signature identifier.

The signature produces a transport-independent `StructuredCompletionRequest`.
It cannot refer to llama-server paths, ports or chat-provider fields.

### Generation module

A module owns one product operation. It maps validated domain input into one or
more signature calls and deterministic transforms. A module must declare which
outputs it consumes and produces. Hidden access to another node's state is not
allowed.

### Generation program

A program is a versioned directed acyclic graph of modules. Nodes are either:

- **deterministic** — parsing, evidence selection, graph ordering, schema
  normalization, validation, figure insertion or assembly; or
- **model-authored** — one strict signature invocation.

Topological order is calculated before execution. Cycles, missing producers,
duplicate output keys and incompatible types fail program registration rather
than appearing during a teacher's run.

### Validator and repair

Validators return named checks with structured details. They never mutate the
candidate. A failed model-authored node may invoke its dedicated repair
signature only when the program declares a positive retry budget. The repair
receives the original inputs, invalid candidate and exact failed checks.

When the budget is exhausted, the node and program fail visibly. The runtime
does not accept a partial candidate, weaken the schema or substitute canned
content.

## Execution and persistence

Each program run is an explicit state machine:

```text
queued -> running -> completed
                  -> failed
                  -> cancelled
                  -> interrupted -> running
```

Each node is separately `pending`, `running`, `interrupted`, `completed`,
`failed` or `cancelled`. A completed node is committed atomically with:

- canonical input and output JSON plus their SHA-256 digests;
- program, module and output-contract versions;
- validation passes, repair count and bounded diagnostics.

Every model attempt has a separate immutable invocation trace containing the
signature version, selected model installation identity, canonical input and
output digests, prompt and schema digests, start/end timestamps, duration,
token counts, validation result and bounded diagnostics. Initial and repair
attempts are distinct records.

Restart recovery marks uncommitted running nodes interrupted and resumes from
the first incomplete dependency. Completed nodes are not called again. A new
program or input digest creates a new run; it never mutates an earlier trace.
Invocation attempt ordinals remain monotonic across restarts. An interrupted
repair resumes with its exact stored repair input and does not consume another
repair from the declared budget. If the model completion and validation trace
were committed immediately before interruption, recovery completes the node
from that immutable trace without invoking the model again.

## Completion port

The application contract is:

```text
StructuredCompletionPort.complete(request, cancellation) -> completion
```

Infrastructure provides:

- `LlamaServerStructuredCompletionPort` for the supervised local sidecar; and
- `ScriptedStructuredCompletionPort` for deterministic tests.

The infrastructure adapter translates the strict schema into the qualified
server's grammar mechanism. Transport errors, model timeouts, schema failures
and cancellation remain distinct results.

The Tauri product commands accept only a registered `signatureId` and typed
domain `input`. Each command constructs a registered single-node product
program and runs it through the same checkpointed executor. React code cannot
send messages, model names, sampling parameters, token limits or response
grammar fields. The llama-server adapter is the only layer that constructs
those transport fields.

## Evaluation and promotion

An evaluation suite binds a versioned dataset to:

- one program and candidate version;
- deterministic validators;
- domain scorers and required thresholds;
- optional side-by-side teacher ratings;
- model and runtime qualification constraints.

Evaluation runs are append-only. A candidate program becomes a release program
only through an explicit promotion record showing every required threshold.
Changing instructions, schema, module composition, validators or evidence
policy creates a new candidate version and requires replay.

The first packaged suite is the reviewed Nigeria JSS1 Ordering of fractions
case at
`src-tauri/resources/content/generation-evaluation/ordering-fractions-v1.json`.
It retains the approved learning goals, three direct source records, reviewed
assessment answers, an explicit excluded mixed-scope record and four named
quality thresholds. Research condition labels are not product concepts; only
the inputs, expected constraints, quality criteria and reviewed outputs cross
the repository boundary.

The qualification adapter resolves the suite from the installed September 2025
NERDC package and packaged Siyavula corpus rather than substituting a hand-built
lesson input. It rejects changed objective statements, absent curriculum-source
links and incomplete source resolution. The installed Gemma E2B run passes all
four `1.0` thresholds and writes the complete program identity, node statuses,
scores and lesson plan to `output/ordering-fractions-qualification.json` before
promotion.

## Granular lesson-planning adoption

The complete granular lesson-planning workflow runs on the persisted execution
platform described above. `lesson-plan.granular` uses the following nodes:

```text
curriculum scope
  -> atomic objective decomposition
  -> knowledge-component and prerequisite planning
  -> objective-aligned assessment design
  -> source-evidence planning
  -> one core instructional step per lesson objective
  -> deterministic intro and evaluation assembly
  -> complete-plan validation
  -> teacher review draft
```

The canonical output retains the donor granularity: curriculum objectives,
atomic objectives, teacher-facing lesson objectives, knowledge type, typed
content blocks, activities, assessment answers and source identities. It does
not collapse a step into two prose fields.

Model-authored nodes use strict schemas and one bounded repair attempt. Model
outputs use prose plus ordinal selections; the application binds immutable
curriculum, objective, knowledge-component, source-record and figure identities
from the input snapshots. Evidence planning, introduction and evaluation
assembly, verified figure resolution, fraction arithmetic and final validation
are deterministic. The native command attaches the actual program digest and
run identifier before the record can be saved.

## Implementation map

- Domain contracts and strict schema validation:
  `src-tauri/src/generation_program/domain.rs`
- Checkpoint repository and restart recovery:
  `src-tauri/src/generation_program/repository.rs`
- DAG executor, cancellation, timeout and bounded repair:
  `src-tauri/src/generation_program/executor.rs`
- Granular lesson program and node validators:
  `src-tauri/src/lesson_planning/program.rs`
- Evaluation replay and immutable promotion gate:
  `src-tauri/src/generation_program/evaluation.rs`
- Durable schema: migration
  `src-tauri/src/db/migrations/021_generation_program_runtime.sql`
- Native llama-server completion adapter and registered product signatures:
  `src-tauri/src/inference/mod.rs`

## Verification contract

Automated tests must prove:

1. graph registration rejects cycles, missing dependencies and type mismatch;
2. strict schemas reject extra, missing and invalid fields;
3. completed nodes survive restart and are not invoked twice;
4. cancellation does not commit a partial node;
5. repair receives the exact failed checks and cannot exceed its budget;
6. deterministic nodes produce stable digests for canonical inputs;
7. model, prompt, schema and program changes invalidate the correct checkpoint;
8. evaluation promotion fails when any named threshold fails;
9. transport-specific fields do not enter application or domain contracts; and
10. donor golden cases replay through the native runtime with reviewed results.
