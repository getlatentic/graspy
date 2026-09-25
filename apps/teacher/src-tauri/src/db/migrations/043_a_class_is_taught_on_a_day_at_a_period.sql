-- Record when a class is actually taught.
--
-- Every screen knew the week and none knew the day, so graspy could say which
-- week of the term it is but not what a teacher is teaching tomorrow. A lesson
-- plan also asks for the period it is taught in, and graspy had no answer — its
-- own "period" is the term, which is a different thing wearing the same word.
--
-- A slot is a weekday and a numbered period in one term. It belongs to the
-- class, not to a lesson: a week's plan is taught across that week's slots, so
-- what is taught on Monday is the week's lesson, found through the class rather
-- than recorded twice.
--
-- One teacher cannot be in two rooms at once, so a weekday and period are
-- claimed once per term across every class.
CREATE TABLE teaching_slots (
    id TEXT PRIMARY KEY NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    period_ordinal INTEGER NOT NULL CHECK (period_ordinal BETWEEN 1 AND 12),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (academic_period_id, weekday, period_ordinal),
    FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON DELETE RESTRICT
);

CREATE INDEX idx_teaching_slots_class
    ON teaching_slots (teaching_assignment_id, academic_period_id, weekday, period_ordinal);
