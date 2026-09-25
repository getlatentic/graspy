use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

mod content_validation;
mod field_format;
mod model;
mod validation;

use field_format::required_text;
use model::CurriculumPackagePayload;
use validation::validate_payload;

pub(in crate::curriculum_catalog) use model::{
    CurriculumPackageCourse, CurriculumSourceTargetKind, PackageTrust, ValidatedCurriculumPackage,
};

const MAX_PACKAGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageEnvelope {
    schema_version: i64,
    payload: String,
    signature: Option<PackageSignature>,
}

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageSignature {
    algorithm: String,
    key_id: String,
    value: String,
}

pub(in crate::curriculum_catalog) fn validate_package(
    package_contents: &str,
) -> Result<ValidatedCurriculumPackage, String> {
    validate_package_with_key_lookup(package_contents, trusted_issuer_key)
}

fn trusted_issuer_key(_key_id: &str) -> Option<[u8; 32]> {
    None
}

fn validate_package_with_key_lookup<F>(
    package_contents: &str,
    key_lookup: F,
) -> Result<ValidatedCurriculumPackage, String>
where
    F: Fn(&str) -> Option<[u8; 32]>,
{
    if package_contents.len() > MAX_PACKAGE_BYTES {
        return Err("The curriculum file is larger than the 8 MB limit.".to_owned());
    }
    let envelope: PackageEnvelope = serde_json::from_str(package_contents)
        .map_err(|_| "This is not a valid Graspy curriculum file.".to_owned())?;
    if !matches!(envelope.schema_version, 1 | 2) {
        return Err("This curriculum file uses an unsupported format version.".to_owned());
    }
    let payload_bytes = STANDARD
        .decode(&envelope.payload)
        .map_err(|_| "The curriculum file content is damaged.".to_owned())?;
    if payload_bytes.len() > MAX_PACKAGE_BYTES {
        return Err("The curriculum file content is larger than the 8 MB limit.".to_owned());
    }
    let payload_json = String::from_utf8(payload_bytes.clone())
        .map_err(|_| "The curriculum file content is not valid text.".to_owned())?;
    let payload: CurriculumPackagePayload = serde_json::from_str(&payload_json).map_err(|_| {
        "The curriculum file content does not match the supported format.".to_owned()
    })?;
    let payload = validate_payload(payload, envelope.schema_version)?;

    let (trust, signer_key_id) = match envelope.signature {
        None => (PackageTrust::School, None),
        Some(signature) => {
            if signature.algorithm != "Ed25519" {
                return Err("This curriculum file uses an unsupported signature.".to_owned());
            }
            let key_id = required_text(&signature.key_id, "signing key", 120)?;
            let key_bytes = key_lookup(&key_id).ok_or_else(|| {
                "This signed curriculum file is not from a publisher trusted by this Graspy release."
                    .to_owned()
            })?;
            let verifying_key = VerifyingKey::from_bytes(&key_bytes)
                .map_err(|_| "The trusted publisher key is invalid.".to_owned())?;
            let signature_bytes = STANDARD
                .decode(signature.value)
                .map_err(|_| "The curriculum file signature is damaged.".to_owned())?;
            let signature = Signature::from_slice(&signature_bytes)
                .map_err(|_| "The curriculum file signature is damaged.".to_owned())?;
            verifying_key
                .verify(&payload_bytes, &signature)
                .map_err(|_| {
                    "The curriculum file signature does not match its content.".to_owned()
                })?;
            (PackageTrust::Verified, Some(key_id))
        }
    };

    Ok(ValidatedCurriculumPackage {
        payload,
        payload_sha256: format!("{:x}", Sha256::digest(&payload_bytes)),
        payload_json,
        trust,
        signer_key_id,
    })
}

#[cfg(test)]
pub(in crate::curriculum_catalog) fn test_school_package_payload() -> serde_json::Value {
    serde_json::json!({
        "packageId": "school.ng-maths-jss1",
        "title": "Mathematics JSS 1 curriculum",
        "publisher": "Example Curriculum Office",
        "countryCode": "NG",
        "jurisdictionCode": "NG",
        "edition": "2026",
        "effectiveFrom": "2026-09-01",
        "effectiveTo": null,
        "sourceUrl": "https://example.edu/curriculum.pdf",
        "sourceSha256": "1111111111111111111111111111111111111111111111111111111111111111",
        "licence": {
            "id": "CC-BY-4.0",
            "name": "Creative Commons Attribution 4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/",
            "attribution": "Example Curriculum Office, CC BY 4.0."
        },
        "modificationNotice": "Converted to the Graspy package structure without changing source wording.",
        "framework": {
            "name": "Example Basic Education Curriculum",
            "authority": "Example Curriculum Office"
        },
        "nodeKinds": ["theme", "topic"],
        "courses": [{
            "courseKey": "mathematics-jss1",
            "title": "Mathematics · JSS 1",
            "subject": "Mathematics",
            "gradeSystemCode": "NG-BASIC-SECONDARY",
            "gradeSystemVersion": "1",
            "gradeLevelCode": "JSS1",
            "nodes": [
                {"code": "TH-1", "parentCode": null, "kind": "theme", "title": "Number", "statement": null, "sequence": 1, "sourcePayload": {}},
                {"code": "TOP-1", "parentCode": "TH-1", "kind": "topic", "title": "Whole numbers", "statement": "Work with whole numbers.", "sequence": 1, "sourcePayload": {"week": 1}}
            ],
            "objectives": [
                {"code": "OBJ-1", "nodeCode": "TOP-1", "statement": "Order whole numbers.", "bloomVerb": "order", "bloomLevel": "apply", "sequence": 1}
            ],
            "knowledgeComponents": [
                {"code": "KC-1", "objectiveCode": "OBJ-1", "description": "Place value", "knowledgeType": "concept"},
                {"code": "KC-2", "objectiveCode": "OBJ-1", "description": "Ordering procedure", "knowledgeType": "procedure"}
            ],
            "prerequisites": [
                {"componentCode": "KC-2", "prerequisiteCode": "KC-1"}
            ]
        }]
    })
}

#[cfg(test)]
pub(in crate::curriculum_catalog) fn test_school_package_contents(
    payload: &serde_json::Value,
) -> String {
    test_package_contents_for_version(payload, 1)
}

#[cfg(test)]
pub(crate) fn test_version_two_package_payload() -> serde_json::Value {
    let mut payload = test_school_package_payload();
    payload["datasetSha256"] = serde_json::json!("2".repeat(64));
    payload.as_object_mut().expect("payload").remove("licence");
    payload["rightsBasis"] = serde_json::json!({
        "kind": "officialText",
        "name": "Official administrative text",
        "statement": "Redistribution basis recorded under the applicable law for official administrative texts.",
        "url": "https://example.edu/copyright-act"
    });
    payload["attribution"] =
        serde_json::json!("Example Curriculum Office, official curriculum text.");
    payload["courses"][0]["sourceLinks"] = serde_json::json!([{
        "targetKind": "objective",
        "targetCode": "OBJ-1",
        "recordId": "siyavula-record-1",
        "role": "instruction",
        "method": "judgment",
        "rationale": "Explains the objective directly.",
        "sequence": 1
    }]);
    payload["courses"][0]["uncoveredObjectiveCodes"] = serde_json::json!([]);
    for component in payload["courses"][0]["knowledgeComponents"]
        .as_array_mut()
        .expect("knowledge components")
    {
        component
            .as_object_mut()
            .expect("component")
            .remove("objectiveCode");
        component["nodeCode"] = serde_json::json!("TOP-1");
        component["objectiveCodes"] = serde_json::json!(["OBJ-1"]);
        component["bloomLevel"] = serde_json::json!("apply");
    }
    payload["integrity"] = serde_json::json!({
        "themes": 1,
        "topics": 1,
        "subtopics": 0,
        "performanceObjectives": 0,
        "atomicObjectives": 1,
        "knowledgeComponents": 2,
        "sourceLinks": 1,
        "atomicObjectivesWithSources": 1,
        "atomicObjectivesWithoutSources": 0,
        "subtopicsWithSources": 0,
        "subtopicsWithoutSources": 0,
        "linkageStates": {}
    });
    payload
}

#[cfg(test)]
pub(crate) fn test_version_two_package_contents(payload: &serde_json::Value) -> String {
    test_package_contents_for_version(payload, 2)
}

#[cfg(test)]
fn test_package_contents_for_version(payload: &serde_json::Value, schema_version: i64) -> String {
    serde_json::json!({
        "schemaVersion": schema_version,
        "payload": STANDARD.encode(payload.to_string()),
        "signature": null
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use base64::engine::general_purpose::STANDARD;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{json, Value};

    use super::*;

    fn payload_value() -> Value {
        test_school_package_payload()
    }

    fn envelope(payload: &str, signature: Option<Value>) -> String {
        envelope_with_version(payload, signature, 1)
    }

    fn envelope_with_version(
        payload: &str,
        signature: Option<Value>,
        schema_version: i64,
    ) -> String {
        json!({
            "schemaVersion": schema_version,
            "payload": STANDARD.encode(payload.as_bytes()),
            "signature": signature
        })
        .to_string()
    }

    #[test]
    fn validates_a_complete_unsigned_school_curriculum() {
        let payload = payload_value().to_string();
        let package = validate_package_with_key_lookup(&envelope(&payload, None), |_| None)
            .expect("curriculum package");

        assert_eq!(package.trust, PackageTrust::School);
        assert_eq!(package.payload.courses.len(), 1);
        assert_eq!(package.payload.courses[0].nodes.len(), 2);
        assert_eq!(package.payload_sha256.len(), 64);
    }

    #[test]
    fn validates_granular_version_two_alignments_and_integrity() {
        let payload = test_version_two_package_payload().to_string();
        let package =
            validate_package_with_key_lookup(&envelope_with_version(&payload, None, 2), |_| None)
                .expect("version 2 curriculum package");

        let course = &package.payload.courses[0];
        let expected_dataset_digest = "2".repeat(64);
        assert_eq!(
            package.payload.dataset_sha256.as_deref(),
            Some(expected_dataset_digest.as_str())
        );
        assert_eq!(course.source_links.len(), 1);
        assert_eq!(
            course.knowledge_components[0].node_code.as_deref(),
            Some("TOP-1")
        );
        assert_eq!(course.knowledge_components[0].objective_codes, ["OBJ-1"]);
    }

    #[test]
    fn rejects_an_entry_that_precedes_its_parent() {
        let mut payload = payload_value();
        payload["courses"][0]["nodes"]
            .as_array_mut()
            .unwrap()
            .swap(0, 1);
        let error =
            validate_package_with_key_lookup(&envelope(&payload.to_string(), None), |_| None)
                .expect_err("child before parent");

        assert!(error.contains("must follow its parent"));
    }

    #[test]
    fn rejects_a_course_holding_a_goal_nothing_teaches() {
        let mut payload = payload_value();
        payload["courses"][0]["objectives"]
            .as_array_mut()
            .unwrap()
            .push(json!({
                "code": "OBJ-2", "nodeCode": "TOP-1",
                "statement": "Estimate the distances within the school.",
                "bloomVerb": "estimate", "bloomLevel": "apply", "sequence": 2
            }));
        let error =
            validate_package_with_key_lookup(&envelope(&payload.to_string(), None), |_| None)
                .expect_err("a goal no knowledge component reaches");

        assert!(
            error.contains("Estimate the distances within the school."),
            "the refusal names the goal a teacher would recognise: {error}"
        );
        assert!(!error.contains("OBJ-2"), "not by its code: {error}");
    }

    #[test]
    fn accepts_a_course_where_every_goal_is_taught() {
        validate_package_with_key_lookup(&envelope(&payload_value().to_string(), None), |_| None)
            .expect("every goal reached by a knowledge component");
    }

    #[test]
    fn rejects_a_prerequisite_cycle() {
        let mut payload = payload_value();
        payload["courses"][0]["prerequisites"] = json!([
            {"componentCode": "KC-2", "prerequisiteCode": "KC-1"},
            {"componentCode": "KC-1", "prerequisiteCode": "KC-2"}
        ]);
        let error =
            validate_package_with_key_lookup(&envelope(&payload.to_string(), None), |_| None)
                .expect_err("cycle");

        assert!(error.contains("must not contain a cycle"));
    }

    #[test]
    fn rejects_incomplete_provenance() {
        let mut payload = payload_value();
        payload["licence"]["attribution"] = json!("");
        let error =
            validate_package_with_key_lookup(&envelope(&payload.to_string(), None), |_| None)
                .expect_err("missing attribution");

        assert!(error.contains("attribution"));
    }

    #[test]
    fn verifies_only_a_release_trusted_signature() {
        let signing_key = SigningKey::from_bytes(&[17_u8; 32]);
        let payload = payload_value().to_string();
        let signature = json!({
            "algorithm": "Ed25519",
            "keyId": "test-curriculum-office",
            "value": STANDARD.encode(signing_key.sign(payload.as_bytes()).to_bytes())
        });
        let package =
            validate_package_with_key_lookup(&envelope(&payload, Some(signature)), |key_id| {
                (key_id == "test-curriculum-office").then(|| signing_key.verifying_key().to_bytes())
            })
            .expect("verified curriculum package");

        assert_eq!(package.trust, PackageTrust::Verified);
        assert_eq!(
            package.signer_key_id.as_deref(),
            Some("test-curriculum-office")
        );
    }
}
