use std::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationCheck {
    pub name: String,
    pub passed: bool,
    pub details: Vec<String>,
}

impl ValidationCheck {
    pub fn pass(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: true,
            details: Vec::new(),
        }
    }

    pub fn fail(name: impl Into<String>, details: Vec<String>) -> Self {
        Self {
            name: name.into(),
            passed: false,
            details: bounded_diagnostics(details),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationReport {
    pub passed: bool,
    pub checks: Vec<ValidationCheck>,
}

impl ValidationReport {
    pub fn new(checks: Vec<ValidationCheck>) -> Self {
        Self {
            passed: checks.iter().all(|check| check.passed),
            checks,
        }
    }

    pub fn pass(name: impl Into<String>) -> Self {
        Self::new(vec![ValidationCheck::pass(name)])
    }

    pub fn failed_checks(&self) -> Vec<ValidationCheck> {
        self.checks
            .iter()
            .filter(|check| !check.passed)
            .cloned()
            .collect()
    }

    pub fn combine(self, other: Self) -> Self {
        Self::new(self.checks.into_iter().chain(other.checks).collect())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionLimits {
    pub temperature: f64,
    pub seed: u64,
    pub max_output_tokens: u32,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StructuredCompletionRequest {
    pub invocation_id: String,
    pub signature_id: String,
    pub signature_version: String,
    pub system_instructions: String,
    pub task_instructions: String,
    pub input: Value,
    pub output_schema: Value,
    pub limits: CompletionLimits,
    /// A page the model is shown beside the instructions, when it is shown one.
    pub shown_page: Option<ShownPage>,
}

/// A photograph of a page, as the engine is given it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShownPage {
    /// The image as a data URL, which is the form the engine reads.
    pub data_url: String,
}

impl StructuredCompletionRequest {
    pub fn prompt_sha256(&self) -> String {
        digest_json(&json!({
            "signatureId": self.signature_id,
            "signatureVersion": self.signature_version,
            "systemInstructions": self.system_instructions,
            "taskInstructions": self.task_instructions,
            "input": self.input,
            "limits": self.limits,
            // The page is digested rather than carried: two readings of two
            // different pages must not record as the same prompt, and the
            // image itself is already kept with the run.
            "shownPage": self.shown_page.as_ref().map(|page| digest_json(&json!(page.data_url))),
        }))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StructuredCompletion {
    pub output_text: String,
    pub model_identity: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionFailureKind {
    Cancelled,
    Timeout,
    Transport,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionFailure {
    pub kind: CompletionFailureKind,
    pub diagnostics: Vec<String>,
}

impl CompletionFailure {
    pub fn new(kind: CompletionFailureKind, diagnostics: Vec<String>) -> Self {
        Self {
            kind,
            diagnostics: bounded_diagnostics(diagnostics),
        }
    }
}

pub trait StructuredCompletionPort: Send + Sync {
    /// Which model this port reaches. A run records the model that produced it,
    /// and reading that from the port rather than taking it alongside means the
    /// record cannot name one model while the calls go to another.
    fn model_identity(&self) -> &str;

    fn complete(
        &self,
        request: StructuredCompletionRequest,
        cancellation: CancellationToken,
    ) -> impl Future<Output = Result<StructuredCompletion, CompletionFailure>> + Send;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeFaultKind {
    Registration,
    Deterministic,
    Transport,
    Timeout,
    Schema,
    Validation,
    Cancelled,
    Persistence,
}

impl RuntimeFaultKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Registration => "registration",
            Self::Deterministic => "deterministic",
            Self::Transport => "transport",
            Self::Timeout => "timeout",
            Self::Schema => "schema",
            Self::Validation => "validation",
            Self::Cancelled => "cancelled",
            Self::Persistence => "persistence",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeFault {
    pub kind: RuntimeFaultKind,
    pub diagnostics: Vec<String>,
}

impl RuntimeFault {
    pub fn new(kind: RuntimeFaultKind, diagnostics: Vec<String>) -> Self {
        Self {
            kind,
            diagnostics: bounded_diagnostics(diagnostics),
        }
    }
}

impl std::fmt::Display for RuntimeFault {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(
            self.diagnostics
                .first()
                .map(String::as_str)
                .unwrap_or("The generation program could not continue."),
        )
    }
}

impl std::error::Error for RuntimeFault {}

pub fn digest_json(value: &Value) -> String {
    format!("{:x}", Sha256::digest(canonical_json(value)))
}

pub fn canonical_json(value: &Value) -> Vec<u8> {
    serde_json::to_vec(&canonical_value(value)).expect("JSON values always serialize")
}

pub fn bounded_diagnostics(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .filter_map(|value| {
            let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
            (!normalized.is_empty()).then(|| normalized.chars().take(500).collect())
        })
        .take(12)
        .collect()
}

pub fn validate_value_against_schema(value: &Value, schema: &Value) -> ValidationReport {
    let mut details = Vec::new();
    collect_schema_failures(value, schema, "$output", &mut details);
    if details.is_empty() {
        ValidationReport::pass("strict-output-schema")
    } else {
        ValidationReport::new(vec![ValidationCheck::fail("strict-output-schema", details)])
    }
}

fn canonical_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, value)| (key.clone(), canonical_value(value)))
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.iter().map(canonical_value).collect()),
        _ => value.clone(),
    }
}

fn collect_schema_failures(value: &Value, schema: &Value, path: &str, failures: &mut Vec<String>) {
    if failures.len() >= 12 {
        return;
    }
    let Some(schema) = schema.as_object() else {
        failures.push(format!("{path} has an invalid registered schema."));
        return;
    };
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array) {
        if !allowed.contains(value) {
            failures.push(format!("{path} is not one of the allowed values."));
            return;
        }
    }
    match schema.get("type").and_then(Value::as_str) {
        Some("object") => {
            let Some(object) = value.as_object() else {
                failures.push(format!("{path} must be an object."));
                return;
            };
            let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
                failures.push(format!("{path} has no registered properties."));
                return;
            };
            for property in properties.keys() {
                if !object.contains_key(property) {
                    failures.push(format!("{path}.{property} is required."));
                }
            }
            for property in object.keys() {
                if !properties.contains_key(property) {
                    failures.push(format!("{path}.{property} is not allowed."));
                }
            }
            for (property, child_schema) in properties {
                if let Some(child) = object.get(property) {
                    collect_schema_failures(
                        child,
                        child_schema,
                        &format!("{path}.{property}"),
                        failures,
                    );
                }
            }
        }
        Some("array") => {
            let Some(array) = value.as_array() else {
                failures.push(format!("{path} must be an array."));
                return;
            };
            if let Some(minimum) = schema.get("minItems").and_then(Value::as_u64) {
                if array.len() < minimum as usize {
                    failures.push(format!("{path} must contain at least {minimum} items."));
                }
            }
            if let Some(maximum) = schema.get("maxItems").and_then(Value::as_u64) {
                if array.len() > maximum as usize {
                    failures.push(format!("{path} must contain at most {maximum} items."));
                }
            }
            if let Some(item_schema) = schema.get("items") {
                for (index, item) in array.iter().enumerate() {
                    collect_schema_failures(
                        item,
                        item_schema,
                        &format!("{path}[{index}]"),
                        failures,
                    );
                }
            }
        }
        Some("string") => {
            let Some(text) = value.as_str() else {
                failures.push(format!("{path} must be text."));
                return;
            };
            if let Some(minimum) = schema.get("minLength").and_then(Value::as_u64) {
                if (text.chars().count() as u64) < minimum {
                    failures.push(format!("{path} must not be blank."));
                }
            }
        }
        Some("integer") => {
            if !value.is_i64() && !value.is_u64() {
                failures.push(format!("{path} must be an integer."));
                return;
            }
            // A whole number past i64 exceeds every bound this pipeline sets.
            let integer = value.as_i64().unwrap_or(i64::MAX);
            if let Some(minimum) = schema.get("minimum").and_then(Value::as_i64) {
                if integer < minimum {
                    failures.push(format!("{path} must be {minimum} or more."));
                }
            }
            if let Some(maximum) = schema.get("maximum").and_then(Value::as_i64) {
                if integer > maximum {
                    failures.push(format!("{path} must be {maximum} or less."));
                }
            }
        }
        Some("number") => {
            if !value.is_number() {
                failures.push(format!("{path} must be a number."));
            }
        }
        Some("boolean") => {
            if !value.is_boolean() {
                failures.push(format!("{path} must be true or false."));
            }
        }
        Some("null") => {
            if !value.is_null() {
                failures.push(format!("{path} must be null."));
            }
        }
        _ => failures.push(format!("{path} has an unsupported registered type.")),
    }
}
