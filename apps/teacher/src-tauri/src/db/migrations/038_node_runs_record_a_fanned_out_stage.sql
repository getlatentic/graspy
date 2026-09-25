-- Let a node run record a stage that writes one item per call.
--
-- A stage whose input is the whole lesson cannot fit one call once the lesson
-- is large, so the assessment stage now runs once per source record. Its node
-- kind is 'model-per-item', which the CHECK from migration 021 refuses.
--
-- SQLite cannot alter a CHECK, so the table is rebuilt. Every column, index and
-- foreign key is carried across unchanged; only the list of accepted kinds
-- grows.
PRAGMA foreign_keys = OFF;

CREATE TABLE generation_node_runs_rebuilt (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('deterministic', 'model', 'model-per-item')),
    module_id TEXT NOT NULL,
    module_version TEXT NOT NULL,
    output_contract_id TEXT NOT NULL,
    output_contract_version TEXT NOT NULL,
    signature_id TEXT,
    signature_version TEXT,
    schema_sha256 TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'interrupted', 'completed', 'failed', 'cancelled')
    ),
    input_json TEXT,
    input_sha256 TEXT CHECK (input_sha256 IS NULL OR length(input_sha256) = 64),
    output_json TEXT,
    output_sha256 TEXT CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
    validation_result_json TEXT,
    repair_count INTEGER NOT NULL DEFAULT 0 CHECK (repair_count >= 0),
    diagnostics_json TEXT NOT NULL DEFAULT '[]',
    started_at_ms INTEGER,
    completed_at_ms INTEGER,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    UNIQUE (run_id, node_id),
    FOREIGN KEY (run_id) REFERENCES generation_program_runs(id) ON DELETE RESTRICT
);

INSERT INTO generation_node_runs_rebuilt SELECT * FROM generation_node_runs;

DROP TABLE generation_node_runs;

ALTER TABLE generation_node_runs_rebuilt RENAME TO generation_node_runs;

-- Rebuilding drops the table's triggers with it. These three are what make a
-- finished node's trace a record rather than working state, and losing them
-- silently is the fault a rebuild invites: the table would still look right and
-- would no longer refuse to be rewritten.
CREATE TRIGGER generation_completed_nodes_immutable
BEFORE UPDATE ON generation_node_runs
WHEN OLD.status = 'completed'
BEGIN
    SELECT RAISE(ABORT, 'completed generation nodes are immutable');
END;

CREATE TRIGGER generation_terminal_nodes_immutable
BEFORE UPDATE ON generation_node_runs
WHEN OLD.status IN ('failed', 'cancelled')
BEGIN
    SELECT RAISE(ABORT, 'finished generation nodes are immutable');
END;

CREATE TRIGGER generation_nodes_immutable_delete
BEFORE DELETE ON generation_node_runs
BEGIN
    SELECT RAISE(ABORT, 'generation node traces are immutable');
END;

PRAGMA foreign_keys = ON;
