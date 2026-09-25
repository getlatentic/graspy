use serde::Serialize;

pub use crate::model_catalogue::{ModelFile, ModelManifest};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum InstallationState {
    Absent,
    Partial,
    Installed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelInstallationSnapshot {
    pub state: InstallationState,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub artifact_license: &'static str,
    pub artifact_license_url: &'static str,
    pub upstream_terms_url: &'static str,
}

impl ModelInstallationSnapshot {
    /// How far one of a model's files has got. The licence is the model's and
    /// the same for every file it needs; the size is the file's own.
    pub fn new(
        state: InstallationState,
        downloaded_bytes: u64,
        manifest: ModelManifest,
        file: ModelFile,
    ) -> Self {
        Self {
            state,
            downloaded_bytes,
            total_bytes: file.byte_size,
            artifact_license: manifest.artifact_license,
            artifact_license_url: manifest.artifact_license_url,
            upstream_terms_url: manifest.upstream_terms_url,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AcquisitionPhase {
    Downloading,
    Importing,
    Verifying,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionProgress {
    pub request_id: String,
    pub phase: AcquisitionPhase,
    pub processed_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionError {
    pub code: &'static str,
    pub message: String,
}

impl AcquisitionError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn cancelled() -> Self {
        Self::new(
            "cancelled",
            "Setup was stopped. You can continue when ready.",
        )
    }
}

impl std::fmt::Display for AcquisitionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for AcquisitionError {}
