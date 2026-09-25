use std::{collections::BTreeMap, time::Duration};

use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::db::Database;

use super::{
    domain::{
        validate_value_against_schema, CompletionFailure, CompletionFailureKind,
        GenerationSignature, ProgramNode, ProgramNodeKind, RuntimeFault, RuntimeFaultKind,
        StructuredCompletion, StructuredCompletionPort, StructuredCompletionRequest,
        ValidatedProgram, ValidationCheck, ValidationReport,
    },
    latex_repair::restore_mangled_escapes,
    repository::{
        begin_invocation, begin_node, complete_node, complete_run, create_run, fail_active_work,
        finish_invocation, load_interrupted_run, load_model_node_checkpoint, mark_run_running,
        InvocationFinish, InvocationStart, ModelInvocationCheckpoint, ModelNodeCheckpoint,
        RunCheckpoint,
    },
};

#[derive(Debug, Clone, PartialEq)]
pub struct GenerationResult {
    pub run_id: String,
    pub outputs: BTreeMap<String, Value>,
}

pub async fn execute_new<P: StructuredCompletionPort>(
    database: &Database,
    program: &ValidatedProgram,
    input: &Value,
    correlation_id: Option<&str>,
    completion_port: &P,
    cancellation: CancellationToken,
) -> Result<GenerationResult, RuntimeFault> {
    let model_identity = completion_port.model_identity();
    let checkpoint = create_run(database, program, input, model_identity, correlation_id)?;
    execute_checkpoint(
        database,
        program,
        checkpoint,
        model_identity,
        completion_port,
        cancellation,
    )
    .await
}

pub async fn resume_interrupted<P: StructuredCompletionPort>(
    database: &Database,
    run_id: &str,
    program: &ValidatedProgram,
    input: &Value,
    completion_port: &P,
    cancellation: CancellationToken,
) -> Result<GenerationResult, RuntimeFault> {
    let model_identity = completion_port.model_identity();
    let checkpoint = load_interrupted_run(database, run_id, program, input, model_identity)?;
    execute_checkpoint(
        database,
        program,
        checkpoint,
        model_identity,
        completion_port,
        cancellation,
    )
    .await
}

pub(crate) async fn execute_checkpoint<P: StructuredCompletionPort>(
    database: &Database,
    program: &ValidatedProgram,
    checkpoint: RunCheckpoint,
    model_identity: &str,
    completion_port: &P,
    cancellation: CancellationToken,
) -> Result<GenerationResult, RuntimeFault> {
    mark_run_running(database, &checkpoint.run_id)?;
    let mut outputs = checkpoint.completed_outputs;
    for node in program.ordered_nodes() {
        if outputs.contains_key(&node.output_key) {
            continue;
        }
        if cancellation.is_cancelled() {
            let fault = cancellation_fault();
            fail_active_work(database, &checkpoint.run_id, None, &fault)?;
            return Err(fault);
        }
        let node_input = match (node.build_input)(&checkpoint.input, &outputs) {
            Ok(input) => input,
            Err(fault) => {
                fail_active_work(database, &checkpoint.run_id, None, &fault)?;
                return Err(fault);
            }
        };
        begin_node(database, &checkpoint.run_id, &node.id, &node_input)?;
        let execution = execute_node(
            database,
            &checkpoint.run_id,
            node,
            &node_input,
            model_identity,
            completion_port,
            cancellation.clone(),
        )
        .await;
        match execution {
            Ok((output, validation, repair_count)) => {
                complete_node(
                    database,
                    &checkpoint.run_id,
                    &node.id,
                    &output,
                    &validation,
                    repair_count,
                )?;
                outputs.insert(node.output_key.clone(), output);
            }
            Err(fault) => {
                fail_active_work(database, &checkpoint.run_id, Some(&node.id), &fault)?;
                return Err(fault);
            }
        }
    }
    complete_run(database, &checkpoint.run_id)?;
    Ok(GenerationResult {
        run_id: checkpoint.run_id,
        outputs,
    })
}

async fn execute_node<P: StructuredCompletionPort>(
    database: &Database,
    run_id: &str,
    node: &ProgramNode,
    input: &Value,
    model_identity: &str,
    completion_port: &P,
    cancellation: CancellationToken,
) -> Result<(Value, ValidationReport, u8), RuntimeFault> {
    match &node.kind {
        ProgramNodeKind::Deterministic { execute } => {
            let output = execute(input)?;
            Ok((output, ValidationReport::pass("deterministic-module"), 0))
        }
        ProgramNodeKind::ModelAuthored {
            signature,
            repair_signature,
            repair_budget,
            decode,
            validate,
            build_output_schema,
            build_output_budget,
        } => {
            // Both shape the run's own signature: what the stage may write, and
            // how much of it. A stage writing one item per source record cannot
            // be held to a ceiling measured on a smaller lesson.
            let budget = match build_output_budget {
                None => None,
                Some(build) => Some(build(input)?),
            };
            let narrowed = match (build_output_schema, budget) {
                (None, None) => None,
                (build, budget) => Some(narrow_signature(
                    match build {
                        None => signature.output_schema.clone(),
                        Some(build) => build(input)?,
                    },
                    budget,
                    signature,
                    repair_signature.as_deref(),
                )),
            };
            let (signature, repair_signature) = match &narrowed {
                None => (signature.as_ref(), repair_signature.as_deref()),
                Some((signature, repair)) => (signature, repair.as_ref()),
            };
            let context = ModelNodeContext {
                database,
                run_id,
                node,
                model_identity,
                completion_port,
                cancellation,
                decode: *decode,
                validate: *validate,
            };
            execute_model_node(
                context,
                input,
                signature,
                repair_signature,
                *repair_budget,
                Resume::FromCheckpoint,
            )
            .await
        }
        ProgramNodeKind::ModelAuthoredPerItem {
            signature,
            repair_signature,
            repair_budget,
            decode,
            validate_item,
            validate,
            plan_items,
            collect,
        } => {
            // Each item is its own call, recorded as its own invocation under
            // this node — attempt ordinals are allocated per node run, so they
            // sit side by side. None of them resumes a checkpoint: see Resume.
            //
            // The cost of that is real and stated: a stage interrupted halfway
            // starts its items again rather than picking up. Twelve calls
            // repeated is a slower recovery than one, and it is what keeps the
            // twelve from collapsing into one another.
            let items = plan_items(input)?;
            let mut written = Vec::with_capacity(items.len());
            let mut repairs_spent = 0u8;
            for item in &items {
                let context = ModelNodeContext {
                    database,
                    run_id,
                    node,
                    model_identity,
                    completion_port,
                    cancellation: cancellation.clone(),
                    decode: *decode,
                    validate: *validate_item,
                };
                let (output, report, spent) = execute_model_node(
                    context,
                    item,
                    signature,
                    repair_signature.as_deref(),
                    *repair_budget,
                    Resume::Fresh,
                )
                .await?;
                repairs_spent = repairs_spent.saturating_add(spent);
                if !report.passed {
                    // One item refused is the stage refused. Reporting it here
                    // rather than at the end means the violations name the item
                    // that carries them.
                    return Ok((Value::Null, report, repairs_spent));
                }
                written.push(output);
            }
            let assembled = collect(input, written)?;
            // What only the whole can show — every learning goal covered, no
            // question written twice — is checked once the items are in.
            let report = validate(input, &assembled);
            Ok((assembled, report, repairs_spent))
        }
    }
}

/// A repair must be held to the same narrowed schema as the attempt it corrects,
/// or the correction is free to reintroduce the value that was rejected.
/// The signature this run will actually use: the stage's own, with the schema
/// and the writing budget the run's input calls for.
fn narrow_signature(
    output_schema: Value,
    max_output_tokens: Option<u32>,
    signature: &GenerationSignature,
    repair_signature: Option<&GenerationSignature>,
) -> (GenerationSignature, Option<GenerationSignature>) {
    let mut narrowed = signature.clone();
    narrowed.output_schema = output_schema.clone();
    if let Some(tokens) = max_output_tokens {
        narrowed.limits.max_output_tokens = tokens;
    }
    let repair = repair_signature.map(|repair| {
        let mut repair = repair.clone();
        repair.output_schema = output_schema;
        if let Some(tokens) = max_output_tokens {
            // A repair rewrites the same answer; holding it to a smaller budget
            // than the attempt it is fixing would fail it for length alone.
            repair.limits.max_output_tokens = tokens;
        }
        repair
    });
    (narrowed, repair)
}

/// Whether a call picks up where an interrupted one left off.
///
/// A node's own call resumes; one call of a fanned-out stage cannot, because the
/// checkpoint it would read belongs to the node rather than to the item.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Resume {
    FromCheckpoint,
    Fresh,
}

struct ModelNodeContext<'a, P> {
    database: &'a Database,
    run_id: &'a str,
    node: &'a ProgramNode,
    model_identity: &'a str,
    completion_port: &'a P,
    cancellation: CancellationToken,
    decode: fn(&Value) -> ValidationReport,
    validate: fn(&Value, &Value) -> ValidationReport,
}

/// The fewest-violation attempt a node has produced. A repair regenerates from
/// this rather than the last candidate, so an attempt that came out worse cannot
/// drag the next repair down with it; and a node that never passes fails with the
/// closest attempt it reached, not merely the final one.
struct BestAttempt {
    candidate: Value,
    failed_checks: Vec<ValidationCheck>,
    failure_kind: RuntimeFaultKind,
    violation_count: usize,
}

impl BestAttempt {
    fn keep_if_better(
        slot: &mut Option<Self>,
        candidate: &Value,
        validation: &ValidationReport,
        failure_kind: RuntimeFaultKind,
    ) {
        let failed_checks = validation.failed_checks();
        let violation_count = failed_checks
            .iter()
            .map(|check| check.details.len().max(1))
            .sum();
        let improves = slot
            .as_ref()
            .is_none_or(|best| violation_count < best.violation_count);
        if improves {
            *slot = Some(Self {
                candidate: candidate.clone(),
                failed_checks,
                failure_kind,
                violation_count,
            });
        }
    }

    fn repair_input(&self, original_input: &Value) -> Value {
        json!({
            "originalInput": original_input,
            "invalidCandidate": self.candidate,
            "failedChecks": self.failed_checks,
        })
    }

    fn into_fault(self) -> RuntimeFault {
        RuntimeFault::new(
            self.failure_kind,
            self.failed_checks
                .iter()
                .flat_map(|check| check.details.clone())
                .collect(),
        )
    }
}

async fn execute_model_node<P: StructuredCompletionPort>(
    context: ModelNodeContext<'_, P>,
    original_input: &Value,
    signature: &GenerationSignature,
    repair_signature: Option<&GenerationSignature>,
    repair_budget: u8,
    resume: Resume,
) -> Result<(Value, ValidationReport, u8), RuntimeFault> {
    let mut active_signature = signature;
    let mut active_input = original_input.clone();
    let checkpoint = match resume {
        Resume::FromCheckpoint => {
            load_model_node_checkpoint(context.database, context.run_id, &context.node.id)?
        }
        // A checkpoint is keyed by node, and a fanned-out stage has many calls
        // under one node. Loading it for the second item returns the first
        // item's finished invocation, and resuming that is how twelve records
        // once produced one call and eleven copies of its answer.
        Resume::Fresh => ModelNodeCheckpoint {
            repair_count: 0,
            invocation: None,
        },
    };
    let mut repair_count = checkpoint.repair_count;
    let mut best: Option<BestAttempt> = None;
    match checkpoint.invocation {
        None => {}
        Some(ModelInvocationCheckpoint::Interrupted {
            invocation_kind,
            repair_ordinal,
            input,
        }) => {
            if repair_ordinal != repair_count {
                return Err(RuntimeFault::new(
                    RuntimeFaultKind::Persistence,
                    vec![
                        "The interrupted model attempt has an inconsistent repair checkpoint."
                            .to_owned(),
                    ],
                ));
            }
            if invocation_kind == "repair" {
                active_signature = repair_signature.ok_or_else(|| {
                    RuntimeFault::new(
                        RuntimeFaultKind::Registration,
                        vec!["The interrupted node has no registered repair signature.".to_owned()],
                    )
                })?;
            }
            active_input = input;
        }
        Some(ModelInvocationCheckpoint::Completed {
            candidate,
            validation,
        }) => return Ok((candidate, validation, repair_count)),
        Some(ModelInvocationCheckpoint::Rejected {
            invocation_kind: _,
            repair_ordinal,
            candidate,
            validation,
            failure_kind,
        }) => {
            BestAttempt::keep_if_better(&mut best, &candidate, &validation, failure_kind);
            if repair_ordinal >= repair_budget {
                return Err(best
                    .expect("seeded from the rejected checkpoint")
                    .into_fault());
            }
            active_signature = repair_signature.ok_or_else(|| {
                RuntimeFault::new(
                    RuntimeFaultKind::Registration,
                    vec!["The model node has no registered repair signature.".to_owned()],
                )
            })?;
            repair_count = repair_ordinal + 1;
            active_input = best
                .as_ref()
                .expect("seeded from the rejected checkpoint")
                .repair_input(original_input);
        }
        Some(ModelInvocationCheckpoint::Failed(fault)) => return Err(fault),
    }
    loop {
        let invocation_kind = if repair_count == 0 {
            "initial"
        } else {
            "repair"
        };
        let mut request = completion_request(active_signature, active_input.clone(), repair_count);
        let prompt_sha256 = request.prompt_sha256();
        let schema_sha256 = active_signature.schema_sha256();
        let trace = begin_invocation(
            context.database,
            InvocationStart {
                run_id: context.run_id,
                node_id: &context.node.id,
                repair_ordinal: repair_count,
                invocation_kind,
                signature_id: &active_signature.id,
                signature_version: &active_signature.version,
                model_identity: context.model_identity,
                prompt_sha256: &prompt_sha256,
                schema_sha256: &schema_sha256,
                input: &active_input,
            },
        )?;
        request.invocation_id = trace.invocation_id.clone();

        let completion = await_completion(
            context.completion_port,
            request,
            context.cancellation.clone(),
            active_signature.limits.timeout_seconds,
        )
        .await;
        let completion = match completion {
            Ok(completion) => completion,
            Err(failure) => {
                let (status, kind) = completion_failure_state(failure.kind);
                finish_invocation(
                    context.database,
                    InvocationFinish {
                        invocation_id: &trace.invocation_id,
                        status,
                        output_text: None,
                        validation: None,
                        diagnostics: failure.diagnostics.clone(),
                        input_tokens: None,
                        output_tokens: None,
                    },
                )?;
                return Err(RuntimeFault::new(kind, failure.diagnostics));
            }
        };
        if completion.model_identity != context.model_identity {
            let diagnostics = vec![
                "The completion response came from a different model than the registered run."
                    .to_owned(),
            ];
            finish_invocation(
                context.database,
                InvocationFinish {
                    invocation_id: &trace.invocation_id,
                    status: "transport_failed",
                    output_text: Some(&completion.output_text),
                    validation: None,
                    diagnostics: diagnostics.clone(),
                    input_tokens: Some(completion.input_tokens),
                    output_tokens: Some(completion.output_tokens),
                },
            )?;
            return Err(RuntimeFault::new(RuntimeFaultKind::Transport, diagnostics));
        }

        let parsed = serde_json::from_str::<Value>(&completion.output_text);
        let (candidate, validation, failure_kind) = match parsed {
            Ok(mut candidate) => {
                // Every node's output passes here, so this is where LaTeX the
                // JSON parser swallowed is given back.
                restore_mangled_escapes(&mut candidate);
                let schema =
                    validate_value_against_schema(&candidate, &active_signature.output_schema);
                let validation = schema
                    .clone()
                    .combine((context.decode)(&candidate))
                    .combine((context.validate)(original_input, &candidate));
                let failure_kind = if !schema.passed {
                    RuntimeFaultKind::Schema
                } else {
                    RuntimeFaultKind::Validation
                };
                (candidate, validation, failure_kind)
            }
            Err(error) => (
                Value::String(completion.output_text.clone()),
                ValidationReport::new(vec![super::domain::ValidationCheck::fail(
                    "valid-json",
                    vec![error.to_string()],
                )]),
                RuntimeFaultKind::Schema,
            ),
        };
        if validation.passed {
            finish_invocation(
                context.database,
                InvocationFinish {
                    invocation_id: &trace.invocation_id,
                    status: "completed",
                    output_text: Some(&completion.output_text),
                    validation: Some(&validation),
                    diagnostics: vec![],
                    input_tokens: Some(completion.input_tokens),
                    output_tokens: Some(completion.output_tokens),
                },
            )?;
            return Ok((candidate, validation, repair_count));
        }

        let rejection_status = if failure_kind == RuntimeFaultKind::Schema {
            "schema_rejected"
        } else {
            "validation_rejected"
        };
        let failed_checks = validation.failed_checks();
        let diagnostics = failed_checks
            .iter()
            .flat_map(|check| check.details.clone())
            .collect::<Vec<_>>();
        finish_invocation(
            context.database,
            InvocationFinish {
                invocation_id: &trace.invocation_id,
                status: rejection_status,
                output_text: Some(&completion.output_text),
                validation: Some(&validation),
                diagnostics: diagnostics.clone(),
                input_tokens: Some(completion.input_tokens),
                output_tokens: Some(completion.output_tokens),
            },
        )?;

        BestAttempt::keep_if_better(&mut best, &candidate, &validation, failure_kind);
        if repair_count >= repair_budget {
            return Err(best.expect("a rejected attempt was recorded").into_fault());
        }
        let Some(repair) = repair_signature else {
            return Err(RuntimeFault::new(
                RuntimeFaultKind::Registration,
                vec!["The model node has no registered repair signature.".to_owned()],
            ));
        };
        active_input = best
            .as_ref()
            .expect("a rejected attempt was recorded")
            .repair_input(original_input);
        active_signature = repair;
        repair_count += 1;
    }
}

fn completion_request(
    signature: &GenerationSignature,
    input: Value,
    repair_count: u8,
) -> StructuredCompletionRequest {
    let mut limits = signature.limits.clone();
    // A repair pinned to the same sampling path is not a repair. Every stage
    // sampled at the signature's seed, so a rejected attempt was reproduced
    // byte for byte on each retry — three identical answers, three identical
    // rejections, and a repair budget that could never spend itself.
    limits.seed += u64::from(repair_count);
    StructuredCompletionRequest {
        invocation_id: String::new(),
        signature_id: signature.id.clone(),
        signature_version: signature.version.clone(),
        system_instructions: signature.system_instructions.clone(),
        task_instructions: signature.task_instructions.clone(),
        input,
        output_schema: signature.output_schema.clone(),
        limits,
        shown_page: None,
    }
}

async fn await_completion<P: StructuredCompletionPort>(
    port: &P,
    request: StructuredCompletionRequest,
    cancellation: CancellationToken,
    timeout_seconds: u64,
) -> Result<StructuredCompletion, CompletionFailure> {
    let invocation_cancellation = cancellation.child_token();
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => {
            invocation_cancellation.cancel();
            Err(CompletionFailure::new(
                CompletionFailureKind::Cancelled,
                vec!["Creation was cancelled.".to_owned()],
            ))
        }
        result = tokio::time::timeout(
            Duration::from_secs(timeout_seconds),
            port.complete(request, invocation_cancellation.clone()),
        ) => match result {
            Ok(result) => result,
            Err(_) => {
                invocation_cancellation.cancel();
                Err(CompletionFailure::new(
                    CompletionFailureKind::Timeout,
                    vec!["The model did not finish within the registered timeout.".to_owned()],
                ))
            }
        }
    }
}

fn completion_failure_state(kind: CompletionFailureKind) -> (&'static str, RuntimeFaultKind) {
    match kind {
        CompletionFailureKind::Cancelled => ("cancelled", RuntimeFaultKind::Cancelled),
        CompletionFailureKind::Timeout => ("timed_out", RuntimeFaultKind::Timeout),
        CompletionFailureKind::Transport => ("transport_failed", RuntimeFaultKind::Transport),
    }
}

fn cancellation_fault() -> RuntimeFault {
    RuntimeFault::new(
        RuntimeFaultKind::Cancelled,
        vec!["Creation was cancelled.".to_owned()],
    )
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{BTreeMap, VecDeque},
        sync::Mutex,
    };

    use serde_json::json;

    use crate::{
        db::Database,
        generation_program::{
            domain::{
                CompletionLimits, DataContract, GenerationProgram, GenerationSignature,
                NodeDependency, ProgramNode, ProgramNodeKind, StructuredCompletion,
                StructuredCompletionRequest, ValidationCheck,
            },
            repository::{
                begin_invocation, begin_node, complete_node, create_run, finish_invocation,
                mark_run_running, recover_interrupted_runs, InvocationFinish, InvocationStart,
                InvocationTrace, RunCheckpoint,
            },
        },
    };

    use super::*;

    struct ScriptedCompletionPort {
        responses: Mutex<VecDeque<Result<StructuredCompletion, CompletionFailure>>>,
        requests: Mutex<Vec<StructuredCompletionRequest>>,
    }

    impl ScriptedCompletionPort {
        fn new(responses: Vec<Result<StructuredCompletion, CompletionFailure>>) -> Self {
            Self {
                responses: Mutex::new(responses.into()),
                requests: Mutex::new(Vec::new()),
            }
        }

        fn requests(&self) -> Vec<StructuredCompletionRequest> {
            self.requests.lock().expect("requests").clone()
        }
    }

    impl StructuredCompletionPort for ScriptedCompletionPort {
        fn model_identity(&self) -> &str {
            "model-a"
        }

        async fn complete(
            &self,
            request: StructuredCompletionRequest,
            _: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            self.requests.lock().expect("requests").push(request);
            self.responses
                .lock()
                .expect("responses")
                .pop_front()
                .expect("scripted response")
        }
    }

    struct NeverCompletesPort;

    impl StructuredCompletionPort for NeverCompletesPort {
        fn model_identity(&self) -> &str {
            "model-a"
        }

        async fn complete(
            &self,
            _: StructuredCompletionRequest,
            _: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            std::future::pending().await
        }
    }

    fn root_input(root: &Value, _: &BTreeMap<String, Value>) -> Result<Value, RuntimeFault> {
        Ok(root.clone())
    }

    fn prepare_context(input: &Value) -> Result<Value, RuntimeFault> {
        Ok(json!({"topic": input["topic"].clone()}))
    }

    fn prepared_input(_: &Value, outputs: &BTreeMap<String, Value>) -> Result<Value, RuntimeFault> {
        outputs.get("preparedContext").cloned().ok_or_else(|| {
            RuntimeFault::new(
                RuntimeFaultKind::Deterministic,
                vec!["Prepared context is unavailable.".to_owned()],
            )
        })
    }

    fn decode(_: &Value) -> ValidationReport {
        ValidationReport::pass("classwork-decoder")
    }

    fn validate(input: &Value, candidate: &Value) -> ValidationReport {
        if input["topic"] == candidate["title"] {
            ValidationReport::pass("topic-alignment")
        } else {
            ValidationReport::new(vec![ValidationCheck::fail(
                "topic-alignment",
                vec!["The title must match the lesson topic.".to_owned()],
            )])
        }
    }

    /// Each 'x' in the title is one unresolved flaw, so a candidate's violation
    /// count is visible in its title — enough to rank attempts against each other.
    fn counting_validate(_: &Value, candidate: &Value) -> ValidationReport {
        let flaws = candidate["title"]
            .as_str()
            .unwrap_or_default()
            .chars()
            .filter(|character| *character == 'x')
            .count();
        if flaws == 0 {
            ValidationReport::pass("flaw-count")
        } else {
            ValidationReport::new(vec![ValidationCheck::fail(
                "flaw-count",
                (1..=flaws)
                    .map(|number| format!("resolve flaw {number}"))
                    .collect(),
            )])
        }
    }

    fn output_schema() -> Value {
        json!({
            "type": "object",
            "properties": {"title": {"type": "string"}},
            "required": ["title"],
            "additionalProperties": false
        })
    }

    fn signature(id: &str, input_contract: DataContract) -> GenerationSignature {
        GenerationSignature {
            id: id.to_owned(),
            version: "1.0.0".to_owned(),
            input_contract,
            output_contract: DataContract::new("classwork", "1"),
            system_instructions: "Write exact teacher-facing lesson material.".to_owned(),
            task_instructions: "Return the lesson title as structured data.".to_owned(),
            output_schema: output_schema(),
            validation_policy: "classwork-validation".to_owned(),
            limits: CompletionLimits {
                temperature: 0.2,
                seed: 7,
                max_output_tokens: 256,
                timeout_seconds: 1,
            },
        }
    }

    fn program() -> ValidatedProgram {
        build_program(validate, 1)
    }

    fn build_program(
        validate: fn(&Value, &Value) -> ValidationReport,
        repair_budget: u8,
    ) -> ValidatedProgram {
        let prepared_contract = DataContract::new("prepared-context", "1");
        let classwork_contract = DataContract::new("classwork", "1");
        GenerationProgram {
            id: "lesson-classwork".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: DataContract::new("lesson-context", "1"),
            nodes: vec![
                ProgramNode {
                    id: "prepare-context".to_owned(),
                    module_id: "prepare-context".to_owned(),
                    module_version: "1.0.0".to_owned(),
                    output_key: "preparedContext".to_owned(),
                    output_contract: prepared_contract.clone(),
                    dependencies: vec![],
                    build_input: root_input,
                    kind: ProgramNodeKind::Deterministic {
                        execute: prepare_context,
                    },
                },
                ProgramNode {
                    id: "write-classwork".to_owned(),
                    module_id: "write-classwork".to_owned(),
                    module_version: "1.0.0".to_owned(),
                    output_key: "classwork".to_owned(),
                    output_contract: classwork_contract,
                    dependencies: vec![NodeDependency {
                        node_id: "prepare-context".to_owned(),
                        contract: prepared_contract.clone(),
                    }],
                    build_input: prepared_input,
                    kind: ProgramNodeKind::ModelAuthored {
                        signature: Box::new(signature(
                            "write-classwork",
                            prepared_contract.clone(),
                        )),
                        repair_signature: Some(Box::new(signature(
                            "repair-classwork",
                            DataContract::new("repair-request", "1"),
                        ))),
                        repair_budget,
                        decode,
                        validate,
                        build_output_schema: None,
                        build_output_budget: None,
                    },
                },
            ],
        }
        .validate()
        .expect("program")
    }

    fn completion(output: Value) -> Result<StructuredCompletion, CompletionFailure> {
        Ok(StructuredCompletion {
            output_text: serde_json::to_string(&output).expect("output"),
            model_identity: "model-a".to_owned(),
            input_tokens: 20,
            output_tokens: 8,
        })
    }

    fn running_model_node(
        database: &Database,
    ) -> (ValidatedProgram, Value, RunCheckpoint, GenerationSignature) {
        let program = program();
        let input = json!({"topic": "Fractions"});
        let checkpoint = create_run(database, &program, &input, "model-a", None).expect("run");
        mark_run_running(database, &checkpoint.run_id).expect("start run");
        begin_node(database, &checkpoint.run_id, "prepare-context", &input)
            .expect("start deterministic node");
        let prepared = json!({"topic": "Fractions"});
        complete_node(
            database,
            &checkpoint.run_id,
            "prepare-context",
            &prepared,
            &ValidationReport::pass("deterministic-module"),
            0,
        )
        .expect("complete deterministic node");
        begin_node(database, &checkpoint.run_id, "write-classwork", &prepared)
            .expect("start model node");
        let signature = program
            .ordered_nodes()
            .find_map(|node| match &node.kind {
                ProgramNodeKind::ModelAuthored { signature, .. }
                | ProgramNodeKind::ModelAuthoredPerItem { signature, .. } => {
                    Some((**signature).clone())
                }
                ProgramNodeKind::Deterministic { .. } => None,
            })
            .expect("model signature");
        (program, input, checkpoint, signature)
    }

    fn start_test_invocation(
        database: &Database,
        run_id: &str,
        signature: &GenerationSignature,
        input: &Value,
        repair_ordinal: u8,
        invocation_kind: &str,
    ) -> InvocationTrace {
        let request = completion_request(signature, input.clone(), 0);
        begin_invocation(
            database,
            InvocationStart {
                run_id,
                node_id: "write-classwork",
                repair_ordinal,
                invocation_kind,
                signature_id: &signature.id,
                signature_version: &signature.version,
                model_identity: "model-a",
                prompt_sha256: &request.prompt_sha256(),
                schema_sha256: &signature.schema_sha256(),
                input,
            },
        )
        .expect("start invocation")
    }

    #[tokio::test]
    async fn executes_the_dag_and_repairs_only_with_exact_failed_checks() {
        let database = Database::in_memory();
        let port = ScriptedCompletionPort::new(vec![
            completion(json!({"title": "Wrong"})),
            completion(json!({"title": "Fractions"})),
        ]);

        let result = execute_new(
            &database,
            &program(),
            &json!({"topic": "Fractions"}),
            None,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("execution");

        assert_eq!(result.outputs["classwork"], json!({"title": "Fractions"}));
        let requests = port.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].signature_id, "write-classwork");
        assert_eq!(requests[1].signature_id, "repair-classwork");
        assert_eq!(
            requests[1].input["failedChecks"][0]["name"],
            "topic-alignment"
        );
        assert_eq!(
            requests[1].input["failedChecks"][0]["details"][0],
            "The title must match the lesson topic."
        );
        let trace = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT r.status, n.repair_count,
                            SUM(i.input_tokens), SUM(i.output_tokens)
                     FROM generation_program_runs r
                     JOIN generation_node_runs n ON n.run_id = r.id AND n.node_id = 'write-classwork'
                     JOIN generation_model_invocations i ON i.node_run_id = n.id
                     WHERE r.id = ?1 GROUP BY r.status, n.repair_count",
                    [&result.run_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, u8>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, i64>(3)?,
                        ))
                    },
                )
            })
            .expect("trace");
        assert_eq!(trace, ("completed".to_owned(), 1, 40, 16));
    }

    /// A stage that narrows its schema to the request is decoded against the
    /// narrowed schema, and so is the repair that follows it, so a correction
    /// cannot answer outside the bound the first attempt was held to.
    #[tokio::test]
    async fn a_narrowed_schema_reaches_both_the_attempt_and_its_repair() {
        let database = Database::in_memory();
        let port = ScriptedCompletionPort::new(vec![
            completion(json!({"title": "Wrong", "titleSequence": 1})),
            completion(json!({"title": "Fractions", "titleSequence": 1})),
        ]);
        let mut narrowing = program().definition().clone();
        let ProgramNodeKind::ModelAuthored {
            build_output_schema,
            ..
        } = &mut narrowing.nodes[1].kind
        else {
            panic!("the material stage is model-authored");
        };
        *build_output_schema = Some(bounded_title_schema);
        let narrowing = narrowing.validate().expect("narrowing program");

        execute_new(
            &database,
            &narrowing,
            &json!({"topic": "Fractions"}),
            None,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("execution");

        let requests = port.requests();
        assert_eq!(requests[0].signature_id, "write-classwork");
        assert_eq!(requests[1].signature_id, "repair-classwork");
        for request in &requests {
            assert_eq!(
                request.output_schema["properties"]["titleSequence"]["maximum"],
                json!("Fractions".len()),
                "{} decodes against the narrowed schema",
                request.signature_id
            );
        }
    }

    /// Stands in for a real stage whose answers are bounded by what its request
    /// supplies, so the bound is read from the input rather than fixed.
    fn bounded_title_schema(input: &Value) -> Result<Value, RuntimeFault> {
        let highest = input["topic"].as_str().unwrap_or_default().len();
        Ok(json!({
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "titleSequence": {"type": "integer", "minimum": 1, "maximum": highest},
            },
            "required": ["title", "titleSequence"],
            "additionalProperties": false,
        }))
    }

    /// Three attempts at knowledge-planning came back byte for byte identical,
    /// because every one sampled at the signature's seed. A repair that walks
    /// the path just rejected cannot do anything but repeat itself.
    #[test]
    fn each_repair_samples_a_different_path() {
        let signature = GenerationSignature {
            id: "stage".to_owned(),
            version: "1".to_owned(),
            input_contract: DataContract {
                id: "in".to_owned(),
                version: "1".to_owned(),
            },
            output_contract: DataContract {
                id: "out".to_owned(),
                version: "1".to_owned(),
            },
            system_instructions: String::new(),
            task_instructions: String::new(),
            output_schema: json!({}),
            validation_policy: "stage.checked".to_owned(),
            limits: CompletionLimits {
                temperature: 0.1,
                seed: 31,
                max_output_tokens: 100,
                timeout_seconds: 10,
            },
        };

        let seeds = (0..3)
            .map(|repair| {
                completion_request(&signature, json!({}), repair)
                    .limits
                    .seed
            })
            .collect::<Vec<_>>();

        assert_eq!(seeds, vec![31, 32, 33], "no two attempts share a path");
    }

    #[tokio::test]
    async fn exhausts_the_repair_budget_and_records_validation_failure() {
        let database = Database::in_memory();
        let port = ScriptedCompletionPort::new(vec![
            completion(json!({"title": "Wrong"})),
            completion(json!({"title": "Still wrong"})),
        ]);

        let fault = execute_new(
            &database,
            &program(),
            &json!({"topic": "Fractions"}),
            None,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect_err("validation failure");

        assert_eq!(fault.kind, RuntimeFaultKind::Validation);
        let statuses = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT r.status, r.failure_kind, COUNT(i.id)
                     FROM generation_program_runs r
                     JOIN generation_node_runs n ON n.run_id = r.id
                     JOIN generation_model_invocations i ON i.node_run_id = n.id
                     GROUP BY r.id",
                    [],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, u8>(2)?,
                        ))
                    },
                )
            })
            .expect("statuses");
        assert_eq!(statuses, ("failed".to_owned(), "validation".to_owned(), 2));
    }

    #[tokio::test]
    async fn keeps_the_fewest_violation_attempt_and_repairs_from_it() {
        let database = Database::in_memory();
        // One flaw, then a repair that comes back worse with three, then two — none
        // pass. The best attempt is the first, and it must not be lost to the last.
        let port = ScriptedCompletionPort::new(vec![
            completion(json!({"title": "x"})),
            completion(json!({"title": "xxx"})),
            completion(json!({"title": "xx"})),
        ]);

        let fault = execute_new(
            &database,
            &build_program(counting_validate, 2),
            &json!({"topic": "Fractions"}),
            None,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect_err("no attempt passes");

        // The run fails with the closest attempt it reached (one flaw), not the last.
        assert_eq!(fault.diagnostics, vec!["resolve flaw 1".to_owned()]);

        // Both repairs regenerate from that best attempt, not the worse one before them.
        let requests = port.requests();
        assert_eq!(requests.len(), 3);
        assert_eq!(requests[1].input["invalidCandidate"], json!({"title": "x"}));
        assert_eq!(requests[2].input["invalidCandidate"], json!({"title": "x"}));
    }

    #[tokio::test]
    async fn resumes_without_reexecuting_a_completed_checkpoint() {
        let database = Database::in_memory();
        let program = program();
        let input = json!({"topic": "Fractions"});
        let checkpoint = create_run(&database, &program, &input, "model-a", None).expect("run");
        mark_run_running(&database, &checkpoint.run_id).expect("start");
        begin_node(&database, &checkpoint.run_id, "prepare-context", &input).expect("node");
        complete_node(
            &database,
            &checkpoint.run_id,
            "prepare-context",
            &json!({"topic": "Fractions"}),
            &ValidationReport::pass("deterministic-module"),
            0,
        )
        .expect("checkpoint");
        recover_interrupted_runs(&database).expect("recovery");
        let port = ScriptedCompletionPort::new(vec![completion(json!({"title": "Fractions"}))]);

        let result = resume_interrupted(
            &database,
            &checkpoint.run_id,
            &program,
            &input,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("resume");

        assert_eq!(
            result.outputs["preparedContext"],
            json!({"topic": "Fractions"})
        );
        assert_eq!(port.requests().len(), 1);
    }

    #[tokio::test]
    async fn resumes_an_interrupted_model_call_with_a_new_trace_ordinal() {
        let database = Database::in_memory();
        let (program, input, checkpoint, signature) = running_model_node(&database);
        start_test_invocation(
            &database,
            &checkpoint.run_id,
            &signature,
            &json!({"topic": "Fractions"}),
            0,
            "initial",
        );
        recover_interrupted_runs(&database).expect("recovery");
        let port = ScriptedCompletionPort::new(vec![completion(json!({"title": "Fractions"}))]);

        let result = resume_interrupted(
            &database,
            &checkpoint.run_id,
            &program,
            &input,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("resumed generation");

        assert_eq!(result.outputs["classwork"]["title"], "Fractions");
        let attempts = database
            .with_connection(|connection| -> rusqlite::Result<Vec<(u8, u8, String)>> {
                let mut statement = connection.prepare(
                    "SELECT attempt_ordinal, repair_ordinal, status
                     FROM generation_model_invocations ORDER BY attempt_ordinal",
                )?;
                let attempts = statement
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, u8>(0)?,
                            row.get::<_, u8>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(attempts)
            })
            .expect("attempt traces");
        assert_eq!(
            attempts,
            vec![
                (1, 0, "interrupted".to_owned()),
                (2, 0, "completed".to_owned())
            ]
        );
    }

    #[tokio::test]
    async fn commits_a_completed_invocation_after_restart_without_calling_the_model_again() {
        let database = Database::in_memory();
        let (program, input, checkpoint, signature) = running_model_node(&database);
        let trace = start_test_invocation(
            &database,
            &checkpoint.run_id,
            &signature,
            &json!({"topic": "Fractions"}),
            0,
            "initial",
        );
        let output = serde_json::to_string(&json!({"title": "Fractions"})).expect("output");
        finish_invocation(
            &database,
            InvocationFinish {
                invocation_id: &trace.invocation_id,
                status: "completed",
                output_text: Some(&output),
                validation: Some(&ValidationReport::pass("reviewed-output")),
                diagnostics: vec![],
                input_tokens: Some(12),
                output_tokens: Some(4),
            },
        )
        .expect("finish invocation");
        recover_interrupted_runs(&database).expect("recovery");
        let port = ScriptedCompletionPort::new(vec![]);

        let result = resume_interrupted(
            &database,
            &checkpoint.run_id,
            &program,
            &input,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("resumed generation");

        assert_eq!(result.outputs["classwork"]["title"], "Fractions");
        assert!(port.requests().is_empty());
    }

    #[tokio::test]
    async fn resumes_the_exact_interrupted_repair_without_spending_another_repair() {
        let database = Database::in_memory();
        let (program, input, checkpoint, initial_signature) = running_model_node(&database);
        let wrong_candidate = json!({"title": "Wrong"});
        let rejection = validate(&json!({"topic": "Fractions"}), &wrong_candidate);
        let initial_trace = start_test_invocation(
            &database,
            &checkpoint.run_id,
            &initial_signature,
            &json!({"topic": "Fractions"}),
            0,
            "initial",
        );
        let wrong_output = serde_json::to_string(&wrong_candidate).expect("wrong output");
        finish_invocation(
            &database,
            InvocationFinish {
                invocation_id: &initial_trace.invocation_id,
                status: "validation_rejected",
                output_text: Some(&wrong_output),
                validation: Some(&rejection),
                diagnostics: vec!["The title must match the lesson topic.".to_owned()],
                input_tokens: Some(12),
                output_tokens: Some(4),
            },
        )
        .expect("reject initial invocation");
        let repair_signature = program
            .ordered_nodes()
            .find_map(|node| match &node.kind {
                ProgramNodeKind::ModelAuthored {
                    repair_signature: Some(signature),
                    ..
                } => Some((**signature).clone()),
                _ => None,
            })
            .expect("repair signature");
        let repair_input = json!({
            "originalInput": {"topic": "Fractions"},
            "invalidCandidate": wrong_candidate,
            "failedChecks": rejection.failed_checks(),
        });
        start_test_invocation(
            &database,
            &checkpoint.run_id,
            &repair_signature,
            &repair_input,
            1,
            "repair",
        );
        recover_interrupted_runs(&database).expect("recovery");
        let port = ScriptedCompletionPort::new(vec![completion(json!({"title": "Fractions"}))]);

        let result = resume_interrupted(
            &database,
            &checkpoint.run_id,
            &program,
            &input,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("resumed repair");

        assert_eq!(result.outputs["classwork"]["title"], "Fractions");
        let requests = port.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].signature_id, "repair-classwork");
        assert_eq!(requests[0].input, repair_input);
        let trace = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT repair_count, COUNT(*) FROM generation_node_runs n
                     JOIN generation_model_invocations i ON i.node_run_id = n.id
                     WHERE n.node_id = 'write-classwork'",
                    [],
                    |row| Ok((row.get::<_, u8>(0)?, row.get::<_, u8>(1)?)),
                )
            })
            .expect("repair trace");
        assert_eq!(trace, (1, 3));
    }

    #[tokio::test]
    async fn cancellation_is_terminal_and_does_not_start_a_model_call() {
        let database = Database::in_memory();
        let port = ScriptedCompletionPort::new(vec![]);
        let cancellation = CancellationToken::new();
        cancellation.cancel();

        let fault = execute_new(
            &database,
            &program(),
            &json!({"topic": "Fractions"}),
            None,
            &port,
            cancellation,
        )
        .await
        .expect_err("cancelled");

        assert_eq!(fault.kind, RuntimeFaultKind::Cancelled);
        assert!(port.requests().is_empty());
        let status = database
            .with_connection(|connection| {
                connection.query_row("SELECT status FROM generation_program_runs", [], |row| {
                    row.get::<_, String>(0)
                })
            })
            .expect("run status");
        assert_eq!(status, "cancelled");
    }

    #[tokio::test]
    async fn timeout_and_transport_failures_remain_distinct_terminal_states() {
        let timeout_database = Database::in_memory();
        let timeout_fault = execute_new(
            &timeout_database,
            &program(),
            &json!({"topic": "Fractions"}),
            None,
            &NeverCompletesPort,
            CancellationToken::new(),
        )
        .await
        .expect_err("timeout");
        assert_eq!(timeout_fault.kind, RuntimeFaultKind::Timeout);

        let transport_database = Database::in_memory();
        let transport_port = ScriptedCompletionPort::new(vec![Err(CompletionFailure::new(
            CompletionFailureKind::Transport,
            vec!["The local model process stopped unexpectedly.".to_owned()],
        ))]);
        let transport_fault = execute_new(
            &transport_database,
            &program(),
            &json!({"topic": "Fractions"}),
            None,
            &transport_port,
            CancellationToken::new(),
        )
        .await
        .expect_err("transport failure");
        assert_eq!(transport_fault.kind, RuntimeFaultKind::Transport);

        let statuses = |database: &Database| {
            database
                .with_connection(|connection| {
                    connection.query_row(
                        "SELECT r.failure_kind, i.status
                         FROM generation_program_runs r
                         JOIN generation_node_runs n ON n.run_id = r.id
                         JOIN generation_model_invocations i ON i.node_run_id = n.id",
                        (),
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    )
                })
                .expect("failure states")
        };
        assert_eq!(
            statuses(&timeout_database),
            ("timeout".to_owned(), "timed_out".to_owned())
        );
        assert_eq!(
            statuses(&transport_database),
            ("transport".to_owned(), "transport_failed".to_owned())
        );
    }
}
