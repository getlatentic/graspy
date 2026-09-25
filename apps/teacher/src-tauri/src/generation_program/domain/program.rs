use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::outcome::{digest_json, CompletionLimits, RuntimeFault, ValidationReport};

pub type NodeInputBuilder = fn(&Value, &BTreeMap<String, Value>) -> Result<Value, RuntimeFault>;
pub type DeterministicModule = fn(&Value) -> Result<Value, RuntimeFault>;
pub type OutputDecoder = fn(&Value) -> ValidationReport;
pub type OutputValidator = fn(&Value, &Value) -> ValidationReport;
/// Narrows a stage's output schema to the input it was given, so a stage whose
/// answers are chosen from a supplied catalogue constrains those choices instead
/// of asking for them and checking afterwards.
pub type OutputSchemaBuilder = fn(&Value) -> Result<Value, RuntimeFault>;
/// How much a stage is allowed to write, decided from the run's own input.
///
/// A fixed ceiling is a guess about a lesson that has not happened yet: it
/// holds for the lesson it was measured on and fails on the next one with
/// more to say. A stage that writes one item per source record has to be
/// given room for the records it was actually handed.
pub type OutputBudgetBuilder = fn(&Value) -> Result<u32, RuntimeFault>;
/// The separate calls a stage is broken into, one input each.
///
/// A stage writing one item per source record cannot do it in a single call
/// once a lesson is large: the window holds the whole lesson as input, and what
/// is left over is not enough to write every item into. Splitting is not a
/// saving — the input is paid again per call — but every call fits, which the
/// single call had stopped doing.
pub type ItemPlanner = fn(&Value) -> Result<Vec<Value>, RuntimeFault>;
/// The stage's own output, assembled from what each call wrote.
pub type ItemCollector = fn(&Value, Vec<Value>) -> Result<Value, RuntimeFault>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DataContract {
    pub id: String,
    pub version: String,
}

impl DataContract {
    pub fn new(id: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            version: version.into(),
        }
    }

    fn validate(&self, label: &str) -> Result<(), RegistrationError> {
        validate_identifier(&self.id, label)?;
        validate_version(&self.version, label)
    }
}

impl CompletionLimits {
    fn validate(&self) -> Result<(), RegistrationError> {
        if !(0.0..=2.0).contains(&self.temperature) {
            return Err(RegistrationError::new(
                "Completion temperature must be between 0 and 2.",
            ));
        }
        if !(1..=32_768).contains(&self.max_output_tokens) {
            return Err(RegistrationError::new(
                "Completion output limit must be between 1 and 32768 tokens.",
            ));
        }
        if !(1..=600).contains(&self.timeout_seconds) {
            return Err(RegistrationError::new(
                "Completion timeout must be between 1 and 600 seconds.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationSignature {
    pub id: String,
    pub version: String,
    pub input_contract: DataContract,
    pub output_contract: DataContract,
    pub system_instructions: String,
    pub task_instructions: String,
    pub output_schema: Value,
    pub validation_policy: String,
    pub limits: CompletionLimits,
}

impl GenerationSignature {
    pub fn validate(&self) -> Result<(), RegistrationError> {
        validate_identifier(&self.id, "signature identifier")?;
        validate_version(&self.version, "signature version")?;
        self.input_contract.validate("signature input contract")?;
        self.output_contract.validate("signature output contract")?;
        required_text(&self.system_instructions, "signature system instructions")?;
        required_text(&self.task_instructions, "signature task instructions")?;
        validate_identifier(&self.validation_policy, "validation policy")?;
        self.limits.validate()?;
        validate_strict_schema(&self.output_schema, "$output")
    }

    pub fn schema_sha256(&self) -> String {
        digest_json(&self.output_schema)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeDependency {
    pub node_id: String,
    pub contract: DataContract,
}

#[derive(Clone, Debug)]
pub enum ProgramNodeKind {
    Deterministic {
        execute: DeterministicModule,
    },
    ModelAuthored {
        signature: Box<GenerationSignature>,
        repair_signature: Option<Box<GenerationSignature>>,
        repair_budget: u8,
        decode: OutputDecoder,
        validate: OutputValidator,
        build_output_schema: Option<OutputSchemaBuilder>,
        build_output_budget: Option<OutputBudgetBuilder>,
    },
    /// One model call per item, then one output assembled from them.
    ///
    /// Each call carries only its own item's context and writes only that item,
    /// so a lesson with more to say costs more calls rather than overrunning
    /// one. Repair, validation and cancellation are per item: a rewrite fixes
    /// one question instead of re-rolling the set, and a stop between items
    /// leaves what is already written.
    ModelAuthoredPerItem {
        signature: Box<GenerationSignature>,
        repair_signature: Option<Box<GenerationSignature>>,
        repair_budget: u8,
        decode: OutputDecoder,
        /// Checks one item on its own — and only what one item can answer for.
        ///
        /// Wiring the stage's own validator here is the mistake to avoid: the
        /// assessment validator requires every learning goal covered, which one
        /// record's answer cannot do, so every item failed, repaired once and
        /// failed again. A stage's validator has to be split before it fans
        /// out, into what one item owes and what only the whole can show.
        validate_item: OutputValidator,
        /// Checks the assembled result for what only the whole can show, such
        /// as every learning goal being covered.
        validate: OutputValidator,
        plan_items: ItemPlanner,
        collect: ItemCollector,
    },
    // Two things this kind still owes, both measured on a real lesson rather
    // than guessed:
    //
    // It has no build_output_budget, so a per-item call is held to the
    // signature's static floor. Three calls ran and the third stopped at 3,600
    // tokens — the floor, not the budget the ModelAuthored arm would have
    // derived.
    //
    // And a stage's instruction has to be split with it. The assessment
    // instruction says "cover every supplied lesson objective at least once",
    // which is the whole set's job; every per-record call read it and tried to
    // write the whole lesson's questions from one record. An instruction is as
    // much a per-item concern as a validator is.
}

#[derive(Clone, Debug)]
pub struct ProgramNode {
    pub id: String,
    pub module_id: String,
    pub module_version: String,
    pub output_key: String,
    pub output_contract: DataContract,
    pub dependencies: Vec<NodeDependency>,
    pub build_input: NodeInputBuilder,
    pub kind: ProgramNodeKind,
}

impl ProgramNode {
    pub fn kind_name(&self) -> &'static str {
        match &self.kind {
            ProgramNodeKind::Deterministic { .. } => "deterministic",
            ProgramNodeKind::ModelAuthored { .. } => "model",
            ProgramNodeKind::ModelAuthoredPerItem { .. } => "model-per-item",
        }
    }
}

#[derive(Clone, Debug)]
pub struct GenerationProgram {
    pub id: String,
    pub version: String,
    pub input_contract: DataContract,
    pub nodes: Vec<ProgramNode>,
}

#[derive(Clone, Debug)]
pub struct ValidatedProgram {
    definition: GenerationProgram,
    topological_order: Vec<usize>,
    digest: String,
}

impl ValidatedProgram {
    pub fn definition(&self) -> &GenerationProgram {
        &self.definition
    }

    pub fn ordered_nodes(&self) -> impl Iterator<Item = &ProgramNode> {
        self.topological_order
            .iter()
            .map(|index| &self.definition.nodes[*index])
    }

    pub fn digest(&self) -> &str {
        &self.digest
    }
}

impl GenerationProgram {
    pub fn validate(self) -> Result<ValidatedProgram, RegistrationError> {
        validate_identifier(&self.id, "program identifier")?;
        validate_version(&self.version, "program version")?;
        self.input_contract.validate("program input contract")?;
        if self.nodes.is_empty() {
            return Err(RegistrationError::new(
                "A generation program must contain at least one node.",
            ));
        }

        let mut node_indices = BTreeMap::new();
        let mut output_keys = BTreeSet::new();
        for (index, node) in self.nodes.iter().enumerate() {
            validate_identifier(&node.id, "program node identifier")?;
            validate_identifier(&node.module_id, "generation module identifier")?;
            validate_version(&node.module_version, "generation module version")?;
            validate_identifier(&node.output_key, "program output key")?;
            node.output_contract
                .validate("program node output contract")?;
            if node_indices.insert(node.id.clone(), index).is_some() {
                return Err(RegistrationError::new(format!(
                    "Generation program node {} is duplicated.",
                    node.id
                )));
            }
            if !output_keys.insert(node.output_key.clone()) {
                return Err(RegistrationError::new(format!(
                    "Generation output key {} is produced more than once.",
                    node.output_key
                )));
            }
            match &node.kind {
                ProgramNodeKind::Deterministic { .. } => {}
                ProgramNodeKind::ModelAuthored {
                    signature,
                    repair_signature,
                    repair_budget,
                    ..
                } => {
                    signature.validate()?;
                    if signature.output_contract != node.output_contract {
                        return Err(RegistrationError::new(format!(
                            "Node {} and its signature declare different output contracts.",
                            node.id
                        )));
                    }
                    match (repair_signature, repair_budget) {
                        (None, 0) => {}
                        (Some(repair), 1..=3) => {
                            repair.validate()?;
                            if repair.output_contract != node.output_contract {
                                return Err(RegistrationError::new(format!(
                                    "Node {} and its repair signature declare different output contracts.",
                                    node.id
                                )));
                            }
                        }
                        (None, _) => {
                            return Err(RegistrationError::new(
                                "A positive repair budget requires a dedicated repair signature.",
                            ))
                        }
                        (Some(_), 0) => {
                            return Err(RegistrationError::new(
                                "A repair signature requires a positive retry budget.",
                            ))
                        }
                        (Some(_), _) => {
                            return Err(RegistrationError::new(
                                "A model node cannot attempt more than three repairs.",
                            ))
                        }
                    }
                }
                ProgramNodeKind::ModelAuthoredPerItem {
                    signature,
                    repair_signature,
                    repair_budget,
                    ..
                } => {
                    signature.validate()?;
                    // The node's contract describes the assembled result; the
                    // signature's describes one item, so they differ by design
                    // and only the repair has to match what it repairs.
                    match (repair_signature, repair_budget) {
                        (None, 0) => {}
                        (Some(repair), 1..=3) => {
                            repair.validate()?;
                            if repair.output_contract != signature.output_contract {
                                return Err(RegistrationError::new(format!(
                                    "Node {} repairs one item against a different contract than it writes.",
                                    node.id
                                )));
                            }
                        }
                        _ => {
                            return Err(RegistrationError::new(format!(
                                "Node {} pairs a repair signature and a repair budget that do not agree.",
                                node.id
                            )));
                        }
                    }
                }
            }
        }

        let mut incoming = vec![0_usize; self.nodes.len()];
        let mut outgoing = vec![Vec::new(); self.nodes.len()];
        for (node_index, node) in self.nodes.iter().enumerate() {
            let mut dependencies = BTreeSet::new();
            for dependency in &node.dependencies {
                if !dependencies.insert(&dependency.node_id) {
                    return Err(RegistrationError::new(format!(
                        "Node {} repeats dependency {}.",
                        node.id, dependency.node_id
                    )));
                }
                let producer_index = node_indices.get(&dependency.node_id).ok_or_else(|| {
                    RegistrationError::new(format!(
                        "Node {} depends on missing node {}.",
                        node.id, dependency.node_id
                    ))
                })?;
                if *producer_index == node_index {
                    return Err(RegistrationError::new(format!(
                        "Node {} cannot depend on itself.",
                        node.id
                    )));
                }
                let producer = &self.nodes[*producer_index];
                if producer.output_contract != dependency.contract {
                    return Err(RegistrationError::new(format!(
                        "Node {} expects a different contract from dependency {}.",
                        node.id, dependency.node_id
                    )));
                }
                incoming[node_index] += 1;
                outgoing[*producer_index].push(node_index);
            }
        }

        let mut ready = BTreeSet::new();
        for (index, count) in incoming.iter().enumerate() {
            if *count == 0 {
                ready.insert((self.nodes[index].id.clone(), index));
            }
        }
        let mut order = Vec::with_capacity(self.nodes.len());
        while let Some((_, index)) = ready.pop_first() {
            order.push(index);
            for dependent in &outgoing[index] {
                incoming[*dependent] -= 1;
                if incoming[*dependent] == 0 {
                    ready.insert((self.nodes[*dependent].id.clone(), *dependent));
                }
            }
        }
        if order.len() != self.nodes.len() {
            return Err(RegistrationError::new(
                "The generation program contains a dependency cycle.",
            ));
        }

        let digest = digest_json(&program_manifest(&self));
        Ok(ValidatedProgram {
            definition: self,
            topological_order: order,
            digest,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistrationError {
    message: String,
}

impl RegistrationError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for RegistrationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for RegistrationError {}

fn program_manifest(program: &GenerationProgram) -> Value {
    json!({
        "id": program.id,
        "version": program.version,
        "inputContract": program.input_contract,
        "nodes": program.nodes.iter().map(|node| {
            let model = match &node.kind {
                ProgramNodeKind::Deterministic { .. } => Value::Null,
                ProgramNodeKind::ModelAuthored {
                    signature,
                    repair_signature,
                    repair_budget,
                    ..
                } => json!({
                    "signature": signature,
                    "repairSignature": repair_signature,
                    "repairBudget": repair_budget,
                }),
                ProgramNodeKind::ModelAuthoredPerItem {
                    signature,
                    repair_signature,
                    repair_budget,
                    ..
                } => json!({
                    "signature": signature,
                    "repairSignature": repair_signature,
                    "repairBudget": repair_budget,
                }),
            };
            json!({
                "id": node.id,
                "moduleId": node.module_id,
                "moduleVersion": node.module_version,
                "outputKey": node.output_key,
                "outputContract": node.output_contract,
                "dependencies": node.dependencies,
                "kind": node.kind_name(),
                "model": model,
            })
        }).collect::<Vec<_>>(),
    })
}

fn validate_identifier(value: &str, label: &str) -> Result<(), RegistrationError> {
    if value.is_empty()
        || value.len() > 160
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ':')
        })
    {
        return Err(RegistrationError::new(format!(
            "The {label} is not a valid stable identifier."
        )));
    }
    Ok(())
}

fn validate_version(value: &str, label: &str) -> Result<(), RegistrationError> {
    if value.is_empty()
        || value.len() > 80
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+')
        })
    {
        return Err(RegistrationError::new(format!(
            "The {label} is not a valid version."
        )));
    }
    Ok(())
}

fn required_text(value: &str, label: &str) -> Result<(), RegistrationError> {
    if value.trim().is_empty() || value.chars().count() > 16_000 {
        return Err(RegistrationError::new(format!(
            "The {label} must contain between 1 and 16000 characters."
        )));
    }
    Ok(())
}

fn validate_strict_schema(schema: &Value, path: &str) -> Result<(), RegistrationError> {
    let object = schema.as_object().ok_or_else(|| {
        RegistrationError::new(format!("The strict schema at {path} must be an object."))
    })?;
    match object.get("type").and_then(Value::as_str) {
        Some("object") => {
            let properties = object
                .get("properties")
                .and_then(Value::as_object)
                .ok_or_else(|| {
                    RegistrationError::new(format!(
                        "The object schema at {path} must declare properties."
                    ))
                })?;
            if object.get("additionalProperties") != Some(&Value::Bool(false)) {
                return Err(RegistrationError::new(format!(
                    "The object schema at {path} must reject additional properties."
                )));
            }
            let required = object
                .get("required")
                .and_then(Value::as_array)
                .ok_or_else(|| {
                    RegistrationError::new(format!(
                        "The object schema at {path} must declare required properties."
                    ))
                })?
                .iter()
                .map(|value| value.as_str().map(str::to_owned))
                .collect::<Option<BTreeSet<_>>>()
                .ok_or_else(|| {
                    RegistrationError::new(format!(
                        "The object schema at {path} has an invalid required list."
                    ))
                })?;
            let property_names = properties.keys().cloned().collect::<BTreeSet<_>>();
            if required != property_names {
                return Err(RegistrationError::new(format!(
                    "Every property in the strict schema at {path} must be required."
                )));
            }
            for (name, property) in properties {
                validate_strict_schema(property, &format!("{path}.{name}"))?;
            }
        }
        Some("array") => {
            let items = object.get("items").ok_or_else(|| {
                RegistrationError::new(format!("The array schema at {path} must declare items."))
            })?;
            validate_strict_schema(items, &format!("{path}[]"))?;
        }
        Some("string" | "integer" | "number" | "boolean" | "null") => {}
        _ => {
            return Err(RegistrationError::new(format!(
                "The strict schema at {path} uses an unsupported or missing type."
            )))
        }
    }
    Ok(())
}
