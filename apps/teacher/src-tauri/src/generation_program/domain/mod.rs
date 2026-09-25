mod outcome;
mod program;

pub use outcome::*;
pub use program::*;

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::BTreeMap;

    use serde_json::{json, Value};

    fn build_input(
        input: &Value,
        _outputs: &BTreeMap<String, Value>,
    ) -> Result<Value, RuntimeFault> {
        Ok(input.clone())
    }

    fn deterministic(input: &Value) -> Result<Value, RuntimeFault> {
        Ok(input.clone())
    }

    fn decoder(_output: &Value) -> ValidationReport {
        ValidationReport::pass("structure")
    }

    fn validator(_input: &Value, _output: &Value) -> ValidationReport {
        ValidationReport::pass("quality")
    }

    fn contract(id: &str) -> DataContract {
        DataContract::new(id, "1.0.0")
    }

    fn schema() -> Value {
        json!({
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": false
        })
    }

    fn signature(id: &str, output: DataContract) -> GenerationSignature {
        GenerationSignature {
            id: id.to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.input"),
            output_contract: output,
            system_instructions: "Follow the product contract.".to_owned(),
            task_instructions: "Return the requested structured answer.".to_owned(),
            output_schema: schema(),
            validation_policy: "example.quality".to_owned(),
            limits: CompletionLimits {
                temperature: 0.0,
                seed: 17,
                max_output_tokens: 100,
                timeout_seconds: 30,
            },
        }
    }

    fn deterministic_node(id: &str, output_key: &str) -> ProgramNode {
        ProgramNode {
            id: id.to_owned(),
            module_id: format!("example.{id}"),
            module_version: "1.0.0".to_owned(),
            output_key: output_key.to_owned(),
            output_contract: contract(&format!("example.{id}.output")),
            dependencies: Vec::new(),
            build_input,
            kind: ProgramNodeKind::Deterministic {
                execute: deterministic,
            },
        }
    }

    #[test]
    fn rejects_cycles_missing_dependencies_and_contract_mismatches() {
        let mut first = deterministic_node("first", "first-output");
        let mut second = deterministic_node("second", "second-output");
        first.dependencies.push(NodeDependency {
            node_id: "second".to_owned(),
            contract: second.output_contract.clone(),
        });
        second.dependencies.push(NodeDependency {
            node_id: "first".to_owned(),
            contract: first.output_contract.clone(),
        });
        let cycle = GenerationProgram {
            id: "example.program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.program.input"),
            nodes: vec![first.clone(), second.clone()],
        }
        .validate()
        .expect_err("cycle");
        assert!(cycle.to_string().contains("cycle"));

        first.dependencies[0].node_id = "missing".to_owned();
        let missing = GenerationProgram {
            id: "example.program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.program.input"),
            nodes: vec![first],
        }
        .validate()
        .expect_err("missing dependency");
        assert!(missing.to_string().contains("missing node"));

        second.dependencies[0].contract = contract("example.wrong.output");
        let mismatch = GenerationProgram {
            id: "example.program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.program.input"),
            nodes: vec![deterministic_node("first", "first-output"), second],
        }
        .validate()
        .expect_err("contract mismatch");
        assert!(mismatch.to_string().contains("different contract"));
    }

    #[test]
    fn rejects_non_strict_output_schemas_and_incoherent_repairs() {
        let output = contract("example.model.output");
        let mut non_strict = signature("example.generate", output.clone());
        non_strict.output_schema["additionalProperties"] = Value::Bool(true);
        assert!(non_strict.validate().is_err());

        let model = ProgramNode {
            id: "model".to_owned(),
            module_id: "example.model".to_owned(),
            module_version: "1.0.0".to_owned(),
            output_key: "answer".to_owned(),
            output_contract: output.clone(),
            dependencies: Vec::new(),
            build_input,
            kind: ProgramNodeKind::ModelAuthored {
                signature: Box::new(signature("example.generate", output)),
                repair_signature: None,
                repair_budget: 1,
                decode: decoder,
                validate: validator,
                build_output_schema: None,
                build_output_budget: None,
            },
        };
        assert!(GenerationProgram {
            id: "example.program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.program.input"),
            nodes: vec![model],
        }
        .validate()
        .is_err());
    }

    #[test]
    fn program_and_input_digests_are_canonical_and_version_sensitive() {
        let first = json!({"b": 2, "a": {"d": 4, "c": 3}});
        let second: Value = serde_json::from_str(r#"{"a":{"c":3,"d":4},"b":2}"#)
            .expect("same value in another key order");
        assert_eq!(digest_json(&first), digest_json(&second));

        let program = GenerationProgram {
            id: "example.program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.program.input"),
            nodes: vec![deterministic_node("first", "first-output")],
        }
        .validate()
        .expect("valid program");
        let mut changed = program.definition().clone();
        changed.version = "1.0.1".to_owned();
        let changed = changed.validate().expect("changed program");
        assert_ne!(program.digest(), changed.digest());
    }

    #[test]
    fn prompt_and_schema_changes_produce_distinct_program_digests() {
        let output = contract("example.model.output");
        let program = GenerationProgram {
            id: "example.model-program".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: contract("example.input"),
            nodes: vec![ProgramNode {
                id: "model".to_owned(),
                module_id: "example.model".to_owned(),
                module_version: "1.0.0".to_owned(),
                output_key: "answer".to_owned(),
                output_contract: output.clone(),
                dependencies: vec![],
                build_input,
                kind: ProgramNodeKind::ModelAuthored {
                    signature: Box::new(signature("example.generate", output)),
                    repair_signature: None,
                    repair_budget: 0,
                    decode: decoder,
                    validate: validator,
                    build_output_schema: None,
                    build_output_budget: None,
                },
            }],
        }
        .validate()
        .expect("model program");
        let mut prompt_changed = program.definition().clone();
        let ProgramNodeKind::ModelAuthored { signature, .. } = &mut prompt_changed.nodes[0].kind
        else {
            panic!("model node")
        };
        signature
            .task_instructions
            .push_str(" Include a concise title.");
        let prompt_changed = prompt_changed.validate().expect("prompt change");

        let mut schema_changed = program.definition().clone();
        let ProgramNodeKind::ModelAuthored { signature, .. } = &mut schema_changed.nodes[0].kind
        else {
            panic!("model node")
        };
        signature.output_schema["properties"]["answer"]["enum"] = json!(["yes", "no"]);
        let schema_changed = schema_changed.validate().expect("schema change");

        assert_ne!(program.digest(), prompt_changed.digest());
        assert_ne!(program.digest(), schema_changed.digest());
    }

    #[test]
    fn strict_runtime_schema_rejects_missing_extra_and_invalid_fields() {
        let schema = json!({
            "type": "object",
            "properties": {
                "answer": {"type": "string", "enum": ["yes", "no"]},
                "confidence": {"type": "integer"}
            },
            "required": ["answer", "confidence"],
            "additionalProperties": false
        });

        assert!(
            validate_value_against_schema(&json!({"answer": "yes", "confidence": 1}), &schema)
                .passed
        );
        for candidate in [
            json!({"answer": "yes"}),
            json!({"answer": "yes", "confidence": 1, "extra": true}),
            json!({"answer": "maybe", "confidence": "high"}),
        ] {
            assert!(!validate_value_against_schema(&candidate, &schema).passed);
        }
    }

    /// The runtime schema enforced minItems, minimum and maximum but not the
    /// minLength it declared, so a blank string a stage schema forbids passed the
    /// schema check and was refused only by the validator behind it — the exact
    /// schema-admits-what-the-validator-refuses split this pipeline guards against.
    #[test]
    fn a_blank_string_the_schema_declares_non_empty_is_refused() {
        let schema = json!({
            "type": "object",
            "properties": {"statement": {"type": "string", "minLength": 1}},
            "required": ["statement"],
            "additionalProperties": false
        });

        assert!(
            validate_value_against_schema(&json!({"statement": "Count in millions."}), &schema)
                .passed
        );
        assert!(
            !validate_value_against_schema(&json!({"statement": ""}), &schema).passed,
            "the schema declares the field non-empty, so the runtime check enforces it"
        );
    }

    #[test]
    fn validation_reports_preserve_exact_failed_checks_with_bounded_details() {
        let report = ValidationReport::new(vec![
            ValidationCheck::pass("structure"),
            ValidationCheck::fail(
                "alignment",
                vec!["  Missing   descending objective.  ".to_owned()],
            ),
        ]);

        assert!(!report.passed);
        assert_eq!(report.failed_checks().len(), 1);
        assert_eq!(
            report.failed_checks()[0].details,
            ["Missing descending objective."]
        );
    }
}
