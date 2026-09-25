# Gemma 4 E2B runtime

## Shipped model

| Field | Value |
|---|---|
| Repository | `ggml-org/gemma-4-E2B-it-GGUF` |
| Repository revision | `858dcdf955fb1b5a43ed2301aea00362fc443a5c` |
| File | `gemma-4-E2B-it-Q4_0.gguf` |
| Size | `2,841,481,184` bytes |
| SHA-256 | `8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52` |
| Artifact repository licence | Apache-2.0 |
| Upstream model licence | [Apache-2.0](https://ai.google.dev/gemma/docs/gemma_4_license) |
| llama.cpp | 9960 (`a935fbffe`) |

The checksum and byte size match the repository's LFS metadata. The model loads
with Metal acceleration and serves a healthy loopback endpoint. Its lesson
quality is recorded in
[the ordering fractions qualification](../content/ordering-fractions-gemma-qualification.md).

The artifact and upstream licences are separate fields because they are facts
about separate repositories, even though both name Apache-2.0. Gemma 4 is
released under the Apache License 2.0; the Gemma Terms of Use scope themselves to
the models listed in their appendix and do not apply to it.

Apache-2.0 permits redistribution. graspy downloads the pinned file on first use
to keep the installer small and to release model updates separately from the
app. Neither pinned repository contains a `NOTICE` file at its pinned revision.

## Not eligible: Google QAT artifact

`google/gemma-4-E2B-it-qat-q4_0-gguf` at revision
`02078d687ddc1fdb1af29400364bdca7ee2b6062` (`gemma-4-E2B_q4_0-it.gguf`, SHA-256
`25194efbf8a53268241e5ffa6d5490edc08b3faaa6ead24478c8b025a986d556`) aborts in
llama.cpp 9960 while loading the vocabulary, before the server becomes healthy:

```text
GGML_ASSERT(id_to_token.size() == token_to_id.size()) failed
```

## Representative lesson-material run

One JSS 2 mathematics lesson through the production prompt and strict
lesson-material JSON Schema returned one review, one worked example, one
practice task and one matching solution. Every item kept the confirmed
learning-goal and source-material identifiers, and the mathematics was correct.

| Measure | Result |
|---|---:|
| Prompt tokens | 184 |
| Prompt processing | 245.32 tokens/second |
| Created tokens | 854 |
| Creation speed | 59.55 tokens/second |
| Creation time | 14.34 seconds |
| Server RSS after creation | 3,072,368 KiB (2.93 GiB) |

## Packaged engine

The macOS arm64 sidecar is built from llama.cpp commit
`a935fbffe1a3d31509c325c116454ab5d56b2eb8` with an Apple Silicon baseline rather
than the build machine's native CPU flags (`scripts/fetch-sidecars.sh`). The
executable links only Apple system libraries and frameworks; HTTPS, OpenSSL and
package-manager libraries are excluded.

Tauri starts a small supervision sidecar, `graspy-inference-runner`, which owns
`llama-server` and watches its control pipe. On Cmd-Q or a forced SIGKILL of the
app, the supervisor and the engine both exit.
