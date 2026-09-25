# LFM2.5-1.2B: why Light is not offered

The model catalogue holds a low-memory option, Light, backed by LFM2.5-1.2B. It
is `Qualification::Pending`, so `offered_models()` excludes it and teachers do
not see a model picker. This record is the measurement behind that.

## What was tested

| Field | Value |
|---|---|
| Model | `LFM2.5-1.2B-Instruct-Q4_0.gguf` |
| Repository | `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` |
| Revision | `047e06635fbe71469926b35ea414537245218200` |
| Size / digest | 695,751,488 bytes, `2ea801949d760cdf1a2cc04a54262c22c3c0c54f0769d57760c9adeb0e59233f` |
| Engine | bundled `llama-server`, `9960 (a935fbffe)` |
| Engine flags | `--ctx-size 8192 --parallel 1 --n-gpu-layers all --jinja --reasoning-budget 1024` |
| Program | `lesson-plan.granular` 1.11.0 |
| Suite | `nigeria-jss1-mathematics-ordering-fractions` 1.0.0 |

The file matched the byte size and SHA-256 that `model_catalogue` pins. The
harness is the same qualification test Standard passes; set
`GRASPY_QUALIFICATION_MODEL` to qualify a catalogue model other than the
default.

## Result: failed three times at the same node

| Node | Status |
|---|---|
| `evidence-planning` | completed |
| `objective-decomposition` | completed |
| `knowledge-planning` | completed |
| `assessment-design` | **failed** |
| the remaining seven | never ran |

Every run failed with the same diagnostic:

> An assessment's expected answer restates a learning goal instead of answering
> its question. Give the actual answer to "Arrange the fractions 8/9, 11/12, 5/6
> in descending order."

## The failure is capability, not instructions

- Asked plainly, five times with different seeds, to order the three fractions,
  it returned them in input order every time.
- Asked to compare them two at a time, it answered 11/12 against 5/6 with
  `12/12`.
- Given step-by-step instructions, a common-denominator method and a
  1,600-token budget, one run in eight stated the correct order. The seven wrong
  runs converted correctly (`8/9 ≈ 0.8889, 11/12 ≈ 0.9167`) and then called 8/9
  the largest.

A prompt cannot fix a model that contradicts its own correct working.

## Screening the next candidate

A candidate must compare fractions reliably enough to clear
`assessment-design`. Ask it to order three fractions eight times before
spending a qualification run on it.

LFM2.5 is under the LFM Open License v1.0; see `THIRD_PARTY_CONTENT.md` for what
that licence means for acquisition.
