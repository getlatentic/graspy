# Curriculum and scheme-of-work architecture

## Multi-jurisdiction boundary

Curriculum content, school scheduling and geographic identity are independent
concepts. Graspy must not treat Nigeria's current three-term structure as a
universal calendar or treat Common Core as a United States federal curriculum.

The canonical ownership chain is:

```text
Country
  -> Jurisdiction
     -> Standards framework edition
        -> Curriculum course
           -> Curriculum hierarchy and standards

School
  -> Academic session
     -> Named academic periods
        -> Pacing plan / scheme of work
```

- **Country** uses an ISO country code.
- **Jurisdiction** identifies the authority scope separately, including a
  country, state or other education authority.
- **Standards framework edition** records the publisher/authority, version,
  effective dates, source artifact, digest, rights basis, optional licence,
  attribution and trust.
- **Curriculum course** binds one framework edition to a subject and grade in a
  versioned grade system.
- **Academic periods** are school-owned named periods. Nigeria can use First,
  Second and Third term; a US school can use semesters, quarters or its own
  calendar.
- **Pacing plan** assigns curriculum content to those periods and weeks. A
  standards framework never invents a local teaching schedule.

Every product contract uses academic-period identifiers. The migrations convert
legacy term values losslessly to named academic-period records and keep their
identifiers.

## Curriculum hierarchy

Frameworks retain their source structure while sharing a small canonical spine:

```text
CurriculumCourse
  -> CurriculumNode (ordered parent/child hierarchy)
     -> AtomicLearningObjective
        -> KnowledgeComponent
```

`CurriculumNode.kind` uses a controlled package-declared vocabulary. The
Nigeria package can retain theme, topic, content/subtopic and performance
objective semantics. A Common Core package can retain domain, cluster and
standard semantics plus Standards for Mathematical Practice. Source codes and
wording are immutable within one framework edition.

Lessons align to one or more immutable curriculum nodes and atomic objectives.
Cross-framework alignments are explicit versioned records with a stated author
and confidence; grade or standards equivalence is never guessed from labels.

## Granular lesson contract

The curriculum package feeds a granular lesson rather than a flattened form.
Each confirmed lesson retains:

- curriculum objectives and atomic teachable objectives;
- teacher-facing lesson objectives with stable alignment;
- knowledge type and prerequisite relationships;
- expected prior knowledge and misconceptions;
- intro, objective-aligned core and evaluation step roles;
- typed explanation, worked-example, practice and verified visual blocks;
- teacher and learner activities as ordered lists;
- objective-aligned questions, expected answers and scoring guidance;
- instructional materials and attributable source identities.

The generation and validation pipeline for this contract is specified in
`docs/architecture/generation-program-runtime.md`.

## Purpose

A teacher chooses the academic session, term, subject and class they are working
on, then starts from a matching scheme supplied by their school or creates one
themselves. The teacher confirms the real term dates and receives an editable,
week-by-week copy for that class and term.

## Product language

The interface uses the language a teacher needs:

- **Available schemes** for reusable schemes that match the active subject,
  class and term.
- **Imported by this school** for a file added locally without a publisher
  signature.
- **Included with Graspy** for an unsigned, attributable package distributed as
  an application resource and validated through the same package contract.
- **Publisher verified by Graspy** only when the file has a valid signature from
  a publisher key shipped in the trusted-key registry.
- **Term dates**, **weeks**, **topics**, **learning outcomes**, **objectives**,
  **assessment**, **materials** and **notes** inside the working scheme.

Database and package terminology stays in engineering documentation. Words such
as provenance, digest, adapter and grounding do not appear in the teacher flow.

## Teacher flow

1. The active session, term and subject/class remain visible in the workspace
   header.
2. The teacher selects one installed curriculum course matching the exact
   subject, class level and school jurisdiction. Lessons and schemes remain
   unavailable until this choice is complete.
3. Graspy shows only installed schemes matching that exact subject, class and
   term.
4. The teacher can preview the publisher, edition, weeks and topics before
   choosing a scheme.
5. The teacher confirms the school term dates and selects **Use this scheme**.
6. Graspy creates an independent, editable copy. Changes never mutate the
   installed source package or another class's scheme.
7. Breaks and examinations remain visible in week numbering and can be adjusted
   in the working copy.
8. If no suitable scheme is installed, the teacher can import a school-supplied
   `.graspy-scheme` file or choose **Build my own**.

The application does not label a converted curriculum or pacing package as
publisher verified without an authoritative source and a trusted publisher
signature. Government texts retain their statutory rights basis instead of
being assigned a fictional content licence.

## Curriculum package contract

A curriculum file is a UTF-8 JSON envelope with an exact base64-encoded payload
and an optional Ed25519 signature. Version 1 is the legacy licensed-content
format. Version 2 records:

- a stable package identifier and edition;
- ISO country code and separate jurisdiction code;
- title, publisher, effective dates, source identity and source SHA-256;
- a typed rights basis (`licence`, `officialText`, `publicDomain`, or
  `permission`), its authoritative address and statement;
- a licence identifier, name and URL only when the rights basis is `licence`;
- separate attribution and modification notice;
- framework name and authority;
- a declared hierarchy-kind vocabulary;
- one or more subject and grade-system courses;
- ordered parent-first nodes, atomic learning objectives, knowledge components
  and acyclic prerequisite relationships.

Unknown fields, unsupported values, dangling identifiers, duplicate codes,
invalid dates, hierarchy-order errors, prerequisite cycles and incomplete
attribution are rejected before SQLite is opened for mutation. Installation is
one transaction. Reinstalling the exact package is idempotent; changed bytes
under an installed package identifier and edition are rejected.

The exact payload and its digest are retained. Installed package, framework,
course hierarchy, objective, knowledge-component and prerequisite records are
immutable. An imported unsigned file is labelled **Added by your school**. An
unsigned application resource is labelled **Included with Graspy**. Only a
valid signature from a key in the release trust registry is labelled
**Publisher verified**. Distribution origin and signature trust are separate
properties.

## Package contract

A `.graspy-scheme` file is a UTF-8 JSON envelope:

```json
{
  "schemaVersion": 3,
  "payload": "base64-encoded UTF-8 JSON",
  "signature": null
}
```

The payload identifies one subject, class and term and contains:

- stable package identifier, title, publisher, jurisdiction and edition;
- optional HTTP or HTTPS source address retained for internal attribution;
- ordered weeks numbered consecutively from 1;
- teaching, revision, test, break or examination week type;
- ordered teaching plans with topic, optional subtopic, curriculum unit,
  learning outcomes, objectives, assessment, materials and optional notes.

Version 3 additionally requires source and dataset digests, a typed rights
basis, separate attribution and modification notice, stable curriculum links,
and source-record links. Its licence object is present only when the declared
rights basis is `licence`.

If a signature is present it must use Ed25519 and is checked against the
release-controlled trusted publisher registry. Unknown keys, invalid signatures
and unsupported algorithms are rejected. Unsigned imported files are accepted
as local school content and are never presented as verified. Unsigned
application resources are installed with `origin=bundled` and shown as
**Included with Graspy**; signature trust remains separate.

The SHA-256 digest covers the exact decoded payload bytes. A package identifier
and edition may only refer to one digest. Changed content must use a new edition;
this blocks silent replacement of an already installed scheme.

## Persistence and ownership

- `scheme_template_packages` stores immutable package identity, publisher,
  edition, source, digest, trust status, distribution origin, signer and exact
  payload.
- `scheme_templates` binds a package to one subject, class and term.
- `scheme_template_weeks` and `scheme_template_entries` store immutable preview
  and copy source content.
- `schemes_of_work.scheme_template_id` records the optional origin of a working
  scheme.
- The existing curriculum, calendar, scheme week and scheme entry tables store
  the teacher-owned working copy.
- `curriculum_packages` stores the immutable curriculum envelope identity,
  rights basis, optional licence, attribution, trust state and exact payload.
- `curriculum_frameworks.package_id` separates installed source frameworks from
  legacy teacher-entered records.
- `teaching_assignments.curriculum_course_id` records the course selected for
  the class. New schemes use this exact course instead of creating another
  framework from pacing-plan metadata.

SQLite triggers prevent installed package, template, week and entry content from
being updated or deleted. Applying a template is one transaction: compatibility
and date checks, course/calendar creation, complete week derivation and content
copy either all commit or none commit.

## Invariants

1. One active working scheme exists per teaching assignment and academic term.
2. A template can only be installed and selected for its declared subject,
   class and term.
3. Term dates remain within the September-through-August academic session and
   cover at least the number of weeks in the selected template.
4. Week and plan numbers are consecutive and start at 1.
5. Break and examination weeks require a name and cannot contain teaching
   plans.
6. Only teaching weeks accept plans.
7. A selected template is copied; it is never edited in place.
8. Identical package and edition content is idempotent. Different content under
   the same identity is rejected.
9. Only a valid signature from a release-trusted key earns verified status.
10. All native mutations return the complete persisted context after commit.

## Native contracts

- `get_curriculum_catalog()`
- `install_curriculum_package(request)`
- `assign_curriculum_course(request)`

- `get_scheme_of_work_context(request)`
- `install_scheme_template_package(request)`
- `create_scheme_from_template(request)`
- `create_scheme_of_work(request)` for the teacher-built path
- `save_scheme_week(request)`
- `save_scheme_entry(request)`
- `archive_scheme_entry(request)`

React owns only view state such as the selected template and chosen file. Package
validation, compatibility, trust, date rules and copying belong to the native
domain and repository.

## Verification

Automated tests cover unsigned and signed trust, complete curriculum hierarchy
installation, parent ordering, prerequisite cycles, attribution, transaction
rollback, immutable content, idempotency, changed package identity,
subject/class course compatibility, selected-course scheme ownership, invalid
week structure, date-derived copying, persistence restoration, semantic
selection and file import command mapping.
