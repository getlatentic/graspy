CREATE TABLE generation_program_runs (
    id TEXT PRIMARY KEY NOT NULL,
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64),
    model_identity TEXT NOT NULL,
    input_json TEXT NOT NULL,
    input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
    status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'interrupted', 'completed', 'failed', 'cancelled')
    ),
    failure_kind TEXT CHECK (
        failure_kind IS NULL OR failure_kind IN (
            'registration', 'deterministic', 'transport', 'timeout',
            'schema', 'validation', 'cancelled', 'persistence'
        )
    ),
    diagnostics_json TEXT NOT NULL DEFAULT '[]',
    started_at_ms INTEGER,
    completed_at_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX generation_program_runs_identity
ON generation_program_runs(program_id, program_version, input_sha256, model_identity);

CREATE TABLE generation_node_runs (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('deterministic', 'model')),
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

CREATE TABLE generation_model_invocations (
    id TEXT PRIMARY KEY NOT NULL,
    node_run_id TEXT NOT NULL,
    attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal > 0),
    repair_ordinal INTEGER NOT NULL CHECK (repair_ordinal >= 0),
    invocation_kind TEXT NOT NULL CHECK (invocation_kind IN ('initial', 'repair')),
    signature_id TEXT NOT NULL,
    signature_version TEXT NOT NULL,
    model_identity TEXT NOT NULL,
    prompt_sha256 TEXT NOT NULL CHECK (length(prompt_sha256) = 64),
    schema_sha256 TEXT NOT NULL CHECK (length(schema_sha256) = 64),
    input_json TEXT NOT NULL,
    input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
    output_text TEXT,
    output_sha256 TEXT CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
    status TEXT NOT NULL CHECK (
        status IN (
            'running', 'interrupted', 'completed', 'transport_failed', 'timed_out',
            'schema_rejected', 'validation_rejected', 'cancelled'
        )
    ),
    validation_result_json TEXT,
    diagnostics_json TEXT NOT NULL DEFAULT '[]',
    started_at_ms INTEGER NOT NULL,
    completed_at_ms INTEGER,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
    UNIQUE (node_run_id, attempt_ordinal),
    FOREIGN KEY (node_run_id) REFERENCES generation_node_runs(id) ON DELETE RESTRICT
);

CREATE TABLE generation_evaluation_runs (
    id TEXT PRIMARY KEY NOT NULL,
    suite_id TEXT NOT NULL,
    suite_version TEXT NOT NULL,
    dataset_sha256 TEXT NOT NULL CHECK (length(dataset_sha256) = 64),
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64),
    model_identity TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'interrupted', 'completed', 'failed')),
    aggregate_scores_json TEXT,
    diagnostics_json TEXT NOT NULL DEFAULT '[]',
    started_at_ms INTEGER NOT NULL,
    completed_at_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE generation_evaluation_cases (
    id TEXT PRIMARY KEY NOT NULL,
    evaluation_run_id TEXT NOT NULL,
    case_key TEXT NOT NULL,
    program_run_id TEXT NOT NULL,
    input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
    output_sha256 TEXT CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
    scores_json TEXT,
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    diagnostics_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE (evaluation_run_id, case_key),
    FOREIGN KEY (evaluation_run_id) REFERENCES generation_evaluation_runs(id) ON DELETE RESTRICT,
    FOREIGN KEY (program_run_id) REFERENCES generation_program_runs(id) ON DELETE RESTRICT
);

CREATE TABLE generation_program_promotions (
    id TEXT PRIMARY KEY NOT NULL,
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64),
    evaluation_run_id TEXT NOT NULL UNIQUE,
    thresholds_json TEXT NOT NULL,
    promoted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (program_id, program_version),
    FOREIGN KEY (evaluation_run_id) REFERENCES generation_evaluation_runs(id) ON DELETE RESTRICT
);

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

CREATE TRIGGER generation_terminal_runs_immutable
BEFORE UPDATE ON generation_program_runs
WHEN OLD.status IN ('completed', 'failed', 'cancelled')
BEGIN
    SELECT RAISE(ABORT, 'finished generation runs are immutable');
END;

CREATE TRIGGER generation_runs_immutable_delete
BEFORE DELETE ON generation_program_runs
BEGIN
    SELECT RAISE(ABORT, 'generation run traces are immutable');
END;

CREATE TRIGGER generation_completed_invocations_immutable
BEFORE UPDATE ON generation_model_invocations
WHEN OLD.status <> 'running'
BEGIN
    SELECT RAISE(ABORT, 'finished generation invocations are immutable');
END;

CREATE TRIGGER generation_invocations_immutable_delete
BEFORE DELETE ON generation_model_invocations
BEGIN
    SELECT RAISE(ABORT, 'generation invocation traces are immutable');
END;

CREATE TRIGGER generation_terminal_evaluations_immutable
BEFORE UPDATE ON generation_evaluation_runs
WHEN OLD.status IN ('completed', 'failed')
BEGIN
    SELECT RAISE(ABORT, 'finished generation evaluations are immutable');
END;

CREATE TRIGGER generation_evaluations_immutable_delete
BEFORE DELETE ON generation_evaluation_runs
BEGIN
    SELECT RAISE(ABORT, 'generation evaluation traces are immutable');
END;

CREATE TRIGGER generation_evaluation_cases_immutable_update
BEFORE UPDATE ON generation_evaluation_cases
BEGIN
    SELECT RAISE(ABORT, 'generation evaluation cases are immutable');
END;

CREATE TRIGGER generation_evaluation_cases_immutable_delete
BEFORE DELETE ON generation_evaluation_cases
BEGIN
    SELECT RAISE(ABORT, 'generation evaluation cases are immutable');
END;

CREATE TRIGGER generation_promotions_immutable_update
BEFORE UPDATE ON generation_program_promotions
BEGIN
    SELECT RAISE(ABORT, 'generation promotions are immutable');
END;

CREATE TRIGGER generation_promotions_immutable_delete
BEFORE DELETE ON generation_program_promotions
BEGIN
    SELECT RAISE(ABORT, 'generation promotions are immutable');
END;
