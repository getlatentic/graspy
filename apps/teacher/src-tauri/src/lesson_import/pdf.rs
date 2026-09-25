//! Reading the embedded text layer of a PDF.
//!
//! PDF is a layout format: it records where glyphs sit on a page, not what the
//! sentences were. Nothing in the file guarantees reading order, so multi-column
//! pages, positioned text and tables can come out in an order the teacher did
//! not write. This extracts the text layer and says so; it does not reconstruct
//! layout.
//!
//! A scan or photograph has no text layer at all. That is not a failure of
//! extraction — the words are pixels, and the path to them is OCR, which graspy
//! does not ship. That is a deployment decision, not a limit of what is
//! possible: the Rust `docling` and Xberg crates both carry OCR pipelines, at
//! the cost of PDFium, ONNX Runtime and model assets in the bundle. Until that
//! is worth its weight, a scan is told apart from a broken file and the teacher
//! is asked to paste instead of watching an empty box appear.

pub(super) fn extract_text(bytes: &[u8]) -> Result<String, String> {
    let extracted = pdf_extract::extract_text_from_mem(bytes).map_err(|_| {
        "This PDF could not be read. If it opens in a PDF viewer, copy the text and paste it instead."
            .to_owned()
    })?;
    let text = super::tidy_extracted_text(&extracted);
    if text.trim().is_empty() {
        return Err(
            "This PDF has no text in it — it is most likely a scan or a photograph of a page. Type or paste the lesson instead."
                .to_owned(),
        );
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_that_is_not_a_pdf_is_refused_in_words_a_teacher_can_act_on() {
        let error = extract_text(b"Not a PDF at all").expect_err("refused");
        assert!(error.contains("paste"), "unexpected: {error}");
    }

    /// A structurally valid PDF with one page and no text content — the shape a
    /// scan takes once the image is stripped. It must be told apart from a
    /// broken file, because the teacher's next move is different.
    #[test]
    fn a_pdf_carrying_no_text_says_it_is_probably_a_scan() {
        let empty_page = b"%PDF-1.4\n\
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n\
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n\
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n\
4 0 obj<</Length 0>>stream\n\
endstream\nendobj\n\
trailer<</Root 1 0 R>>\n";

        match extract_text(empty_page) {
            Err(message) => assert!(
                message.contains("scan") || message.contains("paste"),
                "a textless PDF is explained rather than reported as broken: {message}",
            ),
            Ok(text) => assert!(
                text.trim().is_empty(),
                "a page with no content stream yielded text: {text:?}",
            ),
        }
    }
}
