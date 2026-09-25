# Third-party educational content

## NERDC Mathematics JSS 1 curriculum

- Authority: Nigerian Educational Research and Development Council
- Source: https://lmis.nerdcportals.com.ng/jss_1/necurrdc/2.pdf
- Edition: September 2025
- Source SHA-256: `278b771e2e41fa2101b6b11627eb3df8466cb5994bec457221de128eac7a26e6`
- Rights basis: official administrative text, recorded under section 3(b) of
  Nigeria's Copyright Act 2022

Graspy redistributes a machine-readable conversion, not the NERDC PDF. The
conversion maps the revised source tables to the existing granular
`plan-to-tutor` planning dataset while preserving both source and dataset
digests. It is unsigned and is presented as **Included with Graspy**, not as
official, NERDC-approved, or publisher verified.

## Lagos JSS 1 Mathematics scheme of work

- Authority: Lagos State Ministry of Education
- Delivered source: https://syllabus.ng/jss1-scheme-of-work/math/
- Source SHA-256: `384150beee26361a43678a2b8896010a52fb380360c689fd0c0a59ff370907b9`
- Rights basis: public official government schedule data; no content licence is
  asserted or required by the package

Graspy includes a machine-readable conversion of the Mathematics JSS 1 weekly
schedule, not the source PDF or SyllabusNG presentation. It preserves all three
terms, non-teaching weeks and 74 teaching entries, and aligns them to the
September 2025 NERDC curriculum package. SyllabusNG branding is excluded. The
conversion is unsigned and is presented as **Included with Graspy**, not as
Lagos State publisher verified.

## Siyavula Mathematics JSS 1

- Publisher: Siyavula
- Source: https://ng.siyavula.com/read
- Licence: Creative Commons Attribution 3.0 Unported
- Licence text: https://creativecommons.org/licenses/by/3.0/

Siyavula Mathematics JSS 1 is redistributed as unbranded, processed textbook
excerpts and source-owned instructional figures. The material was segmented and
its formatting was normalised for use inside graspy. Siyavula logos, sponsorship
marks, branded covers, and third-party embedded media are not included.

Attribution: Siyavula Mathematics JSS 1, from https://ng.siyavula.com/read,
licensed under Creative Commons Attribution 3.0 Unported. Processed into
structured excerpts by graspy; formatting and segmentation changed.

## Embedded document-export assets

The offline PDF and print renderer embeds the following software assets so lesson
documents do not require a network connection:

- Nunito variable font from `@fontsource-variable/nunito` 5.2.7, licensed under the
  SIL Open Font License 1.1. The complete licence is stored at
  `src-tauri/export-assets/nunito/LICENSE`.
- KaTeX 0.17.0 runtime, stylesheet, and mathematics fonts, licensed under the MIT
  License. The complete licence is stored at
  `src-tauri/export-assets/katex/LICENSE`.

These assets provide typography and mathematics rendering only. They are not lesson
content and do not add a network dependency to exported documents.

## Bundled inference engine

graspy bundles a compiled `llama-server` from llama.cpp as a sidecar so lessons
can be prepared with no network connection. `scripts/fetch-sidecars.sh` builds it
from the pinned llama.cpp source release. The engine and everything vendored into
it are permissive; none is copyleft.

Two of the vendored libraries require their copyright and permission notice to
travel with a binary redistribution, so the notices ship inside the app at
`Contents/Resources/binaries/licenses/`:

- llama.cpp, MIT, © 2023-2026 The ggml authors
- cpp-httplib, MIT, © 2017 yhirose — 2,375 symbols in the shipped binary
- nlohmann/json, MIT, © 2013-2025 Niels Lohmann — 1,809 symbols

Also compiled in, and requiring no notice because their public-domain options
are elected: miniaudio (Unlicense or MIT-0), stb_image (MIT or Unlicense), and
subprocess.h (Unlicense).

The SYCL and OpenVINO backends carry Apache-2.0 terms, and are not built into
this binary — `otool -L` shows only Apple frameworks and Metal. A build that
enables them takes on their NOTICE and change-statement obligations.

Which libraries actually ship was established with `nm` against the bundled
binary rather than read off the build files, because the two differ: core
`libllama` references none of these, and the obligations come entirely from
shipping `llama-server`.

## Model weights and their terms

graspy ships no model weights in the installer. The engine acquires them on
first run, verified by byte size and SHA-256, or takes the identical file from
storage the teacher supplies.

**Gemma 4 (shipped default) — Apache-2.0.** Redistribution is permitted, so
bundling would be lawful; downloading on first use is a choice about installer
size and update cadence, recorded in `docs/runtime/gemma-4-e2b.md`.

**LFM2.5 (catalogued, not offered) — LFM Open License v1.0, tagged `lfm1.0`.** Built
on Apache 2.0. Redistribution is permitted on Apache-style conditions, but the
commercial grant is conditioned on the licensee's annual revenue staying below
ten million US dollars, measured across the group of entities under common
control. Crossing that threshold terminates the licence automatically, requiring
use to stop and copies to be deleted, or a commercial licence to be bought from
Liquid AI. Nonprofits and researchers are exempt for non-commercial and research
use.

For LFM that makes first-run acquisition a licensing decision rather than a size
one: graspy redistributes nothing, and the teacher receives the weights from
Liquid AI under their own grant. Bundling LFM weights into the installer must
not happen without re-reading the licence against graspy's revenue at that time.
