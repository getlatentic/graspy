ALTER TABLE tutoring_turns
    ADD COLUMN exercise_json TEXT CHECK (exercise_json IS NULL OR json_valid(exercise_json));

ALTER TABLE tutoring_turns
    ADD COLUMN result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json));
