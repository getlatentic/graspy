mod capacity;
pub(crate) mod commands;
mod model_view;
mod port;
mod runtime;
mod signatures;

pub(crate) use capacity::{available_memory_bytes, memory_required_for};
pub use commands::{
    cancel_lesson_note_completion, cancel_lesson_preparation_completion,
    create_granular_lesson_completion, create_lesson_note_completion,
    create_lesson_preparation_completion, resume_lesson_preparation,
    work_through_teacher_lesson_goals,
};
pub use runtime::InferenceRuntime;

pub(crate) use port::LlamaServerStructuredCompletionPort;
pub(crate) use signatures::{product_completion_program, product_signature};

#[cfg(test)]
pub(crate) use port::build_llama_request;
#[cfg(test)]
pub(crate) use port::extract_completion;

#[cfg(test)]
use crate::generation_program::domain::StructuredCompletionRequest;
#[cfg(test)]
use runtime::RequestRegistry;
#[cfg(test)]
use serde_json::json;
#[cfg(test)]
use signatures::ProductCompletionRequest;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation_program::domain::CompletionLimits;

    #[test]
    fn extracts_completion_content_from_the_server_envelope() {
        let body = r#"{"choices":[{"message":{"content":"{\"title\":\"Materials\"}"}}]}"#;

        assert_eq!(
            extract_completion(body).expect("valid completion").content,
            r#"{"title":"Materials"}"#
        );
    }

    #[test]
    fn rejects_an_empty_completion_envelope() {
        let error = extract_completion(r#"{"choices":[]}"#)
            .err()
            .expect("empty choices must fail");

        assert!(error.contains("empty response"));
    }

    #[test]
    fn structured_adapter_is_the_only_layer_that_builds_chat_transport_fields() {
        let request = StructuredCompletionRequest {
            invocation_id: "invocation-1".to_owned(),
            signature_id: "classwork".to_owned(),
            signature_version: "1.0.0".to_owned(),
            system_instructions: "Create teacher-facing classwork.".to_owned(),
            task_instructions: "Return one titled section.".to_owned(),
            input: json!({"topic": "Fractions"}),
            output_schema: json!({
                "type": "object",
                "properties": {"title": {"type": "string"}},
                "required": ["title"],
                "additionalProperties": false
            }),
            limits: CompletionLimits {
                temperature: 0.2,
                seed: 17,
                max_output_tokens: 800,
                timeout_seconds: 30,
            },
            shown_page: None,
        };

        let payload = build_llama_request(&request);

        assert_eq!(payload["messages"][0]["role"], "system");
        assert_eq!(
            payload["response_format"]["json_schema"]["schema"],
            request.output_schema
        );
        assert_eq!(payload["seed"], 17);
        assert_eq!(payload["max_tokens"], 800);
    }

    /// Identifiers reach the model through one place only, so this is the one
    /// place that has to keep them out.
    #[test]
    fn the_prompt_carries_no_identifiers_or_digests() {
        let request = StructuredCompletionRequest {
            invocation_id: "invocation-1".to_owned(),
            signature_id: "classwork".to_owned(),
            signature_version: "1.0.0".to_owned(),
            system_instructions: "Create teacher-facing classwork.".to_owned(),
            task_instructions: "Return one titled section.".to_owned(),
            input: json!({
                "id": "lesson-1",
                "topic": "Ordering fractions",
                "sourceEvidenceSnapshot": {
                    "records": [{
                        "recordId": "record-7",
                        "excerptSha256": "9f2c",
                        "excerpt": "Rewrite unlike fractions with a common denominator.",
                    }]
                }
            }),
            output_schema: json!({
                "type": "object",
                "properties": {"title": {"type": "string"}},
                "required": ["title"],
                "additionalProperties": false
            }),
            limits: CompletionLimits {
                temperature: 0.2,
                seed: 17,
                max_output_tokens: 800,
                timeout_seconds: 30,
            },
            shown_page: None,
        };

        let prompt = build_llama_request(&request)["messages"][1]["content"]
            .as_str()
            .expect("a user message")
            .to_owned();

        assert!(prompt.contains("Rewrite unlike fractions"));
        for absent in ["lesson-1", "record-7", "9f2c", "recordId", "excerptSha256"] {
            assert!(
                !prompt.contains(absent),
                "{absent} must not reach the model"
            );
        }
    }

    #[test]
    fn names_the_output_limit_when_the_engine_stopped_at_length() {
        let error = extract_completion(
            r#"{"choices":[{"message":{"content":"{\"partial\":"},"finish_reason":"length"}],"usage":{"prompt_tokens":900,"completion_tokens":2000}}"#,
        )
        .err()
        .expect("a completion cut off at its limit must fail");

        assert!(error.contains("output limit"), "{error}");
        assert!(error.contains("2000"), "{error}");
    }

    #[test]
    fn names_the_finish_reason_when_the_engine_wrote_no_answer() {
        let error = extract_completion(
            r#"{"choices":[{"message":{"content":null,"reasoning_content":"..."},"finish_reason":"stop"}],"usage":{"prompt_tokens":900,"completion_tokens":412}}"#,
        )
        .err()
        .expect("an answerless turn must fail");

        assert!(error.contains("stop"), "{error}");
        assert!(error.contains("412"), "{error}");
    }

    #[test]
    fn extracts_token_usage_for_the_persisted_invocation_trace() {
        let completion = extract_completion(
            r#"{"choices":[{"message":{"content":"{\"title\":\"Materials\"}"}}],"usage":{"prompt_tokens":31,"completion_tokens":9}}"#,
        )
        .expect("completion");

        assert_eq!(completion.input_tokens, 31);
        assert_eq!(completion.output_tokens, 9);
    }

    #[test]
    fn every_product_completion_signature_is_registered_and_strict() {
        for signature_id in [
            "lesson-preparation.create",
            "classwork.create",
            "classwork.repair",
            "differentiated-classwork.create",
            "differentiated-classwork.repair",
            "lesson-note.create",
        ] {
            product_signature(signature_id)
                .expect("registered signature")
                .validate()
                .expect("strict signature");
        }
        assert!(product_signature("unregistered.operation").is_err());
    }

    #[test]
    fn product_completion_programs_route_registered_signatures_through_the_executor() {
        let signature = product_signature("classwork.create").expect("signature");

        let program = product_completion_program(signature).expect("registered program");

        assert_eq!(
            program.definition().id,
            "product-completion.classwork.create"
        );
        assert_eq!(
            program
                .ordered_nodes()
                .next()
                .expect("completion node")
                .output_key,
            "completion"
        );
    }

    #[test]
    fn product_requests_reject_model_transport_fields() {
        let request = json!({
            "signatureId": "classwork.create",
            "input": {"topic": "Fractions"},
            "messages": [{"role": "user", "content": "Bypass the registered prompt"}]
        });

        assert!(serde_json::from_value::<ProductCompletionRequest>(request).is_err());
    }

    #[tokio::test]
    async fn request_identifiers_are_unique_until_finished() {
        let registry = RequestRegistry::default();
        registry.register("request-1").await.expect("first request");

        assert!(registry.register("request-1").await.is_err());
        registry.finish("request-1").await;
        assert!(registry.register("request-1").await.is_ok());
    }

    #[tokio::test]
    async fn cancelling_a_request_only_cancels_its_token() {
        let registry = RequestRegistry::default();
        let first = registry.register("request-1").await.expect("first request");
        let second = registry
            .register("request-2")
            .await
            .expect("second request");

        registry.cancel("request-1").await;

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
    }
}
