# Nigeria JSS 1 Mathematics source audit

## Decision

The September 2025 **New Revised Basic Education Curriculum** is the selected
source edition. The `plan-to-tutor` JSS 1 Mathematics dataset remains the
canonical granular planning baseline; it is not copied or re-entered. A
digest-bound revision overlay maps every revised source topic to that baseline,
retains its stable identifiers and source links, and records the revised
learning outcomes, focal competencies and complete source-table fields.

NERDC now publishes a separate **New Revised Basic Education Curriculum** for
JSS 1. Its Mathematics PDF was created on 19 September 2025 and differs at the
framework level by adding learning outcomes and focal competencies. The donor
dataset predates that artifact and is therefore never assigned the revised
edition by inference. The overlay explicitly maps 23 source topics on 24
curriculum pages to all 24 granular planning topics. `Data representation`
maps to the existing data-presentation topic, while the revised `Need for
statistics` topic maps to the separate need-for-statistics and data-collection
planning topics. `Use of Symbols` retains one planning topic across two source
pages.

The project owner has recorded the redistribution basis for NERDC curriculum
texts as the exclusion for official legislative or administrative texts in
section 3(b) of Nigeria's Copyright Act 2022. The package therefore records an
`officialText` rights basis, the exact NERDC source, attribution, and Graspy's
modification notice. It does not invent a Creative Commons or other licence.

The package is an unsigned Graspy conversion and is labelled **Included with
Graspy**, not official or publisher verified. Its source identity, rights basis,
attribution, modification notice, revision-overlay digest and original dataset
digest are installed with the immutable payload.

## Source identities

| Source | Address | SHA-256 | Finding |
| --- | --- | --- | --- |
| Earlier NERDC JSS 1-3 Mathematics curriculum | `https://nerdc.gov.ng/content_manager/jss/jss1-3_maths.pdf` | `e6f8bf238cbba80c643bafada63b6ff692a6af10b9a6cecaa3e1597551bb82c1` | Matches the donor dataset's topic and performance-objective structure. Redistributable as an official administrative text under the recorded project rights basis; no separate licence is asserted. |
| New revised NERDC JSS 1 Mathematics curriculum | `https://lmis.nerdcportals.com.ng/jss_1/necurrdc/2.pdf` | `278b771e2e41fa2101b6b11627eb3df8466cb5994bec457221de128eac7a26e6` | Selected revised source artifact found through NERDC's curriculum portal; Corel metadata creation date is 19 September 2025. Redistributable under the recorded official-text basis and reviewed through the revision overlay. |
| Lagos JSS 1 Mathematics unified scheme of work | `https://syllabus.ng/jss1-scheme-of-work/math/` | `384150beee26361a43678a2b8896010a52fb380360c689fd0c0a59ff370907b9` | Public Lagos State Ministry of Education schedule data. The recovered all-subject PDF was delivered through SyllabusNG; its branding and presentation are excluded. The schedule has an `officialText` basis and no licence object. |
| Siyavula Mathematics JSS 1 | `https://ng.siyavula.com/read` | Recorded in the bundled corpus manifest | CC BY 3.0 text and source-owned figures may be redistributed with attribution and modification notice; branded and third-party media are excluded. |

The NERDC hashes identify the exact downloaded source bytes. They do not imply
NERDC approval, authorship by Graspy, or publisher verification. The statutory
rights-basis address recorded by the package is
`https://www.copyright.gov.ng/wp-content/uploads/2023/04/CopyrightAct2023FinalPublication1.pdf`.

## Donor dataset inventory

The canonical `plan-to-tutor/dataset/processed` dataset contains:

- 5 themes;
- 24 topics;
- 78 subtopics;
- 101 performance objectives;
- 158 atomic objectives;
- 118 curriculum knowledge components;
- 274 explicit knowledge-component-to-atomic-objective alignments;
- 74 term-plan teaching entries across three terms;
- 997 atomic-objective-to-textbook links and 243 shared subtopic foundation
  links, for 1,240 retained source links in total;
- 136 atomic objectives with direct textbook links and 22 without direct links;
- 75 subtopics with at least one source record and 3 with no records.

The live `plan-to-tutor` database contains the same 5 themes, 24 topics, 78
subtopics, 101 performance objectives, 118 knowledge components, 158 atomic
objective links and 1,500 textbook records. The Obsidian
`lesson-context/processed` directory is a dated copy whose manifest explicitly
names `plan-to-tutor/dataset/processed` as its source; byte comparison of the
topic file confirms it is an evidence snapshot, not a competing canonical
dataset.

The donor linkage rows begin with 31 `mapped`, 44 `needs_review`, and 3
`no_records` states. `needs_review` remains material content state and is not
collapsed into success during export. The revision overlay resolves exactly the
Ordering of fractions review, producing 32 `mapped`, 43 `needs_review`, and 3
`no_records` states in the released package.

The Ordering of fractions review retains `ch04-b032`, `ch04-b033-i01` and
`ch04-b033-i02` for the ascending and descending objectives. It excludes
`ch04-b033-i03` because that item mixes equivalence, highest/lowest value and
improper-fraction checks. The stored review passes objective alignment,
curriculum scope, mathematical correctness and pedagogical usefulness. Eleven
other donor source links with missing rationale text are repaired by explicit,
reviewed overlay records rather than placeholder text or donor-file mutation.

## Package boundary

Curriculum and pacing are separate immutable packages:

```text
Curriculum edition
  -> theme
    -> topic
      -> subtopic
        -> performance objective
          -> atomic objective

Subtopic
  -> curriculum knowledge component

Atomic objective
  -> textbook source records

School pacing edition
  -> academic period
    -> week
      -> curriculum subtopic entries
```

The curriculum package must not force the donor knowledge components onto one
arbitrary atomic objective. Donor knowledge components are authored at
subtopic scope and may span several atomic objectives. Package version 2
therefore retains each subtopic node and explicitly links each component to the
atomic objectives within that reviewed subtopic, producing 274 installed
relations. Every component also has an explicit teaching type: representation
terms take precedence, higher-order action outcomes are procedures, and
remember/understand outcomes are concepts. Export fails when a component has no
atomic objective instead of leaving an unusable runtime record.

The pacing source omits non-teaching rows from `jss1_scheme.json`, while the
source tables retain revision, mid-term test, examination, and vacation rows.
The pacing exporter reconstructs 39 consecutive weeks from those source rows:
27 teaching, 4 revision, 3 test, 4 examination and 1 break week. All 74 teaching
entries retain stable curriculum-node, objective and source-record links. Three
malformed second-term table titles are repaired by source-bound editorial
corrections; export fails if the expected source text changes. No week title is
silently truncated.

## Release gates

A distributable package requires all of the following:

- exact source artifact address and digest;
- explicit edition and effective dates;
- publisher and framework authority kept distinct;
- a typed rights basis with its authoritative address, attribution, and
  modification notice; a licence object only when a licence actually applies;
- an affirmative redistribution decision recorded in exporter metadata;
- zero dangling hierarchy, objective, knowledge-component, pacing, or textbook
  references;
- all unresolved content-review states preserved and visible to release
  qualification;
- byte-for-byte deterministic output and automated count checks;
- installation through the same native validator used for imported packages.

Only a package signed by a key in the release trust registry may be shown as
publisher verified. A Graspy-authored conversion must not imply NERDC or Lagos
State publisher approval.

The generated release lives at
`src-tauri/resources/content/nerdc-jss1-mathematics-september-2025/curriculum.graspy-curriculum`.
The three generated term plans live under
`src-tauri/resources/content/lagos-jss1-mathematics-scheme/`. graspy-teacher
validates the curriculum first, then installs all three term plans in one
transaction at startup. Repeated startup is idempotent, and imported packages
remain distinguishable from content included with Graspy.
