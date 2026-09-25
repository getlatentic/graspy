# Ordering fractions qualification

A model is offered to teachers only after it passes this qualification against
the shipped lesson-planning program. `model_catalogue` records the program
version each offered model passed, and
`every_offered_model_is_qualified_against_this_program` fails the build when
`PROGRAM_VERSION` moves without a new qualification.

## What the gate runs

The ignored-by-default test
`lesson_planning::evaluation::tests::qualifies_the_installed_model_against_the_exact_packaged_case`
prepares the Nigeria JSS 1 Mathematics *Ordering fractions* lesson from the
packaged NERDC curriculum and Siyavula corpus through the complete granular
program, with production prompts and validators. It requires every one of these
scores at `1.0`:

- objective alignment;
- source boundary;
- mathematical correctness;
- lesson completeness.

Run it five times per program version: one pass cannot tell a program that
always passes from one that usually does.

```sh
llama-server --model <gemma>.gguf --host 127.0.0.1 --port 8099 --jinja
GRASPY_LLAMA_BASE_URL=http://127.0.0.1:8099 \
GRASPY_QUALIFICATION_OUTPUT=qualification.json \
  cargo test --manifest-path src-tauri/Cargo.toml \
  qualifies_the_installed_model_against_the_exact_packaged_case -- --ignored
```

`GRASPY_QUALIFICATION_OUTPUT` writes the run's audit: program identity, model
identity, scores, node statuses and the lesson plan. Take every identity in a
qualification record from that audit. The dataset digest is computed over the
resolved suite, so hashing the dataset JSON gives a different value, and the
program digest changes with any instruction or budget the program carries.

## Standard (Gemma 4 E2B)

| Artifact | Qualified identity |
| --- | --- |
| Generation program | `lesson-plan.granular` `1.14.0` |
| Evaluation package | `nigeria-jss1-mathematics-ordering-fractions` `1.0.0` |
| Evaluation dataset | `baf572821ee3892157eb7542a4a173583ede8a7ae27d96953c4981d8acf8d491` |
| Curriculum package | `d4f654aef41d3e39c1ee68e3ca7ea0ce3aa1d42fa6502ca24e018013c2e26827` (revision 2) |
| Model | `ggml-org/gemma-4-E2B-it-GGUF@858dcdf955fb1b5a43ed2301aea00362fc443a5c`, `gemma-4-E2B-it-Q4_0.gguf` |
| Model file SHA-256 | `8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52` |
| Local inference runtime | llama.cpp `9960` (`a935fbffe`) |

Result: five runs out of five passed, all four scores `1.0` on every run, and all
eleven program nodes completed.

## What the packaged case cannot show

The case's source records each carry their own exercise and together cover
every learning goal. A change that repeats one record's answer, or checks
coverage per item, can still pass it. Run a large real lesson through the
installed app after any change to how a stage splits its work.
