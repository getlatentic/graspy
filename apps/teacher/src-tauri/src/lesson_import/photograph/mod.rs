//! Reading a lesson plan off a photograph of the page it is written on.
//!
//! The words go where a paste goes: into the box the teacher reads and corrects
//! before anything is built. That is the whole product rule here, and it is why
//! this asks the engine to copy the page rather than to fill in a lesson. Asked
//! for a lesson's fields instead, the same engine on the same photographs
//! selects and tidies rather than copies, and loses half the writing doing it.
//!
//! It also does not run as a generation program. A program earns its keep with
//! a contract to validate against and a repair to spend when the answer fails
//! it, and a transcription has neither: there is nothing to check the words
//! against except the page, which is what the teacher is for.

mod bands;

use image::DynamicImage;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::generation_program::domain::{
    CompletionLimits, ShownPage, StructuredCompletionPort, StructuredCompletionRequest,
};

pub(crate) use bands::IMAGE_TOKEN_BUDGET;

const COPYING_A_PAGE: &str = concat!(
    "You transcribe a photographed page of a teacher's handwritten lesson plan. ",
    "You copy what is written. You do not summarise, expand, correct or reorder it."
);

/// Plainer wordings read more of the page than insistent ones. Told as well to
/// leave no line out, to treat headings as lines, and to guess at a word rather
/// than drop its line, the same engine on the same bands read twelve points
/// less of one of the photographed plans and four less of the other.
const COPY_THIS_PART: &str = concat!(
    "Copy every line of handwriting visible in this photograph, in the order it is ",
    "written down the page. Keep each written line as one line. Copy the words as ",
    "they are written, including abbreviations and headings. If a line runs off the ",
    "edge of the photograph, copy the part you can see."
);

/// What a teacher who stopped a reading is told, in place of half a page.
const STOPPED: &str = "Reading the page was stopped.";

/// The page, copied out.
///
/// One call per band, in the order they run down the page, so the writing comes
/// back in the order it was written.
pub(crate) async fn copy_out_page<P: StructuredCompletionPort>(
    port: &P,
    request_id: &str,
    page: &DynamicImage,
    cancellation: CancellationToken,
) -> Result<String, String> {
    let mut written: Vec<String> = Vec::new();
    for band in bands::bands(page) {
        if cancellation.is_cancelled() {
            return Err(STOPPED.to_owned());
        }
        let completion = port
            .complete(copy_out(request_id, &band)?, cancellation.clone())
            .await
            .map_err(|failure| failure.diagnostics.join(" "))?;
        written.extend(lines_in(&completion.output_text)?);
    }
    Ok(written.join("\n"))
}

fn copy_out(request_id: &str, band: &DynamicImage) -> Result<StructuredCompletionRequest, String> {
    Ok(StructuredCompletionRequest {
        invocation_id: request_id.to_owned(),
        signature_id: "lesson-plan.photograph".to_owned(),
        signature_version: "1".to_owned(),
        system_instructions: COPYING_A_PAGE.to_owned(),
        task_instructions: COPY_THIS_PART.to_owned(),
        input: json!({}),
        output_schema: page_lines_schema(),
        limits: CompletionLimits {
            temperature: 0.1,
            seed: 17,
            // Half again what the densest band of the photographed plans needed,
            // which is room to finish without room to loop.
            max_output_tokens: 1_100,
            timeout_seconds: 180,
        },
        shown_page: Some(ShownPage {
            data_url: as_data_url(band)?,
        }),
    })
}

/// One line of the page per string, which is the shape that stops the engine
/// running two written lines together or writing a block out twice.
fn page_lines_schema() -> Value {
    json!({
        "type": "object",
        "properties": {"lines": {"type": "array", "items": {"type": "string"}}},
        "required": ["lines"],
        "additionalProperties": false,
    })
}

fn lines_in(answer: &str) -> Result<Vec<String>, String> {
    #[derive(serde::Deserialize)]
    struct Copied {
        lines: Vec<String>,
    }
    serde_json::from_str::<Copied>(answer)
        .map(|copied| copied.lines)
        .map_err(|_| "Part of that page could not be read. Try photographing it again.".to_owned())
}

/// The widest the page is shown at beside the words. A screen half given over
/// to a photograph is narrower than this on the densest display graspy runs on.
const SHOWN_WIDTH: u32 = 1_400;

/// The page at the size it is shown beside the words it was read from.
pub(crate) fn as_shown(page: &DynamicImage) -> Result<String, String> {
    let shown = if page.width() > SHOWN_WIDTH {
        let height = page.height() * SHOWN_WIDTH / page.width();
        page.resize_exact(SHOWN_WIDTH, height.max(1), image::imageops::FilterType::Lanczos3)
    } else {
        page.clone()
    };
    as_data_url(&shown)
}

/// A band in the form the engine reads an image from.
fn as_data_url(band: &DynamicImage) -> Result<String, String> {
    use base64::Engine as _;
    let mut jpeg = std::io::Cursor::new(Vec::new());
    band.to_rgb8()
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut jpeg, 92,
        ))
        .map_err(|_| "That photograph could not be prepared for reading.".to_owned())?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg.into_inner())
    ))
}

/// The photograph the teacher chose, the way up they took it.
///
/// A phone records which way it was held rather than rotating the pixels, so a
/// page photographed in portrait arrives on its side unless that is applied.
pub(crate) fn photograph_in(bytes: &[u8]) -> Result<DynamicImage, String> {
    let unreadable = || "That photograph could not be opened. Try taking it again.".to_owned();
    let mut decoder = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| unreadable())?
        .into_decoder()
        .map_err(|_| unreadable())?;
    let the_way_up = image::ImageDecoder::orientation(&mut decoder).map_err(|_| unreadable())?;
    let mut page = DynamicImage::from_decoder(decoder).map_err(|_| unreadable())?;
    page.apply_orientation(the_way_up);
    Ok(page)
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use image::{Rgb, RgbImage};

    use crate::generation_program::domain::{CompletionFailure, StructuredCompletion};

    use super::*;

    /// An engine that answers with one line naming the band it was shown, so a
    /// test can see how the page was cut and how the answers were joined.
    #[derive(Default)]
    struct EngineThatWasShown {
        shown: Mutex<Vec<StructuredCompletionRequest>>,
    }

    impl StructuredCompletionPort for EngineThatWasShown {
        fn model_identity(&self) -> &str {
            "test-engine"
        }

        async fn complete(
            &self,
            request: StructuredCompletionRequest,
            _cancellation: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            let mut shown = self.shown.lock().expect("the shown bands");
            let line = format!("band {}", shown.len() + 1);
            shown.push(request);
            Ok(StructuredCompletion {
                output_text: json!({"lines": [line]}).to_string(),
                model_identity: "test-engine".to_owned(),
                input_tokens: 0,
                output_tokens: 0,
            })
        }
    }

    fn a_written_page() -> DynamicImage {
        let mut page = RgbImage::from_pixel(1920, 2560, Rgb([255, 255, 255]));
        for (row, pixel) in page
            .enumerate_rows_mut()
            .flat_map(|(row, pixels)| pixels.map(move |(_, _, pixel)| (row, pixel)))
        {
            if row % 60 < 30 {
                *pixel = Rgb([20, 20, 20]);
            }
        }
        DynamicImage::ImageRgb8(page)
    }

    #[tokio::test]
    async fn the_page_comes_back_in_the_order_it_was_read() {
        let engine = EngineThatWasShown::default();

        let written = copy_out_page(&engine, "request-1", &a_written_page(), CancellationToken::new())
            .await
            .expect("a page is read");

        let shown = engine.shown.lock().expect("the shown bands");
        assert!(shown.len() > 1, "a page of this size is read in bands");
        assert_eq!(
            written,
            (1..=shown.len())
                .map(|band| format!("band {band}"))
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }

    /// The page is what makes this a reading rather than a guess, and every band
    /// of it is asked for under the same instructions.
    #[tokio::test]
    async fn every_band_is_shown_as_well_as_asked_about() {
        let engine = EngineThatWasShown::default();

        copy_out_page(&engine, "request-1", &a_written_page(), CancellationToken::new())
            .await
            .expect("a page is read");

        for request in engine.shown.lock().expect("the shown bands").iter() {
            let page = request.shown_page.as_ref().expect("a band to read");
            assert!(page.data_url.starts_with("data:image/jpeg;base64,"));
            assert_eq!(request.task_instructions, COPY_THIS_PART);
            assert_eq!(request.output_schema, page_lines_schema());
        }
    }

    #[tokio::test]
    async fn a_reading_the_teacher_stopped_does_not_come_back_half_read() {
        let engine = EngineThatWasShown::default();
        let stopped = CancellationToken::new();
        stopped.cancel();

        let read = copy_out_page(&engine, "request-1", &a_written_page(), stopped).await;

        assert_eq!(read.err().as_deref(), Some(STOPPED));
    }
}
