ALTER TABLE tutoring_turns
    ADD COLUMN spoken_language TEXT CHECK (spoken_language IS NULL OR spoken_language IN ('en', 'yo', 'pcm'));

ALTER TABLE tutoring_turns
    ADD COLUMN language_evidence_json TEXT CHECK (language_evidence_json IS NULL OR json_valid(language_evidence_json));
