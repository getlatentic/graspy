//! Bringing in a lesson plan a teacher already has.
//!
//! The point is narrow on purpose: get the words out of the file and hand them
//! to the same place a paste goes. Everything after that — reading the plan,
//! preparing it, reviewing and confirming — is the path that already exists and
//! is already trusted. Import that grew its own flow would be a second thing to
//! keep correct for no gain.
//!
//! Both readers are lightweight by choice, and each states its own boundary:
//! the Word side reads the document body only, and the PDF side reads an
//! embedded text layer without reconstructing layout. Heavier options exist in
//! Rust — the `docling` crate and Xberg both do model-backed layout, table
//! reconstruction and OCR — and both would add PDFium, ONNX Runtime and model
//! assets to a bundle that already carries a 2.8 GB model.
//!
//! The trade holds while the requirement is what it is: fill the same plain-text
//! box a paste fills, with the teacher reading it before anything is built. It
//! stops holding the moment a real teacher document comes out wrong, which is
//! why extraction sits behind one function per format and the failing file
//! should become the test case.

mod docx;
mod pdf;
mod photograph;

pub(crate) mod commands;

pub use commands::{
    can_read_a_lesson_plan_photograph, import_lesson_plan_document,
    read_lesson_plan_photograph, stop_reading_lesson_plan_photograph,
};
pub(crate) use photograph::IMAGE_TOKEN_BUDGET;

/// The largest document worth opening. A lesson plan is a few pages; anything
/// far larger is a different kind of file, and reading it would stall the app
/// before failing anyway.
const LARGEST_DOCUMENT_BYTES: u64 = 25 * 1024 * 1024;

/// What a teacher gets back: the words, and the file they came from so the
/// screen can say what was read.
#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportedLessonPlan {
    pub file_name: String,
    pub text: String,
}

/// What a teacher gets back from a photograph: the words, and the page they
/// were read off.
///
/// The page comes back because two written words in three survive the reading,
/// and nobody can correct a word whose source they cannot see. It travels with
/// the answer rather than being loaded from disk afterwards, so what the screen
/// shows is the image the words were read from.
#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlanPhotograph {
    pub file_name: String,
    pub text: String,
    /// The page as a data URL, sized to sit beside the words on screen.
    pub page: String,
}

/// The document kinds worth reading, decided by extension because that is what
/// the file picker filters on and what a teacher recognises.
#[derive(Debug)]
enum DocumentKind {
    Word,
    Pdf,
}

impl DocumentKind {
    fn of(path: &std::path::Path) -> Result<Self, String> {
        match path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref()
        {
            Some("docx") => Ok(DocumentKind::Word),
            Some("pdf") => Ok(DocumentKind::Pdf),
            _ => Err(
                "graspy reads Word documents (.docx) and PDFs. For anything else, copy the lesson and paste it instead."
                    .to_owned(),
            ),
        }
    }
}

/// The file the teacher picked, refused if it is far larger than a lesson plan.
pub(crate) fn bytes_of(path: &std::path::Path, too_large: &str) -> Result<Vec<u8>, String> {
    let size = std::fs::metadata(path)
        .map_err(|_| "That file could not be opened. Check it is still where it was.".to_owned())?
        .len();
    if size > LARGEST_DOCUMENT_BYTES {
        return Err(too_large.to_owned());
    }
    std::fs::read(path)
        .map_err(|_| "That file could not be read. Check it is still where it was.".to_owned())
}

/// The name the screen says the lesson was read from.
pub(crate) fn name_of(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("the chosen file")
        .to_owned()
}

/// Reads a lesson plan out of a file the teacher chose.
pub(crate) fn read_plan_document(path: &std::path::Path) -> Result<ImportedLessonPlan, String> {
    let kind = DocumentKind::of(path)?;
    let bytes = bytes_of(
        path,
        "That file is too large to be a lesson plan. Open it, copy the lesson, and paste it instead.",
    )?;

    let text = match kind {
        DocumentKind::Word => docx::extract_text(&bytes)?,
        DocumentKind::Pdf => pdf::extract_text(&bytes)?,
    };
    if text.trim().is_empty() {
        return Err(
            "There were no words to read in that file. Type or paste the lesson instead."
                .to_owned(),
        );
    }

    Ok(ImportedLessonPlan {
        file_name: name_of(path),
        text,
    })
}

/// Tidies what extraction produced without rewriting it.
///
/// Both formats leave artefacts of how the page was laid out rather than what
/// was written: trailing spaces where a line ended, and runs of blank lines
/// where a page broke. Collapsing those is presentation, not interpretation —
/// no word is changed, reordered or dropped.
fn tidy_extracted_text(text: &str) -> String {
    let normalised = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines: Vec<&str> = Vec::new();
    for line in normalised.lines() {
        let trimmed = line.trim_end();
        // One blank line separates paragraphs; more is page furniture.
        if trimmed.is_empty() && lines.last().is_some_and(|last| last.is_empty()) {
            continue;
        }
        lines.push(trimmed);
    }
    lines.join("\n").trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tidying_collapses_page_furniture_without_touching_the_words() {
        let extracted = "Ordering fractions   \r\n\r\n\r\n\r\nGoal: compare halves  \n\nStep 1\n";
        assert_eq!(
            tidy_extracted_text(extracted),
            "Ordering fractions\n\nGoal: compare halves\n\nStep 1",
        );
    }

    #[test]
    fn a_file_kind_graspy_does_not_read_says_what_to_do_instead() {
        let error = DocumentKind::of(std::path::Path::new("plan.pages")).expect_err("refused");
        assert!(error.contains("paste"), "unexpected: {error}");
    }

    #[test]
    fn the_extension_decides_the_kind_whatever_its_case() {
        assert!(matches!(
            DocumentKind::of(std::path::Path::new("Plan.DOCX")),
            Ok(DocumentKind::Word),
        ));
        assert!(matches!(
            DocumentKind::of(std::path::Path::new("plan.Pdf")),
            Ok(DocumentKind::Pdf),
        ));
    }
}
