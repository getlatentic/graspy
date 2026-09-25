use std::{collections::BTreeMap, time::SystemTime};

use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use crate::db::Database;

use super::domain::{
    bounded_diagnostics, digest_json, ProgramNodeKind, RuntimeFault, RuntimeFaultKind,
    ValidatedProgram, ValidationReport,
};

const RESUME_INCOMPATIBLE: &str = "generation-resume-incompatible";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunStatus {
    Queued,
    Running,
    Interrupted,
    Completed,
    Failed,
    Cancelled,
}

impl RunStatus {
    fn parse(value: &str) -> Result<Self, RuntimeFault> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "interrupted" => Ok(Self::Interrupted),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err(persistence_fault(format!(
                "The stored generation run has unsupported status {value}."
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunCheckpoint {
    pub run_id: String,
    pub status: RunStatus,
    pub input: Value,
    pub completed_outputs: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvocationTrace {
    pub invocation_id: String,
    pub attempt_ordinal: u8,
}

pub struct InvocationStart<'a> {
    pub run_id: &'a str,
    pub node_id: &'a str,
    pub repair_ordinal: u8,
    pub invocation_kind: &'a str,
    pub signature_id: &'a str,
    pub signature_version: &'a str,
    pub model_identity: &'a str,
    pub prompt_sha256: &'a str,
    pub schema_sha256: &'a str,
    pub input: &'a Value,
}

pub struct InvocationFinish<'a> {
    pub invocation_id: &'a str,
    pub status: &'a str,
    pub output_text: Option<&'a str>,
    pub validation: Option<&'a ValidationReport>,
    pub diagnostics: Vec<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelNodeCheckpoint {
    pub repair_count: u8,
    pub invocation: Option<ModelInvocationCheckpoint>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ModelInvocationCheckpoint {
    Interrupted {
        invocation_kind: String,
        repair_ordinal: u8,
        input: Value,
    },
    Completed {
        candidate: Value,
        validation: ValidationReport,
    },
    Rejected {
        invocation_kind: String,
        repair_ordinal: u8,
        candidate: Value,
        validation: ValidationReport,
        failure_kind: RuntimeFaultKind,
    },
    Failed(RuntimeFault),
}

/// Where a run has reached, for whoever is waiting on it.
///
/// Node ids are program vocabulary and mean nothing to a teacher, so this
/// reports them as they are and leaves the wording to whichever feature owns
/// the program. The runtime stays generic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeProgress {
    pub node_id: String,
    pub status: String,
}

/// The nodes of the run a caller started, in program order.
///
/// Every node is written as pending when the run is created, so this reports
/// the whole shape of the work from the first moment rather than revealing it
/// one step at a time. An unknown handle has no run and reports nothing.
pub fn load_progress(
    database: &Database,
    correlation_id: &str,
) -> Result<Vec<NodeProgress>, RuntimeFault> {
    database
        .with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT generation_node_runs.node_id, generation_node_runs.status
                 FROM generation_node_runs
                 JOIN generation_program_runs
                   ON generation_program_runs.id = generation_node_runs.run_id
                 WHERE generation_program_runs.correlation_id = ?1
                 ORDER BY generation_program_runs.created_at DESC,
                          generation_node_runs.rowid",
            )?;
            let rows = statement
                .query_map(params![correlation_id], |row| {
                    Ok(NodeProgress {
                        node_id: row.get(0)?,
                        status: row.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok::<_, rusqlite::Error>(rows)
        })
        .map_err(persistence_fault)
}

/// The most recent interrupted run registered under this handle, if any —
/// how a resumed task finds the work it was cut off from.
pub fn find_interrupted_run(
    database: &Database,
    correlation_id: &str,
) -> Result<Option<String>, RuntimeFault> {
    database
        .with_connection(|connection| {
            connection
                .query_row(
                    "SELECT id FROM generation_program_runs
                     WHERE correlation_id = ?1 AND status = 'interrupted'
                     ORDER BY created_at DESC
                     LIMIT 1",
                    params![correlation_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
        })
        .map_err(persistence_fault)
}

pub fn create_run(
    database: &Database,
    program: &ValidatedProgram,
    input: &Value,
    model_identity: &str,
    correlation_id: Option<&str>,
) -> Result<RunCheckpoint, RuntimeFault> {
    if model_identity.trim().is_empty() {
        return Err(RuntimeFault::new(
            RuntimeFaultKind::Registration,
            vec!["A generation run requires a stable model identity.".to_owned()],
        ));
    }
    let run_id = Uuid::new_v4().to_string();
    let input_json = serialize(input)?;
    let input_sha256 = digest_json(input);
    database
        .with_connection_mut(|connection| {
            let transaction = connection.transaction()?;
            transaction.execute(
                "INSERT INTO generation_program_runs (
                    id, program_id, program_version, program_digest, model_identity,
                    input_json, input_sha256, status, correlation_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8)",
                params![
                    run_id,
                    program.definition().id,
                    program.definition().version,
                    program.digest(),
                    model_identity,
                    input_json,
                    input_sha256,
                    correlation_id,
                ],
            )?;
            for node in program.ordered_nodes() {
                let (signature_id, signature_version, schema_sha256) = match &node.kind {
                    ProgramNodeKind::Deterministic { .. } => (None, None, None),
                    ProgramNodeKind::ModelAuthored { signature, .. } => (
                        Some(signature.id.as_str()),
                        Some(signature.version.as_str()),
                        Some(signature.schema_sha256()),
                    ),
                    ProgramNodeKind::ModelAuthoredPerItem { signature, .. } => (
                        Some(signature.id.as_str()),
                        Some(signature.version.as_str()),
                        Some(signature.schema_sha256()),
                    ),
                };
                transaction.execute(
                    "INSERT INTO generation_node_runs (
                        id, run_id, node_id, node_kind, module_id, module_version,
                        output_contract_id, output_contract_version, signature_id,
                        signature_version, schema_sha256, status
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending')",
                    params![
                        Uuid::new_v4().to_string(),
                        run_id,
                        node.id,
                        node.kind_name(),
                        node.module_id,
                        node.module_version,
                        node.output_contract.id,
                        node.output_contract.version,
                        signature_id,
                        signature_version,
                        schema_sha256,
                    ],
                )?;
            }
            transaction.commit()
        })
        .map_err(persistence_fault)?;

    Ok(RunCheckpoint {
        run_id,
        status: RunStatus::Queued,
        input: input.clone(),
        completed_outputs: BTreeMap::new(),
    })
}

pub fn load_interrupted_run(
    database: &Database,
    run_id: &str,
    program: &ValidatedProgram,
    input: &Value,
    model_identity: &str,
) -> Result<RunCheckpoint, RuntimeFault> {
    database
        .with_connection(|connection| {
            let stored = connection
                .query_row(
                    "SELECT program_id, program_version, program_digest, model_identity,
                            input_json, input_sha256, status
                     FROM generation_program_runs WHERE id = ?1",
                    [run_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, String>(5)?,
                            row.get::<_, String>(6)?,
                        ))
                    },
                )
                .optional()?
                .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

            let expected_input_digest = digest_json(input);
            if stored.0 != program.definition().id
                || stored.1 != program.definition().version
                || stored.2 != program.digest()
                || stored.3 != model_identity
                || stored.5 != expected_input_digest
            {
                return Err(rusqlite::Error::InvalidParameterName(
                    RESUME_INCOMPATIBLE.to_owned(),
                ));
            }
            let status = RunStatus::parse(&stored.6).map_err(as_sql_error)?;
            if status != RunStatus::Interrupted {
                return Err(rusqlite::Error::InvalidParameterName(
                    RESUME_INCOMPATIBLE.to_owned(),
                ));
            }
            let stored_input: Value = serde_json::from_str(&stored.4)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
            let completed_outputs = load_completed_outputs(connection, run_id, program)?;
            Ok(RunCheckpoint {
                run_id: run_id.to_owned(),
                status,
                input: stored_input,
                completed_outputs,
            })
        })
        .map_err(|error| {
            if error.contains(RESUME_INCOMPATIBLE) {
                RuntimeFault::new(
                    RuntimeFaultKind::Registration,
                    vec![
                        "The interrupted run cannot resume because its program, input, model, or state has changed."
                            .to_owned(),
                    ],
                )
            } else {
                persistence_fault(error)
            }
        })
}

pub fn recover_interrupted_runs(database: &Database) -> Result<usize, RuntimeFault> {
    database
        .with_connection_mut(|connection| -> rusqlite::Result<usize> {
            let transaction = connection.transaction()?;
            transaction.execute_batch(
                "UPDATE generation_model_invocations SET status = 'interrupted',
                    completed_at_ms = CAST(unixepoch('subsec') * 1000 AS INTEGER),
                    duration_ms = MAX(
                        0,
                        CAST(unixepoch('subsec') * 1000 AS INTEGER) - started_at_ms
                    )
                 WHERE status = 'running';
                 UPDATE generation_node_runs SET status = 'interrupted'
                 WHERE status = 'running';
                 UPDATE generation_evaluation_runs SET status = 'interrupted',
                    completed_at_ms = CAST(unixepoch('subsec') * 1000 AS INTEGER),
                    diagnostics_json = '[]'
                 WHERE status = 'running';
                 UPDATE generation_program_runs SET status = 'interrupted'
                 WHERE status IN ('queued', 'running');",
            )?;
            let recovered = transaction.changes() as usize;
            transaction.commit()?;
            Ok(recovered)
        })
        .map_err(persistence_fault)
}

pub fn mark_run_running(database: &Database, run_id: &str) -> Result<(), RuntimeFault> {
    update_exactly_one(
        database,
        "UPDATE generation_program_runs
         SET status = 'running', started_at_ms = COALESCE(started_at_ms, ?1)
         WHERE id = ?2 AND status IN ('queued', 'interrupted')",
        params![now_ms(), run_id],
        "The generation run is not available to start.",
    )
}

pub fn begin_node(
    database: &Database,
    run_id: &str,
    node_id: &str,
    input: &Value,
) -> Result<(), RuntimeFault> {
    let input_json = serialize(input)?;
    let input_sha256 = digest_json(input);
    update_exactly_one(
        database,
        "UPDATE generation_node_runs
         SET status = 'running', input_json = ?1, input_sha256 = ?2,
             started_at_ms = ?3, completed_at_ms = NULL, duration_ms = NULL
         WHERE run_id = ?4 AND node_id = ?5 AND status IN ('pending', 'interrupted')",
        params![input_json, input_sha256, now_ms(), run_id, node_id],
        "The generation node is not available to start.",
    )
}

pub fn complete_node(
    database: &Database,
    run_id: &str,
    node_id: &str,
    output: &Value,
    validation: &ValidationReport,
    repair_count: u8,
) -> Result<(), RuntimeFault> {
    let output_json = serialize(output)?;
    let output_sha256 = digest_json(output);
    let validation_json = serialize(validation)?;
    update_exactly_one(
        database,
        "UPDATE generation_node_runs
         SET status = 'completed', output_json = ?1, output_sha256 = ?2,
             validation_result_json = ?3, repair_count = ?4,
             completed_at_ms = ?5, duration_ms = MAX(0, ?5 - started_at_ms)
         WHERE run_id = ?6 AND node_id = ?7 AND status = 'running'",
        params![
            output_json,
            output_sha256,
            validation_json,
            repair_count,
            now_ms(),
            run_id,
            node_id
        ],
        "The generation node is not running.",
    )
}

pub fn begin_invocation(
    database: &Database,
    start: InvocationStart<'_>,
) -> Result<InvocationTrace, RuntimeFault> {
    let invocation_id = Uuid::new_v4().to_string();
    let input_json = serialize(start.input)?;
    let input_sha256 = digest_json(start.input);
    database
        .with_connection_mut(|connection| -> rusqlite::Result<u8> {
            let transaction = connection.transaction()?;
            let node_run_id = transaction.query_row(
                "SELECT id FROM generation_node_runs
                 WHERE run_id = ?1 AND node_id = ?2 AND status = 'running'",
                params![start.run_id, start.node_id],
                |row| row.get::<_, String>(0),
            )?;
            let previous_ordinal = transaction.query_row(
                "SELECT COALESCE(MAX(attempt_ordinal), 0)
                 FROM generation_model_invocations WHERE node_run_id = ?1",
                [&node_run_id],
                |row| row.get::<_, i64>(0),
            )?;
            let attempt_ordinal = u8::try_from(previous_ordinal + 1)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
            transaction.execute(
                "INSERT INTO generation_model_invocations (
                    id, node_run_id, attempt_ordinal, repair_ordinal, invocation_kind, signature_id,
                    signature_version, model_identity, prompt_sha256, schema_sha256,
                    input_json, input_sha256, status, started_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'running', ?13)",
                params![
                    invocation_id,
                    node_run_id,
                    attempt_ordinal,
                    start.repair_ordinal,
                    start.invocation_kind,
                    start.signature_id,
                    start.signature_version,
                    start.model_identity,
                    start.prompt_sha256,
                    start.schema_sha256,
                    input_json,
                    input_sha256,
                    now_ms(),
                ],
            )?;
            if start.repair_ordinal > 0 {
                transaction.execute(
                    "UPDATE generation_node_runs SET repair_count = ?1
                     WHERE id = ?2 AND repair_count < ?1",
                    params![start.repair_ordinal, node_run_id],
                )?;
            }
            transaction.commit()?;
            Ok(attempt_ordinal)
        })
        .map_err(persistence_fault)
        .map(|attempt_ordinal| InvocationTrace {
            invocation_id,
            attempt_ordinal,
        })
}

pub fn load_model_node_checkpoint(
    database: &Database,
    run_id: &str,
    node_id: &str,
) -> Result<ModelNodeCheckpoint, RuntimeFault> {
    type StoredInvocation = (
        String,
        u8,
        String,
        String,
        Option<String>,
        Option<String>,
        String,
    );
    let (repair_count, stored) = database
        .with_connection(
            |connection| -> rusqlite::Result<(u8, Option<StoredInvocation>)> {
                let (node_run_id, repair_count) = connection.query_row(
                    "SELECT id, repair_count FROM generation_node_runs
                     WHERE run_id = ?1 AND node_id = ?2 AND status = 'running'",
                    params![run_id, node_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, u8>(1)?)),
                )?;
                let invocation = connection
                    .query_row(
                        "SELECT status, repair_ordinal, invocation_kind, input_json, output_text,
                                validation_result_json, diagnostics_json
                         FROM generation_model_invocations
                         WHERE node_run_id = ?1 ORDER BY attempt_ordinal DESC LIMIT 1",
                        [&node_run_id],
                        |row| {
                            Ok((
                                row.get(0)?,
                                row.get(1)?,
                                row.get(2)?,
                                row.get(3)?,
                                row.get(4)?,
                                row.get(5)?,
                                row.get(6)?,
                            ))
                        },
                    )
                    .optional()?;
                Ok((repair_count, invocation))
            },
        )
        .map_err(persistence_fault)?;
    let invocation = stored.map(parse_model_invocation_checkpoint).transpose()?;
    Ok(ModelNodeCheckpoint {
        repair_count,
        invocation,
    })
}

fn parse_model_invocation_checkpoint(
    stored: (
        String,
        u8,
        String,
        String,
        Option<String>,
        Option<String>,
        String,
    ),
) -> Result<ModelInvocationCheckpoint, RuntimeFault> {
    let (
        status,
        repair_ordinal,
        invocation_kind,
        input_json,
        output_text,
        validation_json,
        diagnostics_json,
    ) = stored;
    let input = serde_json::from_str(&input_json).map_err(persistence_fault)?;
    let diagnostics =
        serde_json::from_str::<Vec<String>>(&diagnostics_json).map_err(persistence_fault)?;
    match status.as_str() {
        "interrupted" => Ok(ModelInvocationCheckpoint::Interrupted {
            invocation_kind,
            repair_ordinal,
            input,
        }),
        "completed" => Ok(ModelInvocationCheckpoint::Completed {
            candidate: parse_stored_candidate(output_text)?,
            validation: parse_stored_validation(validation_json)?,
        }),
        "schema_rejected" | "validation_rejected" => Ok(ModelInvocationCheckpoint::Rejected {
            invocation_kind,
            repair_ordinal,
            candidate: parse_stored_candidate(output_text)?,
            validation: parse_stored_validation(validation_json)?,
            failure_kind: if status == "schema_rejected" {
                RuntimeFaultKind::Schema
            } else {
                RuntimeFaultKind::Validation
            },
        }),
        "transport_failed" => Ok(ModelInvocationCheckpoint::Failed(RuntimeFault::new(
            RuntimeFaultKind::Transport,
            diagnostics,
        ))),
        "timed_out" => Ok(ModelInvocationCheckpoint::Failed(RuntimeFault::new(
            RuntimeFaultKind::Timeout,
            diagnostics,
        ))),
        "cancelled" => Ok(ModelInvocationCheckpoint::Failed(RuntimeFault::new(
            RuntimeFaultKind::Cancelled,
            diagnostics,
        ))),
        other => Err(persistence_fault(format!(
            "The stored model invocation has unsupported recovery status {other}."
        ))),
    }
}

fn parse_stored_candidate(output_text: Option<String>) -> Result<Value, RuntimeFault> {
    let output_text = output_text
        .ok_or_else(|| persistence_fault("A finished model invocation has no stored output."))?;
    Ok(serde_json::from_str(&output_text).unwrap_or(Value::String(output_text)))
}

fn parse_stored_validation(
    validation_json: Option<String>,
) -> Result<ValidationReport, RuntimeFault> {
    serde_json::from_str(
        validation_json
            .as_deref()
            .ok_or_else(|| persistence_fault("A validated invocation has no validation trace."))?,
    )
    .map_err(persistence_fault)
}

pub fn finish_invocation(
    database: &Database,
    finish: InvocationFinish<'_>,
) -> Result<(), RuntimeFault> {
    let output_sha256 = finish
        .output_text
        .map(|value| digest_json(&Value::String(value.to_owned())));
    let validation_json = finish.validation.map(serialize).transpose()?;
    let diagnostics_json = serialize(&bounded_diagnostics(finish.diagnostics))?;
    let input_tokens = finish
        .input_tokens
        .map(|value| i64::try_from(value).unwrap_or(i64::MAX));
    let output_tokens = finish
        .output_tokens
        .map(|value| i64::try_from(value).unwrap_or(i64::MAX));
    update_exactly_one(
        database,
        "UPDATE generation_model_invocations
         SET status = ?1, output_text = ?2, output_sha256 = ?3,
             validation_result_json = ?4, diagnostics_json = ?5,
             completed_at_ms = ?6, duration_ms = MAX(0, ?6 - started_at_ms),
             input_tokens = ?7, output_tokens = ?8
         WHERE id = ?9 AND status = 'running'",
        params![
            finish.status,
            finish.output_text,
            output_sha256,
            validation_json,
            diagnostics_json,
            now_ms(),
            input_tokens,
            output_tokens,
            finish.invocation_id,
        ],
        "The model invocation is not running.",
    )
}

pub fn complete_run(database: &Database, run_id: &str) -> Result<(), RuntimeFault> {
    update_exactly_one(
        database,
        "UPDATE generation_program_runs SET status = 'completed', completed_at_ms = ?1
         WHERE id = ?2 AND status = 'running' AND NOT EXISTS (
            SELECT 1 FROM generation_node_runs
            WHERE run_id = ?2 AND status <> 'completed'
         )",
        params![now_ms(), run_id],
        "The generation run still has unfinished nodes.",
    )
}

pub fn fail_active_work(
    database: &Database,
    run_id: &str,
    node_id: Option<&str>,
    fault: &RuntimeFault,
) -> Result<(), RuntimeFault> {
    let terminal_status = if fault.kind == RuntimeFaultKind::Cancelled {
        "cancelled"
    } else {
        "failed"
    };
    let diagnostics = serialize(&fault.diagnostics)?;
    database
        .with_connection_mut(|connection| {
            let transaction = connection.transaction()?;
            if let Some(node_id) = node_id {
                transaction.execute(
                    "UPDATE generation_node_runs SET status = ?1, diagnostics_json = ?2,
                        completed_at_ms = ?3, duration_ms = MAX(0, ?3 - started_at_ms)
                     WHERE run_id = ?4 AND node_id = ?5 AND status = 'running'",
                    params![terminal_status, diagnostics, now_ms(), run_id, node_id],
                )?;
            }
            transaction.execute(
                "UPDATE generation_program_runs SET status = ?1, failure_kind = ?2,
                    diagnostics_json = ?3, completed_at_ms = ?4
                 WHERE id = ?5 AND status = 'running'",
                params![
                    terminal_status,
                    fault.kind.as_str(),
                    diagnostics,
                    now_ms(),
                    run_id
                ],
            )?;
            transaction.commit()
        })
        .map_err(persistence_fault)
}

fn load_completed_outputs(
    connection: &rusqlite::Connection,
    run_id: &str,
    program: &ValidatedProgram,
) -> rusqlite::Result<BTreeMap<String, Value>> {
    let mut outputs = BTreeMap::new();
    for node in program.ordered_nodes() {
        let stored = connection
            .query_row(
                "SELECT output_json, output_sha256 FROM generation_node_runs
                 WHERE run_id = ?1 AND node_id = ?2 AND status = 'completed'",
                params![run_id, node.id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((output_json, output_sha256)) = stored {
            let output: Value = serde_json::from_str(&output_json)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
            if digest_json(&output) != output_sha256 {
                return Err(rusqlite::Error::InvalidQuery);
            }
            outputs.insert(node.output_key.clone(), output);
        }
    }
    Ok(outputs)
}

fn update_exactly_one(
    database: &Database,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
    unavailable_message: &str,
) -> Result<(), RuntimeFault> {
    let changed = database
        .with_connection(|connection| connection.execute(sql, params))
        .map_err(persistence_fault)?;
    if changed == 1 {
        Ok(())
    } else {
        Err(persistence_fault(unavailable_message))
    }
}

fn serialize(value: &impl serde::Serialize) -> Result<String, RuntimeFault> {
    serde_json::to_string(value).map_err(persistence_fault)
}

fn persistence_fault(error: impl std::fmt::Display) -> RuntimeFault {
    RuntimeFault::new(RuntimeFaultKind::Persistence, vec![error.to_string()])
}

fn as_sql_error(error: RuntimeFault) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}

fn now_ms() -> i64 {
    SystemTime::UNIX_EPOCH
        .elapsed()
        .expect("system time is after Unix epoch")
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use crate::{
        db::Database,
        generation_program::domain::{
            DataContract, GenerationProgram, ProgramNode, ProgramNodeKind, RuntimeFault,
            ValidationReport,
        },
    };

    use super::*;

    fn build_input(root: &Value, _: &BTreeMap<String, Value>) -> Result<Value, RuntimeFault> {
        Ok(root.clone())
    }

    fn deterministic(input: &Value) -> Result<Value, RuntimeFault> {
        Ok(json!({"prepared": input["topic"]}))
    }

    fn program(version: &str) -> ValidatedProgram {
        let output_contract = DataContract::new("prepared-input", "1");
        GenerationProgram {
            id: "lesson-classwork".to_owned(),
            version: version.to_owned(),
            input_contract: DataContract::new("lesson-context", "1"),
            nodes: vec![ProgramNode {
                id: "prepare-context".to_owned(),
                module_id: "prepare-context".to_owned(),
                module_version: "1".to_owned(),
                output_key: "preparedContext".to_owned(),
                output_contract,
                dependencies: vec![],
                build_input,
                kind: ProgramNodeKind::Deterministic {
                    execute: deterministic,
                },
            }],
        }
        .validate()
        .expect("valid program")
    }

    #[test]
    fn shows_a_waiting_caller_the_whole_run_before_it_finishes() {
        let database = Database::in_memory();
        let program = program("1.0.0");
        let input = json!({"topic": "Fractions"});

        let checkpoint =
            create_run(&database, &program, &input, "model-a", Some("request-1")).expect("run");
        mark_run_running(&database, &checkpoint.run_id).expect("running run");
        begin_node(&database, &checkpoint.run_id, "prepare-context", &input).expect("first node");

        let progress = load_progress(&database, "request-1").expect("progress");

        // Every node is reported from the start, so the work has a known shape
        // rather than appearing one step at a time.
        assert_eq!(progress.len(), program.ordered_nodes().count());
        assert_eq!(progress[0].node_id, "prepare-context");
        assert_eq!(progress[0].status, "running");
        assert!(
            progress[1..].iter().all(|node| node.status == "pending"),
            "work not yet started is pending: {progress:?}"
        );
    }

    #[test]
    fn reports_nothing_for_a_handle_that_started_no_run() {
        let database = Database::in_memory();

        assert_eq!(
            load_progress(&database, "never-asked").expect("progress"),
            vec![]
        );
    }

    #[test]
    fn creates_versioned_run_and_node_records_atomically() {
        let database = Database::in_memory();
        let program = program("1.0.0");
        let input = json!({"topic": "Fractions"});

        let checkpoint = create_run(&database, &program, &input, "model-a", None).expect("run");

        let stored = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT r.program_digest, r.input_sha256, n.module_version, n.status
                     FROM generation_program_runs r
                     JOIN generation_node_runs n ON n.run_id = r.id
                     WHERE r.id = ?1",
                    [&checkpoint.run_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
            })
            .expect("stored run");
        assert_eq!(stored.0, program.digest());
        assert_eq!(stored.1, digest_json(&input));
        assert_eq!(stored.2, "1");
        assert_eq!(stored.3, "pending");
    }

    #[test]
    fn recovers_running_work_and_loads_only_verified_completed_outputs() {
        let database = Database::in_memory();
        let current_program = program("1.0.0");
        let input = json!({"topic": "Fractions"});
        let checkpoint =
            create_run(&database, &current_program, &input, "model-a", None).expect("run");
        mark_run_running(&database, &checkpoint.run_id).expect("start run");
        begin_node(&database, &checkpoint.run_id, "prepare-context", &input).expect("start node");
        complete_node(
            &database,
            &checkpoint.run_id,
            "prepare-context",
            &json!({"prepared": "Fractions"}),
            &ValidationReport::pass("deterministic-output"),
            0,
        )
        .expect("complete node");

        assert_eq!(recover_interrupted_runs(&database).expect("recover"), 1);
        let resumed = load_interrupted_run(
            &database,
            &checkpoint.run_id,
            &current_program,
            &input,
            "model-a",
        )
        .expect("resumable run");
        assert_eq!(
            resumed.completed_outputs["preparedContext"],
            json!({"prepared": "Fractions"})
        );
    }

    #[test]
    fn refuses_resume_after_program_input_or_model_identity_changes() {
        let database = Database::in_memory();
        let current_program = program("1.0.0");
        let input = json!({"topic": "Fractions"});
        let checkpoint =
            create_run(&database, &current_program, &input, "model-a", None).expect("run");
        mark_run_running(&database, &checkpoint.run_id).expect("start");
        recover_interrupted_runs(&database).expect("recover");

        for result in [
            load_interrupted_run(
                &database,
                &checkpoint.run_id,
                &program("2.0.0"),
                &input,
                "model-a",
            ),
            load_interrupted_run(
                &database,
                &checkpoint.run_id,
                &current_program,
                &json!({"topic": "Geometry"}),
                "model-a",
            ),
            load_interrupted_run(
                &database,
                &checkpoint.run_id,
                &current_program,
                &input,
                "model-b",
            ),
        ] {
            assert_eq!(
                result.expect_err("resume rejection").kind,
                RuntimeFaultKind::Registration
            );
        }
    }

    #[test]
    fn completed_checkpoints_are_immutable() {
        let database = Database::in_memory();
        let program = program("1.0.0");
        let input = json!({"topic": "Fractions"});
        let checkpoint = create_run(&database, &program, &input, "model-a", None).expect("run");
        mark_run_running(&database, &checkpoint.run_id).expect("start run");
        begin_node(&database, &checkpoint.run_id, "prepare-context", &input).expect("start node");
        complete_node(
            &database,
            &checkpoint.run_id,
            "prepare-context",
            &json!({"prepared": "Fractions"}),
            &ValidationReport::pass("deterministic-output"),
            0,
        )
        .expect("complete node");
        complete_run(&database, &checkpoint.run_id).expect("complete run");

        let mutation = database.with_connection(|connection| {
            connection.execute(
                "UPDATE generation_node_runs SET output_json = '{}' WHERE run_id = ?1",
                [&checkpoint.run_id],
            )
        });
        assert!(mutation
            .expect_err("immutable checkpoint")
            .contains("completed generation nodes are immutable"));
        let run_mutation = database.with_connection(|connection| {
            connection.execute(
                "UPDATE generation_program_runs SET diagnostics_json = '[\"changed\"]' WHERE id = ?1",
                [&checkpoint.run_id],
            )
        });
        assert!(run_mutation
            .expect_err("immutable run")
            .contains("finished generation runs are immutable"));
        let deletion = database.with_connection(|connection| {
            connection.execute(
                "DELETE FROM generation_node_runs WHERE run_id = ?1",
                [&checkpoint.run_id],
            )
        });
        assert!(deletion
            .expect_err("immutable node trace")
            .contains("generation node traces are immutable"));
    }
}
