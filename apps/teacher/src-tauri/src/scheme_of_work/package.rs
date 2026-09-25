use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::academic_workspace::domain::AcademicPeriodKind;
use crate::content_rights::{ContentRightsBasis, ContentRightsKind};

use super::domain::{
    clean_list, normalize_display, optional_text, required_list, required_text, SchemeWeekKind,
};

const MAX_PACKAGE_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEEKS: usize = 31;
const MAX_ENTRIES_PER_WEEK: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PackageTrust {
    Verified,
    School,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ValidatedSchemePackage {
    pub payload: SchemePackagePayload,
    pub payload_sha256: String,
    pub trust: PackageTrust,
    pub signer_key_id: Option<String>,
    pub payload_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SchemePackagePayload {
    pub package_id: String,
    pub title: String,
    pub publisher: String,
    pub jurisdiction: String,
    pub edition: String,
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_sha256: Option<String>,
    #[serde(default)]
    pub dataset_sha256: Option<String>,
    #[serde(default)]
    pub licence: Option<SchemePackageLicence>,
    #[serde(default)]
    pub rights_basis: Option<ContentRightsBasis>,
    #[serde(default)]
    pub attribution: Option<String>,
    #[serde(default)]
    pub modification_notice: Option<String>,
    pub subject: String,
    pub grade_level_code: String,
    #[serde(default)]
    pub curriculum_package_id: Option<String>,
    #[serde(default)]
    pub curriculum_course_key: Option<String>,
    #[serde(default)]
    pub term: Option<LegacyPackageTerm>,
    #[serde(default)]
    pub period: Option<SchemePackagePeriod>,
    pub weeks: Vec<SchemePackageWeek>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SchemePackageLicence {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub(super) enum LegacyPackageTerm {
    First,
    Second,
    Third,
}

impl LegacyPackageTerm {
    fn number(self) -> i64 {
        match self {
            Self::First => 1,
            Self::Second => 2,
            Self::Third => 3,
        }
    }
}

impl SchemePackagePayload {
    pub fn academic_period(&self) -> &SchemePackagePeriod {
        self.period
            .as_ref()
            .expect("validated scheme packages always contain an academic period")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SchemePackagePeriod {
    pub ordinal: i64,
    pub kind: AcademicPeriodKind,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SchemePackageWeek {
    pub ordinal: i64,
    pub kind: SchemeWeekKind,
    pub title: Option<String>,
    pub entries: Vec<SchemePackageEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SchemePackageEntry {
    pub sequence: i64,
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_unit: String,
    #[serde(default)]
    pub curriculum_node_code: Option<String>,
    #[serde(default)]
    pub objective_codes: Vec<String>,
    #[serde(default)]
    pub source_record_ids: Vec<String>,
    pub learning_outcomes: Vec<String>,
    pub objectives: Vec<String>,
    pub assessment: Vec<String>,
    /// A scheme package is a file a ministry writes and signs, so its published
    /// key is not this code's to rename.
    #[serde(rename = "materials")]
    pub instructional_materials: Vec<String>,
    pub notes: Option<String>,
}

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

pub(super) fn validate_package_with_key_lookup<F>(
    package_contents: &str,
    key_lookup: F,
) -> Result<ValidatedSchemePackage, String>
where
    F: Fn(&str) -> Option<[u8; 32]>,
{
    if package_contents.len() > MAX_PACKAGE_BYTES {
        return Err("The scheme file is larger than the 2 MB limit.".to_owned());
    }
    let envelope: PackageEnvelope = serde_json::from_str(package_contents)
        .map_err(|_| "This is not a valid Graspy scheme file.".to_owned())?;
    if !matches!(envelope.schema_version, 1..=3) {
        return Err("This scheme file uses an unsupported format version.".to_owned());
    }
    let payload_bytes = STANDARD
        .decode(&envelope.payload)
        .map_err(|_| "The scheme file content is damaged.".to_owned())?;
    if payload_bytes.len() > MAX_PACKAGE_BYTES {
        return Err("The scheme file content is larger than the 2 MB limit.".to_owned());
    }
    let payload_json = String::from_utf8(payload_bytes.clone())
        .map_err(|_| "The scheme file content is not valid text.".to_owned())?;
    let payload: SchemePackagePayload = serde_json::from_str(&payload_json)
        .map_err(|_| "The scheme file content does not match the supported format.".to_owned())?;
    let payload = validate_payload(payload, envelope.schema_version)?;

    let (trust, signer_key_id) = match envelope.signature {
        None => (PackageTrust::School, None),
        Some(signature) => {
            if signature.algorithm != "Ed25519" {
                return Err("This scheme file uses an unsupported signature.".to_owned());
            }
            let key_id = required_text(&signature.key_id, "signing key", 120)?;
            let key_bytes = key_lookup(&key_id).ok_or_else(|| {
                "This signed scheme file is not from a publisher trusted by this Graspy release."
                    .to_owned()
            })?;
            let verifying_key = VerifyingKey::from_bytes(&key_bytes)
                .map_err(|_| "The trusted publisher key is invalid.".to_owned())?;
            let signature_bytes = STANDARD
                .decode(signature.value)
                .map_err(|_| "The scheme file signature is damaged.".to_owned())?;
            let signature = Signature::from_slice(&signature_bytes)
                .map_err(|_| "The scheme file signature is damaged.".to_owned())?;
            verifying_key
                .verify(&payload_bytes, &signature)
                .map_err(|_| "The scheme file signature does not match its content.".to_owned())?;
            (PackageTrust::Verified, Some(key_id))
        }
    };

    let payload_sha256 = format!("{:x}", Sha256::digest(&payload_bytes));
    Ok(ValidatedSchemePackage {
        payload,
        payload_sha256,
        trust,
        signer_key_id,
        payload_json,
    })
}

pub(super) fn validate_package(package_contents: &str) -> Result<ValidatedSchemePackage, String> {
    validate_package_with_key_lookup(package_contents, trusted_issuer_key)
}

fn trusted_issuer_key(_key_id: &str) -> Option<[u8; 32]> {
    // Publisher keys are release-controlled. An empty registry means no file can be
    // presented as verified until its publisher and distribution rights are confirmed.
    None
}

fn validate_payload(
    mut payload: SchemePackagePayload,
    schema_version: i64,
) -> Result<SchemePackagePayload, String> {
    payload.package_id = required_text(&payload.package_id, "package identifier", 160)?;
    if !payload
        .package_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_'))
    {
        return Err(
            "The scheme package identifier may only use letters, numbers, dots, dashes and underscores."
                .to_owned(),
        );
    }
    payload.title = required_text(&payload.title, "scheme title", 160)?;
    payload.publisher = required_text(&payload.publisher, "publisher", 120)?;
    payload.jurisdiction = required_text(&payload.jurisdiction, "jurisdiction", 120)?;
    payload.edition = required_text(&payload.edition, "edition", 80)?;
    payload.source_url = optional_text(payload.source_url.as_deref(), 500)?;
    if payload
        .source_url
        .as_deref()
        .is_some_and(|uri| !uri.starts_with("https://") && !uri.starts_with("http://"))
    {
        return Err("The scheme source must be an http or https address.".to_owned());
    }
    validate_provenance(&mut payload, schema_version)?;
    payload.subject = required_text(&payload.subject, "subject", 120)?;
    payload.grade_level_code = required_text(&payload.grade_level_code, "class code", 40)?;
    payload.period = match schema_version {
        1 => {
            if payload.period.is_some() {
                return Err(
                    "A version 1 scheme file cannot contain an academic period object.".to_owned(),
                );
            }
            let term = payload
                .term
                .ok_or_else(|| "A version 1 scheme file must identify its term.".to_owned())?;
            Some(SchemePackagePeriod {
                ordinal: term.number(),
                kind: AcademicPeriodKind::Term,
                name: match term {
                    LegacyPackageTerm::First => "First term",
                    LegacyPackageTerm::Second => "Second term",
                    LegacyPackageTerm::Third => "Third term",
                }
                .to_owned(),
            })
        }
        2 | 3 => {
            if payload.term.is_some() {
                return Err("This scheme file must use the academic period object.".to_owned());
            }
            let mut period = payload.period.take().ok_or_else(|| {
                "This scheme file does not identify its academic period.".to_owned()
            })?;
            if !(1..=12).contains(&period.ordinal) {
                return Err(
                    "The scheme academic period number must be between 1 and 12.".to_owned(),
                );
            }
            period.name = required_text(&period.name, "academic period name", 80)?;
            Some(period)
        }
        _ => unreachable!("schema version checked before payload validation"),
    };
    payload.term = None;
    if payload.weeks.is_empty() || payload.weeks.len() > MAX_WEEKS {
        return Err("A scheme file must contain between 1 and 31 consecutive weeks.".to_owned());
    }

    for (week_index, week) in payload.weeks.iter_mut().enumerate() {
        let expected_ordinal = (week_index + 1) as i64;
        if week.ordinal != expected_ordinal {
            return Err("Scheme week numbers must be consecutive and start at 1.".to_owned());
        }
        week.title = optional_text(week.title.as_deref(), 100)?;
        if schema_version < 3
            && matches!(week.kind, SchemeWeekKind::Revision | SchemeWeekKind::Test)
        {
            return Err(
                "Revision and test weeks require version 3 of the scheme format.".to_owned(),
            );
        }
        if week.kind != SchemeWeekKind::Teaching {
            if week.title.is_none() {
                return Err("Non-teaching weeks must have a name.".to_owned());
            }
            if !week.entries.is_empty() {
                return Err("A non-teaching week cannot contain teaching plans.".to_owned());
            }
        }
        if week.entries.len() > MAX_ENTRIES_PER_WEEK {
            return Err("A scheme week cannot contain more than 20 plans.".to_owned());
        }
        for (entry_index, entry) in week.entries.iter_mut().enumerate() {
            if entry.sequence != (entry_index + 1) as i64 {
                return Err(
                    "Plan numbers within each week must be consecutive and start at 1.".to_owned(),
                );
            }
            entry.topic = required_text(&entry.topic, "topic", 160)?;
            entry.subtopic = optional_text(entry.subtopic.as_deref(), 160)?;
            entry.curriculum_unit = required_text(&entry.curriculum_unit, "curriculum unit", 160)?;
            validate_entry_references(entry, schema_version)?;
            entry.learning_outcomes =
                required_list(&entry.learning_outcomes, "learning outcome", 12, 500)?;
            entry.objectives = required_list(&entry.objectives, "objective", 12, 500)?;
            entry.assessment = required_list(&entry.assessment, "assessment item", 12, 500)?;
            entry.instructional_materials =
                clean_list(&entry.instructional_materials, "material", 20, 200)?;
            entry.notes = optional_text(entry.notes.as_deref(), 2_000)?;
        }
    }
    payload.grade_level_code = normalize_display(&payload.grade_level_code).to_uppercase();
    Ok(payload)
}

fn validate_provenance(
    payload: &mut SchemePackagePayload,
    schema_version: i64,
) -> Result<(), String> {
    if schema_version < 3 {
        if payload.source_sha256.is_some()
            || payload.dataset_sha256.is_some()
            || payload.licence.is_some()
            || payload.rights_basis.is_some()
            || payload.attribution.is_some()
            || payload.modification_notice.is_some()
            || payload.curriculum_package_id.is_some()
            || payload.curriculum_course_key.is_some()
        {
            return Err("An older scheme file contains version 3 source fields.".to_owned());
        }
        return Ok(());
    }
    if payload.source_url.is_none() {
        return Err("A version 3 scheme file must identify its source address.".to_owned());
    }
    payload.source_sha256 = Some(sha256(
        payload
            .source_sha256
            .as_deref()
            .ok_or_else(|| "A version 3 scheme file must contain its source digest.".to_owned())?,
        "source digest",
    )?);
    payload.dataset_sha256 = Some(sha256(
        payload
            .dataset_sha256
            .as_deref()
            .ok_or_else(|| "A version 3 scheme file must contain its dataset digest.".to_owned())?,
        "dataset digest",
    )?);
    let rights_basis = payload
        .rights_basis
        .take()
        .ok_or_else(|| "A version 3 scheme file must identify its rights basis.".to_owned())?
        .validate()?;
    match rights_basis.kind {
        ContentRightsKind::Licence => {
            let licence = payload.licence.as_mut().ok_or_else(|| {
                "A scheme distributed under a licence must identify that licence.".to_owned()
            })?;
            licence.id = identifier(&licence.id, "licence identifier", 120)?;
            licence.name = required_text(&licence.name, "licence name", 200)?;
            licence.url = http_url(&licence.url, "licence address")?;
            if rights_basis.name != licence.name || rights_basis.url != licence.url {
                return Err("The scheme rights basis must match its named licence.".to_owned());
            }
        }
        _ if payload.licence.is_some() => {
            return Err("A scheme without a licence must not contain a licence object.".to_owned())
        }
        _ => {}
    }
    payload.rights_basis = Some(rights_basis);
    payload.attribution = Some(required_text(
        payload
            .attribution
            .as_deref()
            .ok_or_else(|| "A version 3 scheme file must contain its attribution.".to_owned())?,
        "attribution",
        2_000,
    )?);
    payload.modification_notice = Some(required_text(
        payload.modification_notice.as_deref().ok_or_else(|| {
            "A version 3 scheme file must contain its modification notice.".to_owned()
        })?,
        "modification notice",
        2_000,
    )?);
    payload.curriculum_package_id = Some(identifier(
        payload.curriculum_package_id.as_deref().ok_or_else(|| {
            "A version 3 scheme file must identify its curriculum package.".to_owned()
        })?,
        "curriculum package identifier",
        160,
    )?);
    payload.curriculum_course_key = Some(identifier(
        payload.curriculum_course_key.as_deref().ok_or_else(|| {
            "A version 3 scheme file must identify its curriculum course.".to_owned()
        })?,
        "curriculum course identifier",
        120,
    )?);
    Ok(())
}

fn validate_entry_references(
    entry: &mut SchemePackageEntry,
    schema_version: i64,
) -> Result<(), String> {
    if schema_version < 3 {
        if entry.curriculum_node_code.is_some()
            || !entry.objective_codes.is_empty()
            || !entry.source_record_ids.is_empty()
        {
            return Err("An older scheme entry contains version 3 curriculum links.".to_owned());
        }
        return Ok(());
    }
    entry.curriculum_node_code = Some(identifier(
        entry.curriculum_node_code.as_deref().ok_or_else(|| {
            "A version 3 scheme entry must identify its curriculum entry.".to_owned()
        })?,
        "curriculum entry code",
        160,
    )?);
    validate_unique_identifiers(&mut entry.objective_codes, "learning objective code", 160)?;
    validate_unique_identifiers(
        &mut entry.source_record_ids,
        "source record identifier",
        160,
    )
}

fn validate_unique_identifiers(
    values: &mut [String],
    label: &str,
    max_chars: usize,
) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for value in values {
        *value = identifier(value, label, max_chars)?;
        if !seen.insert(value.clone()) {
            return Err(format!(
                "Each {label} may appear only once in a scheme entry."
            ));
        }
    }
    Ok(())
}

fn identifier(value: &str, label: &str, max_chars: usize) -> Result<String, String> {
    let value = required_text(value, label, max_chars)?;
    if !value.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ':')
    }) {
        return Err(format!(
            "The {label} may only use letters, numbers, dots, dashes, underscores and colons."
        ));
    }
    Ok(value)
}

fn sha256(value: &str, label: &str) -> Result<String, String> {
    if value.len() != 64
        || !value
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
    {
        return Err(format!("The {label} must be a lowercase SHA-256 value."));
    }
    Ok(value.to_owned())
}

fn http_url(value: &str, label: &str) -> Result<String, String> {
    let value = required_text(value, label, 1_000)?;
    if !value.starts_with("https://") && !value.starts_with("http://") {
        return Err(format!("The {label} must be an http or https address."));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;

    use crate::academic_workspace::domain::AcademicPeriodKind;

    use super::{validate_package_with_key_lookup, PackageTrust, SchemeWeekKind};

    fn payload_value() -> serde_json::Value {
        json!({
            "packageId": "school.maths-jss2-first",
            "title": "Mathematics · JSS 2 · First term",
            "publisher": "Example School",
            "jurisdiction": "Lagos State, Nigeria",
            "edition": "2026",
            "sourceUrl": null,
            "subject": "Mathematics",
            "gradeLevelCode": "JSS2",
            "term": "first",
            "weeks": [
                {
                    "ordinal": 1,
                    "kind": "teaching",
                    "title": "Whole numbers",
                    "entries": [
                        {
                            "sequence": 1,
                            "topic": "Whole numbers",
                            "subtopic": "Place value",
                            "curriculumUnit": "Number and numeration",
                            "learningOutcomes": ["Represent whole numbers."],
                            "objectives": ["Identify place values."],
                            "assessment": ["Complete an exit ticket."],
                            "materials": ["Place-value chart"],
                            "notes": null
                        }
                    ]
                },
                {
                    "ordinal": 2,
                    "kind": "break",
                    "title": "Mid-term break",
                    "entries": []
                }
            ]
        })
    }

    fn payload() -> String {
        payload_value().to_string()
    }

    fn envelope(payload: &str, signature: Option<serde_json::Value>) -> String {
        envelope_for_version(1, payload, signature)
    }

    fn envelope_for_version(
        schema_version: i64,
        payload: &str,
        signature: Option<serde_json::Value>,
    ) -> String {
        json!({
            "schemaVersion": schema_version,
            "payload": STANDARD.encode(payload.as_bytes()),
            "signature": signature
        })
        .to_string()
    }

    #[test]
    fn accepts_an_unsigned_school_package_without_calling_it_verified() {
        let package = validate_package_with_key_lookup(&envelope(&payload(), None), |_| None)
            .expect("school package");

        assert_eq!(package.trust, PackageTrust::School);
        assert_eq!(package.payload.weeks.len(), 2);
        assert_eq!(package.payload_sha256.len(), 64);
    }

    #[test]
    fn accepts_a_quarter_in_the_generalized_package_format() {
        let mut changed = payload_value();
        changed
            .as_object_mut()
            .expect("package payload object")
            .remove("term");
        changed["period"] = json!({
            "ordinal": 3,
            "kind": "quarter",
            "name": "Third quarter"
        });
        let package = validate_package_with_key_lookup(
            &envelope_for_version(2, &changed.to_string(), None),
            |_| None,
        )
        .expect("quarter package");

        assert_eq!(package.payload.academic_period().ordinal, 3);
        assert_eq!(
            package.payload.academic_period().kind,
            AcademicPeriodKind::Quarter
        );
        assert!(package.payload.term.is_none());
    }

    #[test]
    fn accepts_version_three_provenance_and_stable_curriculum_links() {
        let mut changed = payload_value();
        changed
            .as_object_mut()
            .expect("package payload object")
            .remove("term");
        changed["sourceUrl"] = json!("https://example.edu/pacing.pdf");
        changed["sourceSha256"] = json!("1".repeat(64));
        changed["datasetSha256"] = json!("2".repeat(64));
        changed["rightsBasis"] = json!({
            "kind": "officialText",
            "name": "Official administrative text",
            "statement": "Redistribution basis recorded for an official administrative text.",
            "url": "https://example.edu/copyright-act"
        });
        changed["attribution"] = json!("Example Curriculum Office, official scheme text.");
        changed["modificationNotice"] = json!("Converted to consecutive weekly plans.");
        changed["curriculumPackageId"] = json!("example.ng-maths-jss2");
        changed["curriculumCourseKey"] = json!("mathematics-jss2");
        changed["period"] = json!({
            "ordinal": 1,
            "kind": "term",
            "name": "First term"
        });
        changed["weeks"][0]["entries"][0]["curriculumNodeCode"] = json!("subtopic-1");
        changed["weeks"][0]["entries"][0]["objectiveCodes"] = json!(["objective-1"]);
        changed["weeks"][0]["entries"][0]["sourceRecordIds"] = json!(["siyavula-record-1"]);
        changed["weeks"][1]["kind"] = json!("test");
        changed["weeks"][1]["title"] = json!("Mid-term test");

        let package = validate_package_with_key_lookup(
            &envelope_for_version(3, &changed.to_string(), None),
            |_| None,
        )
        .expect("version 3 package");

        assert_eq!(
            package.payload.curriculum_course_key.as_deref(),
            Some("mathematics-jss2")
        );
        assert_eq!(package.payload.weeks[1].kind, SchemeWeekKind::Test);
        assert_eq!(
            package.payload.weeks[0].entries[0]
                .curriculum_node_code
                .as_deref(),
            Some("subtopic-1")
        );
    }

    #[test]
    fn verifies_a_signature_only_with_a_trusted_issuer_key() {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let payload = payload();
        let signature = signing_key.sign(payload.as_bytes());
        let signature = json!({
            "algorithm": "Ed25519",
            "keyId": "test-school",
            "value": STANDARD.encode(signature.to_bytes())
        });
        let package =
            validate_package_with_key_lookup(&envelope(&payload, Some(signature)), |key_id| {
                (key_id == "test-school").then(|| signing_key.verifying_key().to_bytes())
            })
            .expect("verified package");

        assert_eq!(package.trust, PackageTrust::Verified);
        assert_eq!(package.signer_key_id.as_deref(), Some("test-school"));
    }

    #[test]
    fn rejects_a_signature_from_an_unknown_issuer() {
        let signing_key = SigningKey::from_bytes(&[9_u8; 32]);
        let payload = payload();
        let signature = json!({
            "algorithm": "Ed25519",
            "keyId": "unknown-publisher",
            "value": STANDARD.encode(signing_key.sign(payload.as_bytes()).to_bytes())
        });

        let error =
            validate_package_with_key_lookup(&envelope(&payload, Some(signature)), |_| None)
                .expect_err("unknown issuer");

        assert!(error.contains("not from a publisher trusted"));
    }

    #[test]
    fn rejects_non_consecutive_week_numbers() {
        let mut changed = payload_value();
        changed["weeks"][1]["ordinal"] = json!(3);
        let changed = changed.to_string();
        let error = validate_package_with_key_lookup(&envelope(&changed, None), |_| None)
            .expect_err("invalid week order");

        assert!(error.contains("consecutive"));
    }

    #[test]
    fn rejects_teaching_content_inside_a_break_week() {
        let mut changed = payload_value();
        changed["weeks"][1]["entries"] = changed["weeks"][0]["entries"].clone();
        let changed = changed.to_string();
        let error = validate_package_with_key_lookup(&envelope(&changed, None), |_| None)
            .expect_err("break content");

        assert!(error.contains("non-teaching week"));
    }
}
