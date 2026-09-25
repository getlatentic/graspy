# Academic workspace architecture

## Purpose

A teacher sets the active academic session and term, then adds every subject and
class they teach. Lessons inherit this context so the teacher does not repeatedly
enter it and historical work remains correctly separated across academic years.

## Product language

- **Academic session** is a pair of consecutive calendar years, displayed as
  `2026/2027`. Store the two integer years; do not store the display label as the
  source of truth.
- **Academic term** is the closed set `first`, `second`, `third`.
- **Subject** is the curriculum area, for example Mathematics.
- **Grade level** is the curriculum level, for example JSS 2.
- **Class/section** is an optional local label such as A or Blue. It is not part
  of the grade-level taxonomy.
- **Teaching assignment** binds subject, grade level and optional class/section
  to one academic session.
- **Active academic context** is one academic session, one term and one teaching
  assignment selected for the current workspace.

## UX flow

When no academic session exists, the application opens academic setup rather
than the lesson workspace:

1. Select or enter the session start year. The end year is derived and shown as
   a single session label. The initial value is suggested from the device's
   local date using September as the academic-year start month.
2. Select First, Second or Third term. The suggested term uses four-month
   bands: September–December, January–April and May–August. Both suggestions
   remain editable and never replace a persisted active context.
3. Add the first teaching assignment by selecting a subject and grade level,
   with an optional class/section.
4. Enter the workspace with the active assignment, session and term visible in
   a compact switcher.

`Manage classes` adds, edits or archives assignments. Switching an assignment or
term changes the lesson list but never rewrites existing lessons. Previous
sessions remain accessible as history and are not silently merged into the
current session.

## Data model

The persistence model is normalized around stable identifiers:

- `academic_sessions(id, start_year, end_year, status, created_at)`
- `academic_periods(id, academic_session_id, term_number)`
- `subjects(id, name, normalized_name)`
- `grade_levels(id, code, display_name, sort_order)`
- `teaching_assignments(id, academic_session_id, subject_id, grade_level_id,
  class_section, class_section_key, status, created_at, updated_at)`
- `workspace_preferences(id, active_academic_period_id,
  active_teaching_assignment_id)`
- `lessons(..., academic_session_id, academic_period_id,
  teaching_assignment_id)`

Database constraints must enforce:

- `end_year = start_year + 1`;
- term number is 1, 2 or 3;
- one period per session and term;
- subject names are unique by normalized name;
- teaching assignments are unique by session, subject, grade and the non-null
  normalized `class_section_key`; an omitted section uses an empty key rather
  than `NULL` so SQLite cannot admit duplicate unsectioned assignments;
- a lesson's period and teaching assignment belong to the lesson's academic
  session.

The redundant `academic_session_id` on a lesson is intentional: composite
foreign keys make cross-session links impossible at the database boundary.

## Component boundaries

- `academic-workspace/domain` owns types, invariants and display formatting.
- `academic-workspace/application` owns setup, switching, archiving and query
  use cases.
- `academic-workspace/infrastructure` owns typed Tauri commands and persistence
  adapters.
- `academic-workspace/ui` owns first-run setup, the workspace switcher and class
  management.
- `lessons` references academic-workspace identifiers but does not redefine or
  mutate academic-workspace entities.

## Native API contracts

The initial Tauri boundary should expose typed commands for:

- `get_academic_workspace()`;
- `create_academic_session(start_year, active_term)`;
- `add_teaching_assignment(session_id, subject, grade_level, class_section)`;
- `update_teaching_assignment(assignment_id, ...)`;
- `archive_teaching_assignment(assignment_id)`;
- `set_active_academic_context(period_id, assignment_id)`.

Commands return complete domain DTOs after committing the transaction. Partial
writes and optimistic client-only state are not accepted.

## Tested behaviour

1. A 2026 start year persists as 2026/2027 and is restored after restart.
2. Non-consecutive sessions and term values outside 1–3 are rejected.
3. Mathematics + JSS 2 + A and Mathematics + JSS 2 + B coexist.
4. An exact duplicate assignment in the same session is rejected.
5. The same assignment can be created in the next academic session.
6. Switching the active term or assignment scopes the visible lessons.
7. Archived assignments retain their lessons and disappear from the default
   active switcher.
8. A lesson transaction linking a period and assignment from different sessions
   fails at the database boundary.
9. First-run setup is keyboard accessible and cannot finish without a valid
   session, term and first assignment.
10. The last active academic context is restored after application restart.
