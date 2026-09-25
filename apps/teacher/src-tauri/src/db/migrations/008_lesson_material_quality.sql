ALTER TABLE lesson_material_sections ADD COLUMN quality_outcome TEXT
    CHECK (quality_outcome IN ('passed', 'repaired', 'scrubbed', 'failed'));
ALTER TABLE lesson_material_sections ADD COLUMN repair_attempted INTEGER
    CHECK (repair_attempted IN (0, 1));
ALTER TABLE lesson_material_sections ADD COLUMN scrubbed_claim_count INTEGER
    CHECK (scrubbed_claim_count >= 0);

CREATE TABLE lesson_material_block_learning_goals (
    block_id TEXT NOT NULL,
    learning_goal_number INTEGER NOT NULL CHECK (learning_goal_number > 0),
    PRIMARY KEY (block_id, learning_goal_number),
    FOREIGN KEY (block_id) REFERENCES lesson_material_blocks(id) ON DELETE CASCADE
);

CREATE TABLE lesson_material_block_sources (
    block_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (block_id, source_id),
    FOREIGN KEY (block_id) REFERENCES lesson_material_blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES lesson_material_sources(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_material_validation_passes (
    id TEXT PRIMARY KEY NOT NULL,
    section_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    stage TEXT NOT NULL CHECK (stage IN ('initial', 'repair', 'scrub')),
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    UNIQUE (section_id, attempt_number, sequence),
    FOREIGN KEY (section_id) REFERENCES lesson_material_sections(id) ON DELETE CASCADE
);

CREATE TABLE lesson_material_validation_checks (
    validation_pass_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    check_name TEXT NOT NULL CHECK (check_name IN (
        'content_structure',
        'learning_goal_alignment',
        'scope_compliance',
        'source_presence',
        'source_validity',
        'unsupported_source_claims'
    )),
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    details TEXT NOT NULL,
    PRIMARY KEY (validation_pass_id, sequence),
    UNIQUE (validation_pass_id, check_name),
    FOREIGN KEY (validation_pass_id) REFERENCES lesson_material_validation_passes(id) ON DELETE CASCADE
);
