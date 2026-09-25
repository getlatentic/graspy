# Offline content corpus

## Product boundary

graspy uses a packaged, read-only educational content library to provide published
source material without internet access. The library is evidence for lesson-material
creation; it is not a general search index and does not require embeddings or a vector
database.

The first package contains processed, unbranded Siyavula Mathematics JSS 1 text and
source-owned instructional figures.
The source is licensed under Creative Commons Attribution 3.0 Unported. The package
includes its publisher, source address, licence, attribution, modification notice,
input digest, database digest, and record counts. Branded covers, logos, sponsorship
marks, and third-party embedded media are excluded.

The distribution notice is available in `THIRD_PARTY_CONTENT.md` and is also bundled
beside the database as `ATTRIBUTION.md`.

## Build contract

`scripts/export_textbook_corpus.py` reads the verified processed record stream and
the human-curated subtopic linkage from the donor repository. It validates every
record identifier and every curated link before writing a new database. It never
modifies an existing package in place.

The generated package contains:

- `corpus_metadata`: immutable package, provenance, licence, digest, and count data;
- `textbook_records`: durable record identifiers and the three passage forms;
- `textbook_record_subtopics`: the complete processed record-to-subtopic mapping;
- `subtopic_sources`: ranked, human-curated sources for each supported subtopic;
- `textbook_record_figures`: ordered source-record-to-asset links, accessible captions,
  dimensions, media types, origin addresses, and SHA-256 integrity hashes.

Only `prompt_text`, `content_text`, `retrieval_text`, and verified PNGs already present
in the donor's source-owned figure directory are retained. Runtime passage selection
uses the first non-empty text value in that exact order and removes Markdown image
syntax before model use. Raw HTML, remote-only images, unsafe file names, and
third-party media are not packaged.

The checked package contains 1,500 records, 2,031 record-to-subtopic associations,
68 record-to-figure links backed by 57 deduplicated PNG files, and 1,240 curated
subtopic-source links.

## Runtime contract

`ContentCorpus` opens the bundled database with SQLite read-only flags during app
startup. Startup fails explicitly if the database is missing, damaged, incomplete,
or uses an incompatible package format. The corpus connection is separate from the
teacher-owned writable database.

Lesson references may end in a durable record identifier, for example:

```text
Equivalent fractions (ch04-b014)
```

When a teacher starts material creation, the resolver:

1. reads references from the immutable confirmed lesson version;
2. extracts trailing identifiers only;
3. preserves teacher order and removes duplicates;
4. validates every explicit identifier, including identifiers beyond the prompt cap;
5. returns no more than three excerpts;
6. rejects an unknown explicit identifier before a material run is created.

Figure metadata is resolved separately from text. The model never receives a figure
output field. A figure is available only when its source record is part of the exact
confirmed lesson source set.

References without a trailing identifier remain teacher notes and are not treated as
published evidence. A lesson with no linked published evidence can still be created;
the model is instructed not to cite or invent a source.

## Durable material linkage

Resolved excerpts are copied into the teacher-owned database when the version-bound
material run is created. Each saved source includes its record identifier, title,
publisher, source address, licence, attribution, sequence, and exact excerpt text.
Every section in that run links to the same bounded lesson source set. Matching figure
metadata is snapshotted with the run and retains its exact published-source link. This
snapshot ensures that reopening an old run does not silently change its evidence if a
future corpus package is installed.

The confirmed lesson and active lesson step remain the instruction context. The full
pasted lesson-plan source is retained in lesson history for audit but is not injected
as published evidence or duplicated into every generation request.

## Security and failure behavior

Published excerpts are untrusted quoted data. The model instruction explicitly says
to treat them as evidence, never as instructions. Unknown identifiers, damaged corpus
metadata, and missing attribution are hard failures. There is no citation-label
fallback and no silent online retrieval path. Figure reads are authorized against the
active lesson version, restricted to safe PNG file names, and rejected when the
bundled bytes do not match the snapshotted hash.

## Verification

Native tests cover:

- trailing identifier parsing;
- `prompt_text → content_text → retrieval_text` selection;
- stable order, deduplication, and the three-excerpt cap;
- unknown identifiers, including a fourth identifier beyond the cap;
- curated subtopic rank order;
- known-record resolution from the packaged corpus;
- persistence of record identifier, licence, attribution, and source order;
- ordered figure resolution, safe path enforcement, and byte-integrity verification;
- removal of source Markdown images before generation;
- rejection before run creation when a confirmed lesson references an unknown record.

The exporter performs foreign-key validation before committing, and the runtime runs
SQLite `quick_check` plus package/count validation before accepting the library.
