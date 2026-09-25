use serde::Serialize;

/// Where a model file comes from and how graspy proves it arrived intact.
///
/// Every field is pinned: a revision rather than a branch, and a digest rather
/// than a size alone, so the file a teacher installs today is the file the
/// qualification run was scored against.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct ModelManifest {
    pub id: &'static str,
    pub repository: &'static str,
    pub revision: &'static str,
    pub file_name: &'static str,
    pub byte_size: u64,
    pub sha256: &'static str,
    pub artifact_license: &'static str,
    pub artifact_license_url: &'static str,
    pub upstream_terms_url: &'static str,
    /// The file that lets this model read a photograph, when it can read one.
    ///
    /// It ships beside the weights in the same repository at the same pinned
    /// revision, so it is the copy the weights were published with.
    pub sight: Option<ModelFile>,
}

/// A file a model needs on disk, and what proves it is the right one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ModelFile {
    pub file_name: &'static str,
    pub byte_size: u64,
    pub sha256: &'static str,
}

impl ModelManifest {
    /// The model's own weights, which every model needs and every model has.
    pub fn weights(&self) -> ModelFile {
        ModelFile {
            file_name: self.file_name,
            byte_size: self.byte_size,
            sha256: self.sha256,
        }
    }

    pub fn download_url(&self, file: ModelFile) -> String {
        format!(
            "https://huggingface.co/{}/resolve/{}/{}?download=true",
            self.repository, self.revision, file.file_name
        )
    }
}

/// Whether a model has earned the right to be offered to a teacher.
///
/// Passing means the full packaged case ran through the production prompts and
/// validators and met every scored threshold. A model that has not passed is
/// not offered, because a teacher choosing it would be choosing worse lessons
/// without being told.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Qualification {
    /// Scored against the whole program at this version, with the audit written
    /// up at `evidence`. The version matters: changing the program invalidates
    /// the run, which `every_offered_model_is_qualified_against_this_program`
    /// enforces at build time.
    Passed {
        at_program_version: &'static str,
        evidence: &'static str,
    },
    /// Has not passed. Either the run has not happened or it did not meet the
    /// thresholds; `docs/runtime/` carries the result either way.
    Pending,
}

/// A model a teacher can choose between, in the terms they would choose on.
pub struct LessonModel {
    pub manifest: ModelManifest,
    pub display_name: &'static str,
    pub summary: &'static str,
    pub qualification: Qualification,
}

impl LessonModel {
    pub fn is_offered(&self) -> bool {
        matches!(self.qualification, Qualification::Passed { .. })
    }
}

const STANDARD: LessonModel = LessonModel {
    manifest: ModelManifest {
        id: "gemma-4-e2b-it-q4-0-v1",
        repository: "ggml-org/gemma-4-E2B-it-GGUF",
        revision: "858dcdf955fb1b5a43ed2301aea00362fc443a5c",
        file_name: "gemma-4-E2B-it-Q4_0.gguf",
        byte_size: 2_841_481_184,
        sha256: "8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52",
        artifact_license: "Apache-2.0",
        artifact_license_url: "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF",
        upstream_terms_url: "https://ai.google.dev/gemma/docs/gemma_4_license",
        sight: Some(ModelFile {
            file_name: "mmproj-gemma-4-E2B-it-Q8_0.gguf",
            byte_size: 557_368_064,
            sha256: "9406f99c16d68cda4f1f0552192dcc99021ea1fc6d2fd50b1dc3ccf30d04b292",
        }),
    },
    display_name: "Standard",
    summary: "The fullest lesson quality graspy can produce.",
    qualification: Qualification::Passed {
        at_program_version: "1.14.0",
        evidence: "docs/content/ordering-fractions-gemma-qualification.md",
    },
};

/// The low-memory candidate this exists for: a quarter of the download and a
/// quarter of the memory.
///
/// Not offered, and not a matter of the run not having happened. It failed the
/// packaged case three times over at `assessment-design`, and the cause is the
/// model rather than the prompts: asked plainly to order 8/9, 11/12 and 5/6 it
/// returns them unchanged, and given step-by-step instructions it computes
/// 0.9167 and 0.8889 correctly and then calls the smaller one larger, seven
/// runs in eight. `docs/runtime/lfm2-5-low-spec-qualification.md` has the
/// numbers. It stays in the catalogue because the measurement is worth keeping
/// and the next candidate slots into the same shape.
///
/// Its licence permits redistribution but terminates above a group-revenue
/// threshold, which is why graspy would fetch it on request rather than bundle
/// it, and why the decision was recorded rather than assumed.
const LIGHT: LessonModel = LessonModel {
    manifest: ModelManifest {
        id: "lfm2-5-1-2b-instruct-q4-0-v1",
        repository: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
        revision: "047e06635fbe71469926b35ea414537245218200",
        file_name: "LFM2.5-1.2B-Instruct-Q4_0.gguf",
        byte_size: 695_751_488,
        sha256: "2ea801949d760cdf1a2cc04a54262c22c3c0c54f0769d57760c9adeb0e59233f",
        artifact_license: "LFM Open License v1.0",
        artifact_license_url:
            "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/blob/main/LICENSE",
        upstream_terms_url: "https://www.liquid.ai/lfm-open-license",
        sight: None,
    },
    display_name: "Light",
    summary: "Built for older laptops with less memory to spare.",
    qualification: Qualification::Pending,
};

/// Every model graspy knows how to run, offered or not. The first is what a
/// teacher gets without choosing.
pub const CATALOGUE: &[LessonModel] = &[STANDARD, LIGHT];

pub fn default_model() -> &'static LessonModel {
    &CATALOGUE[0]
}

pub fn find(id: &str) -> Option<&'static LessonModel> {
    CATALOGUE.iter().find(|model| model.manifest.id == id)
}

pub fn offered_models() -> impl Iterator<Item = &'static LessonModel> {
    CATALOGUE.iter().filter(|model| model.is_offered())
}

/// What a teacher is told about one choice. Sizes are bytes so the screen can
/// phrase them; the domain does not decide how a gigabyte is written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonModelChoice {
    pub id: &'static str,
    pub display_name: &'static str,
    pub summary: &'static str,
    pub download_bytes: u64,
    pub memory_required_bytes: u64,
    pub fits_this_machine: bool,
    pub is_installed: bool,
    pub is_selected: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_planning::program::PROGRAM_VERSION;

    /// The qualification scores a model against a specific program. Changing the
    /// program means the score no longer describes what ships, so this fails the
    /// build rather than letting a teacher run an unproven pairing.
    #[test]
    fn every_offered_model_is_qualified_against_this_program() {
        for model in offered_models() {
            let Qualification::Passed {
                at_program_version, ..
            } = model.qualification
            else {
                unreachable!("offered_models yields only qualified models")
            };
            assert_eq!(
                at_program_version, PROGRAM_VERSION,
                "{} was qualified against program {at_program_version}, but {PROGRAM_VERSION} ships. Re-run the qualification.",
                model.display_name,
            );
        }
    }

    #[test]
    fn a_model_that_has_not_passed_is_not_offered() {
        let light = find("lfm2-5-1-2b-instruct-q4-0-v1").expect("in the catalogue");
        assert!(
            !light.is_offered(),
            "Light has not been qualified, so it must not be offered",
        );
    }

    #[test]
    fn manifest_ids_are_unique_because_installations_are_keyed_by_them() {
        let mut seen = std::collections::BTreeSet::new();
        for model in CATALOGUE {
            assert!(
                seen.insert(model.manifest.id),
                "duplicate manifest id {}",
                model.manifest.id,
            );
        }
    }

    #[test]
    fn a_download_url_pins_the_revision_rather_than_a_branch() {
        let manifest = default_model().manifest;
        let url = manifest.download_url(manifest.weights());
        assert!(
            url.contains("858dcdf955fb1b5a43ed2301aea00362fc443a5c"),
            "unexpected: {url}",
        );
        assert!(!url.contains("/main/"), "a branch would move: {url}");
    }
}
