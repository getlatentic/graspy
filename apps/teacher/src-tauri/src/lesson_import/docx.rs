//! Reading the body text of a Word document.
//!
//! This is a deliberately narrow extractor, not a DOCX reader. A .docx is an
//! Open Packaging Convention zip, and this reads exactly one part of it —
//! `word/document.xml`, where the body lives. Within that part `<w:t>` carries
//! characters, `<w:p>` ends a paragraph, and `<w:br>` and `<w:tab>` are breaks
//! the teacher typed. Table cells come out in document order, which is how a
//! teacher reads their own plan when the sequence is laid out in a table.
//!
//! What it does NOT read, stated because a teacher whose plan keeps something
//! there would otherwise get a quiet omission: headers, footers, footnotes,
//! endnotes, comments and text boxes are separate parts of the package and do
//! not appear. Nor do fields, which carry their last computed value rather than
//! text. The import screen therefore asks the teacher to check what was read
//! before building anything from it.
//!
//! That trade is worth making while the requirement is only to fill the same
//! plain-text box a paste fills. A full reader — `docx-rust` for a structured
//! model, or the Rust `docling` crate for document understanding — is the move
//! if real teacher documents turn out to keep the lesson somewhere else.

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;

/// Where a Word document keeps the text a teacher typed.
const DOCUMENT_PART: &str = "word/document.xml";

pub(super) fn extract_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| {
        "This does not look like a Word document. Save it as .docx and try again.".to_owned()
    })?;
    let mut document = archive.by_name(DOCUMENT_PART).map_err(|_| {
        "This Word document has no readable text part. Open it in Word, save it again as .docx, and try again."
            .to_owned()
    })?;
    let mut xml = String::new();
    document.read_to_string(&mut xml).map_err(|_| {
        "This Word document could not be read. Save it again as .docx and try again.".to_owned()
    })?;
    Ok(text_from_document_xml(&xml))
}

/// Walks the document body once, keeping characters and the breaks between
/// them. Paragraphs are joined with newlines and runs within a paragraph are
/// joined with nothing, because Word splits a single word across runs whenever
/// its formatting changes mid-word.
fn text_from_document_xml(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    let mut buffer = Vec::new();
    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut inside_text = false;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) => match local_name(element.name().as_ref()) {
                b"t" => inside_text = true,
                b"tab" => current.push('\t'),
                _ => {}
            },
            Ok(Event::End(element)) => match local_name(element.name().as_ref()) {
                b"t" => inside_text = false,
                b"p" => paragraphs.push(std::mem::take(&mut current)),
                _ => {}
            },
            Ok(Event::Empty(element)) => match local_name(element.name().as_ref()) {
                b"br" | b"cr" => current.push('\n'),
                b"tab" => current.push('\t'),
                _ => {}
            },
            Ok(Event::Text(text)) if inside_text => {
                current.push_str(&text.decode().unwrap_or_default());
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    if !current.trim().is_empty() {
        paragraphs.push(current);
    }
    super::tidy_extracted_text(&paragraphs.join("\n"))
}

/// Word namespaces every element (`w:t`); the prefix is not what identifies it.
fn local_name(name: &[u8]) -> &[u8] {
    match name.iter().position(|byte| *byte == b':') {
        Some(colon) => &name[colon + 1..],
        None => name,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_paragraphs_runs_and_breaks_as_a_teacher_typed_them() {
        // A word split across runs by mid-word formatting, a line break, a tab
        // and two paragraphs — all of which Word produces routinely.
        let xml = r#"<?xml version="1.0"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>Order</w:t></w:r><w:r><w:t>ing fractions</w:t></w:r></w:p>
            <w:p><w:r><w:t>Goal:</w:t></w:r><w:r><w:tab/><w:t>compare halves</w:t><w:br/><w:t>and quarters</w:t></w:r></w:p>
          </w:body>
        </w:document>"#;

        assert_eq!(
            text_from_document_xml(xml),
            "Ordering fractions\nGoal:\tcompare halves\nand quarters",
        );
    }

    #[test]
    fn keeps_the_reading_order_of_a_plan_laid_out_in_a_table() {
        let xml = r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:tbl><w:tr>
            <w:tc><w:p><w:r><w:t>Step 1</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Recall equal parts</w:t></w:r></w:p></w:tc>
          </w:tr></w:tbl></w:body>
        </w:document>"#;

        assert_eq!(text_from_document_xml(xml), "Step 1\nRecall equal parts");
    }

    /// The tests above exercise the XML walk. This one goes through the zip as
    /// well, because a .docx is a container and reading the container is half
    /// of what can go wrong.
    #[test]
    fn reads_a_real_docx_container_end_to_end() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let mut buffer = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buffer));
            writer
                .start_file("word/document.xml", SimpleFileOptions::default())
                .expect("document part");
            writer
                .write_all(
                    br#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body>
                        <w:p><w:r><w:t>Ordering fractions</w:t></w:r></w:p>
                        <w:p><w:r><w:t>Compare halves and quarters.</w:t></w:r></w:p>
                      </w:body>
                    </w:document>"#,
                )
                .expect("document xml");
            writer.finish().expect("finished archive");
        }

        assert_eq!(
            extract_text(&buffer).expect("a readable Word document"),
            "Ordering fractions\nCompare halves and quarters.",
        );
    }

    #[test]
    fn a_zip_without_a_document_part_is_told_apart_from_a_file_that_is_not_a_docx() {
        use zip::write::SimpleFileOptions;

        let mut buffer = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buffer));
            writer
                .start_file("notes.txt", SimpleFileOptions::default())
                .expect("some other part");
            writer.finish().expect("finished archive");
        }

        let error = extract_text(&buffer).expect_err("refused");
        assert!(
            error.contains("no readable text part"),
            "a zip that is not a Word document gets its own explanation: {error}",
        );
    }

    #[test]
    fn a_file_that_is_not_a_word_document_is_refused_in_words_a_teacher_can_act_on() {
        let error = extract_text(b"This is a plain text file, not a zip.").expect_err("refused");
        assert!(error.contains(".docx"), "unexpected: {error}");
    }
}
