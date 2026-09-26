ALTER TABLE tutoring_turns ADD COLUMN next_move_json TEXT CHECK (next_move_json IS NULL OR json_valid(next_move_json));
