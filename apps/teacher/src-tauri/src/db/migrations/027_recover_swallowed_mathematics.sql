-- Recover the mathematics a JSON escape swallowed before it was repaired on decode.
--
-- A model writing `\frac` inside a JSON string without escaping the backslash
-- handed the parser a valid escape, so `\frac{1}{2}` was stored as a form feed
-- followed by `rac{1}{2}`. Lessons prepared before the repair carry that damage.
--
-- The stored control character is proof of what was written, so this recovers
-- the original exactly rather than guessing. It is confined to text the model
-- authored: `lessons.raw_plan`, `source_plan_text` and `learning_goals` hold
-- what the teacher typed or pasted, where a tab can be meant, and are untouched.
--
-- A carriage return before a newline is a line ending rather than a swallowed
-- `\rightarrow`, so text containing one keeps its carriage returns.

UPDATE lesson_steps
SET title = replace(replace(replace(replace(title, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f'),
    teacher_activity = replace(replace(replace(replace(teacher_activity, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f'),
    learner_activity = replace(replace(replace(replace(learner_activity, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f')
WHERE instr(title, char(8)) > 0 OR instr(title, char(9)) > 0 OR instr(title, char(11)) > 0 OR instr(title, char(12)) > 0
   OR instr(teacher_activity, char(8)) > 0 OR instr(teacher_activity, char(9)) > 0 OR instr(teacher_activity, char(11)) > 0 OR instr(teacher_activity, char(12)) > 0
   OR instr(learner_activity, char(8)) > 0 OR instr(learner_activity, char(9)) > 0 OR instr(learner_activity, char(11)) > 0 OR instr(learner_activity, char(12)) > 0;

UPDATE lesson_steps
SET title = replace(title, char(13), '\r'),
    teacher_activity = replace(teacher_activity, char(13), '\r'),
    learner_activity = replace(learner_activity, char(13), '\r')
WHERE instr(title || teacher_activity || learner_activity, char(13) || char(10)) = 0
  AND (instr(title, char(13)) > 0 OR instr(teacher_activity, char(13)) > 0 OR instr(learner_activity, char(13)) > 0);

UPDATE lesson_material_blocks
SET text = replace(replace(replace(replace(text, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f')
WHERE instr(text, char(8)) > 0 OR instr(text, char(9)) > 0 OR instr(text, char(11)) > 0 OR instr(text, char(12)) > 0;

UPDATE lesson_material_blocks
SET text = replace(text, char(13), '\r')
WHERE instr(text, char(13) || char(10)) = 0 AND instr(text, char(13)) > 0;

UPDATE lesson_material_figures
SET caption = replace(replace(replace(replace(caption, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f'),
    alt_text = replace(replace(replace(replace(alt_text, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f')
WHERE instr(caption, char(8)) > 0 OR instr(caption, char(9)) > 0 OR instr(caption, char(11)) > 0 OR instr(caption, char(12)) > 0
   OR instr(alt_text, char(8)) > 0 OR instr(alt_text, char(9)) > 0 OR instr(alt_text, char(11)) > 0 OR instr(alt_text, char(12)) > 0;

-- A confirmed version is immutable so a teacher's signed-off lesson cannot be
-- edited underneath them. Recovering swallowed mathematics is not an edit: it
-- restores what the version already said. Without this, a library holding
-- confirmed versions would carry the damage permanently, with no path to fix it.
DROP TRIGGER lesson_version_steps_immutable_update;

UPDATE lesson_version_steps
SET title = replace(replace(replace(replace(title, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f'),
    teacher_activity = replace(replace(replace(replace(teacher_activity, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f'),
    learner_activity = replace(replace(replace(replace(learner_activity, char(8), '\b'), char(9), '\t'), char(11), '\v'), char(12), '\f')
WHERE instr(title, char(8)) > 0 OR instr(title, char(9)) > 0 OR instr(title, char(11)) > 0 OR instr(title, char(12)) > 0
   OR instr(teacher_activity, char(8)) > 0 OR instr(teacher_activity, char(9)) > 0 OR instr(teacher_activity, char(11)) > 0 OR instr(teacher_activity, char(12)) > 0
   OR instr(learner_activity, char(8)) > 0 OR instr(learner_activity, char(9)) > 0 OR instr(learner_activity, char(11)) > 0 OR instr(learner_activity, char(12)) > 0;

UPDATE lesson_version_steps
SET title = replace(title, char(13), '\r'),
    teacher_activity = replace(teacher_activity, char(13), '\r'),
    learner_activity = replace(learner_activity, char(13), '\r')
WHERE instr(title || teacher_activity || learner_activity, char(13) || char(10)) = 0
  AND (instr(title, char(13)) > 0 OR instr(teacher_activity, char(13)) > 0 OR instr(learner_activity, char(13)) > 0);

CREATE TRIGGER lesson_version_steps_immutable_update
BEFORE UPDATE ON lesson_version_steps
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson version steps are immutable');
END;
