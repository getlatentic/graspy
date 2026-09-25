-- A lesson's steps were kept in its plan and copied into two tables beside it.
--
-- `lesson_steps` and `lesson_version_steps` held one row per step, flattening
-- what the plan already says: the title, the teacher and learner activities
-- joined into single strings, and the minutes. The function that wrote them is
-- called `insert_step_projection`, which is what they were — a copy kept by
-- hand, in several places, of a plan that was right there.
--
-- Every copied row lines up with the plan's step of the same sequence: the nine
-- lessons with a plan hold all forty-two rows, and the seven with none hold no
-- rows at all.
--
-- A classwork section pointed at a copied row. It points at the plan's own step
-- instead, which is stable because a sealed plan cannot change.

-- SQLite cannot drop a foreign key, so the section table is rebuilt around the
-- new reference. Every other column, check and default is carried across as it
-- stood.
CREATE TABLE classwork_sections_v48 (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    plan_step_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    step_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'failed')),
    generated_title TEXT,
    learning_goal_numbers TEXT NOT NULL DEFAULT '[]',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    generation_token TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_outcome TEXT CHECK (quality_outcome IN ('passed', 'repaired', 'scrubbed', 'failed')),
    repair_attempted INTEGER CHECK (repair_attempted IN (0, 1)),
    scrubbed_claim_count INTEGER CHECK (scrubbed_claim_count >= 0),
    UNIQUE (run_id, sequence),
    UNIQUE (run_id, plan_step_id),
    FOREIGN KEY (run_id) REFERENCES classwork_runs(id) ON DELETE CASCADE,
    CHECK (
        (status = 'generating' AND generation_token IS NOT NULL)
        OR (status <> 'generating' AND generation_token IS NULL)
    )
);

INSERT INTO classwork_sections_v48 (
    id, run_id, plan_step_id, sequence, step_title, status, generated_title,
    learning_goal_numbers, attempt_count, generation_token, last_error,
    created_at, updated_at, quality_outcome, repair_attempted, scrubbed_claim_count
)
SELECT sections.id, sections.run_id,
       COALESCE(
           json_extract(
               sealed.plan_json,
               '$.steps[' || (sections.sequence - 1) || '].id'
           ),
           sections.lesson_version_step_id
       ),
       sections.sequence, sections.step_title, sections.status, sections.generated_title,
       sections.learning_goal_numbers, sections.attempt_count, sections.generation_token,
       sections.last_error, sections.created_at, sections.updated_at,
       sections.quality_outcome, sections.repair_attempted, sections.scrubbed_claim_count
FROM classwork_sections sections
JOIN classwork_runs runs ON runs.id = sections.run_id
LEFT JOIN lesson_granular_versions sealed
       ON sealed.lesson_version_id = runs.lesson_version_id;

DROP TABLE classwork_sections;
ALTER TABLE classwork_sections_v48 RENAME TO classwork_sections;

-- Nothing is lost by dropping it. Migration 27 repaired mathematics a bad escape
-- had swallowed, and it repaired it here — but the plan column checks
-- `json_valid`, and a raw form feed or tab inside a JSON string is not valid
-- JSON, so the mangled text could never be stored in a plan at all. The repair
-- was only ever needed where it was applied.
DROP TABLE lesson_version_steps;

-- `lesson_steps` stays. It was two things at once: a projection of the plan for
-- a lesson that has one, and the teacher's own steps for a lesson typed into
-- the form, which has no plan. Only the projection goes — the writer that
-- copied a plan into it is removed — so what is left is the form's own content,
-- with one writer and nothing to drift from.
DELETE FROM lesson_steps
 WHERE lesson_id IN (SELECT lesson_id FROM lesson_granular_drafts);
