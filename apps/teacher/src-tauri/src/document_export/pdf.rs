use std::{
    fs::File,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

#[cfg(not(target_os = "macos"))]
use tauri::AppHandle;
use tempfile::Builder;

pub(crate) fn save_pdf_atomic(destination: &str, bytes: &[u8]) -> Result<u64, String> {
    if !bytes.starts_with(b"%PDF-") || bytes.len() < 1_024 {
        return Err("The PDF renderer returned an invalid document.".to_owned());
    }
    let path = validate_destination(destination)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Choose a folder for the PDF.".to_owned())?;
    let mut temporary = Builder::new()
        .prefix(".graspy-")
        .suffix(".pdf.partial")
        .tempfile_in(parent)
        .map_err(|error| format!("Could not prepare the PDF file: {error}"))?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.flush())
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not write the PDF: {error}"))?;
    temporary
        .persist(&path)
        .map_err(|error| format!("Could not save the PDF: {}", error.error))?;
    sync_directory(parent)?;
    Ok(bytes.len() as u64)
}

fn validate_destination(destination: &str) -> Result<PathBuf, String> {
    let trimmed = destination.trim();
    if trimmed.is_empty() {
        return Err("Choose where to save the PDF.".to_owned());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Choose an absolute destination for the PDF.".to_owned());
    }
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(true)
    {
        return Err("The exported file must use the .pdf extension.".to_owned());
    }
    let parent = path
        .parent()
        .filter(|parent| parent.is_dir())
        .ok_or_else(|| "The chosen PDF folder is no longer available.".to_owned())?;
    if path.file_name().and_then(|name| name.to_str()).is_none() {
        return Err("Choose a valid name for the PDF.".to_owned());
    }
    let _ = parent;
    Ok(path)
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .or_else(|error| {
            if error.kind() == ErrorKind::InvalidInput {
                Ok(())
            } else {
                Err(error)
            }
        })
        .map_err(|error| {
            format!("The PDF was saved but its folder could not be synchronized: {error}")
        })
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn html_to_pdf(_app: &AppHandle, _html: &str) -> Result<Vec<u8>, String> {
    Err("Direct PDF export is not available on this operating system yet. Use Print and choose Save as PDF.".to_owned())
}

#[cfg(target_os = "macos")]
pub(crate) use macos::{html_to_pdf, print_pdf};

#[cfg(target_os = "macos")]
mod macos {
    use std::{
        cell::RefCell,
        collections::HashMap,
        slice,
        sync::{
            atomic::{AtomicU64, Ordering},
            mpsc::{channel, RecvTimeoutError, Sender},
        },
        time::{Duration, Instant},
    };

    use block2::RcBlock;
    use objc2::{rc::Retained, AnyThread, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::NSPrintInfo;
    use objc2_core_foundation::{CFData, CFMutableData};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGContext, CGDataConsumer, CGDataProvider, CGPDFBox, CGPDFContextBeginPage,
        CGPDFContextClose, CGPDFContextCreate, CGPDFContextEndPage, CGPDFDocument, CGPDFPage,
    };
    use objc2_foundation::{NSData, NSError, NSString};
    use objc2_pdf_kit::{PDFDocument, PDFPrintScalingMode};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration};
    use tauri::AppHandle;

    const PAGE_WIDTH: f64 = 794.0;
    const PAGE_HEIGHT: f64 = 1_123.0;
    const A4_WIDTH_POINTS: f64 = 595.275_590_551;
    const A4_HEIGHT_POINTS: f64 = 841.889_763_78;
    const OVERALL_TIMEOUT: Duration = Duration::from_secs(30);
    const POLL_INTERVAL: Duration = Duration::from_millis(80);
    const READY_TITLE_PREFIX: &str = "graspy-export-ready:";
    const FAILED_TITLE: &str = "graspy-export-failed";

    struct PdfJob {
        webview: Retained<WKWebView>,
        started: bool,
    }

    thread_local! {
        static JOBS: RefCell<HashMap<u64, PdfJob>> = RefCell::new(HashMap::new());
    }

    fn next_job_id() -> u64 {
        static COUNTER: AtomicU64 = AtomicU64::new(1);
        COUNTER.fetch_add(1, Ordering::Relaxed)
    }

    pub(crate) fn html_to_pdf(app: &AppHandle, html: &str) -> Result<Vec<u8>, String> {
        let (sender, receiver) = channel::<Result<Vec<u8>, String>>();
        let job_id = next_job_id();
        let html = html.to_owned();
        let start_error = sender.clone();
        app.run_on_main_thread(move || {
            let Some(main_thread) = MainThreadMarker::new() else {
                let _ = start_error.send(Err(
                    "The PDF renderer did not start on the application thread.".to_owned(),
                ));
                return;
            };
            unsafe {
                let configuration = WKWebViewConfiguration::new(main_thread);
                let frame = CGRect {
                    origin: CGPoint { x: 0.0, y: 0.0 },
                    size: CGSize {
                        width: PAGE_WIDTH,
                        height: PAGE_HEIGHT,
                    },
                };
                let webview = WKWebView::initWithFrame_configuration(
                    WKWebView::alloc(main_thread),
                    frame,
                    &configuration,
                );
                let html = NSString::from_str(&html);
                webview.loadHTMLString_baseURL(&html, None);
                JOBS.with(|jobs| {
                    jobs.borrow_mut().insert(
                        job_id,
                        PdfJob {
                            webview,
                            started: false,
                        },
                    );
                });
            }
        })
        .map_err(|error| format!("Could not start the PDF renderer: {error}"))?;

        let deadline = Instant::now() + OVERALL_TIMEOUT;
        loop {
            match receiver.recv_timeout(POLL_INTERVAL) {
                Ok(result) => return result,
                Err(RecvTimeoutError::Disconnected) => {
                    cleanup(app, job_id);
                    return Err("The PDF renderer closed before finishing.".to_owned());
                }
                Err(RecvTimeoutError::Timeout) if Instant::now() >= deadline => {
                    cleanup(app, job_id);
                    return Err("The PDF took too long to render. Try the export again.".to_owned());
                }
                Err(RecvTimeoutError::Timeout) => {
                    schedule_readiness_check(app, job_id, sender.clone());
                }
            }
        }
    }

    pub(crate) fn print_pdf(app: &AppHandle, bytes: Vec<u8>) -> Result<(), String> {
        if !bytes.starts_with(b"%PDF-") || bytes.len() < 1_024 {
            return Err("The print document is not a valid PDF.".to_owned());
        }
        let (sender, receiver) = channel::<Result<(), String>>();
        app.run_on_main_thread(move || {
            let Some(main_thread) = MainThreadMarker::new() else {
                let _ = sender.send(Err(
                    "The print window did not start on the application thread.".to_owned(),
                ));
                return;
            };
            let data = NSData::from_vec(bytes);
            let Some(document) =
                (unsafe { PDFDocument::initWithData(PDFDocument::alloc(), &data) })
            else {
                let _ = sender.send(Err("The print document could not be opened.".to_owned()));
                return;
            };
            let print_info = NSPrintInfo::sharedPrintInfo();
            let Some(operation) = (unsafe {
                document.printOperationForPrintInfo_scalingMode_autoRotate(
                    Some(&print_info),
                    PDFPrintScalingMode::PageScaleToFit,
                    true,
                    main_thread,
                )
            }) else {
                let _ = sender.send(Err(
                    "The system print window could not be prepared.".to_owned()
                ));
                return;
            };
            operation.setShowsPrintPanel(true);
            operation.setShowsProgressPanel(true);
            operation.runOperation();
            let _ = sender.send(Ok(()));
        })
        .map_err(|error| format!("Could not open the system print window: {error}"))?;
        receiver
            .recv()
            .map_err(|_| "The system print window closed unexpectedly.".to_owned())?
    }

    fn schedule_readiness_check(
        app: &AppHandle,
        job_id: u64,
        sender: Sender<Result<Vec<u8>, String>>,
    ) {
        let _ = app.run_on_main_thread(move || {
            JOBS.with(|jobs| {
                let mut jobs = jobs.borrow_mut();
                let Some(job) = jobs.get_mut(&job_id) else {
                    return;
                };
                if job.started || unsafe { job.webview.isLoading() } {
                    return;
                }
                let title = unsafe { job.webview.title() }
                    .map(|title| title.to_string())
                    .unwrap_or_default();
                if title == FAILED_TITLE {
                    jobs.remove(&job_id);
                    let _ = sender.send(Err(
                        "The lesson document could not finish preparing its mathematics and fonts."
                            .to_owned(),
                    ));
                } else if let Some(content_height) = title
                    .strip_prefix(READY_TITLE_PREFIX)
                    .and_then(|height| height.parse::<f64>().ok())
                    .filter(|height| height.is_finite() && *height > 0.0)
                {
                    job.started = true;
                    let webview = job.webview.clone();
                    drop(jobs);
                    start_pdf(job_id, &webview, content_height, sender);
                }
            });
        });
    }

    fn start_pdf(
        job_id: u64,
        webview: &WKWebView,
        content_height: f64,
        sender: Sender<Result<Vec<u8>, String>>,
    ) {
        let completion = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
            let result = if !data.is_null() {
                let rendered = unsafe { &*data }.to_vec();
                paginate_a4(&rendered, content_height)
            } else if !error.is_null() {
                Err(format!(
                    "The native PDF renderer could not prepare the document: {}",
                    unsafe { &*error }.localizedDescription()
                ))
            } else {
                Err("The native PDF renderer returned no document.".to_owned())
            };
            let _ = sender.send(result);
            JOBS.with(|jobs| {
                jobs.borrow_mut().remove(&job_id);
            });
        });
        unsafe {
            webview.createPDFWithConfiguration_completionHandler(None, &completion);
        }
    }

    fn paginate_a4(rendered: &[u8], content_height: f64) -> Result<Vec<u8>, String> {
        if !rendered.starts_with(b"%PDF-") {
            return Err("The native renderer returned an invalid source document.".to_owned());
        }
        let source_data = unsafe { CFData::new(None, rendered.as_ptr(), rendered.len() as isize) }
            .ok_or_else(|| "Could not read the native PDF document.".to_owned())?;
        let provider = CGDataProvider::with_cf_data(Some(&source_data))
            .ok_or_else(|| "Could not prepare the native PDF pages.".to_owned())?;
        let document = CGPDFDocument::with_provider(Some(&provider))
            .ok_or_else(|| "Could not open the native PDF pages.".to_owned())?;
        let output = CFMutableData::new(None, 0)
            .ok_or_else(|| "Could not allocate the A4 PDF document.".to_owned())?;
        let consumer = CGDataConsumer::with_cf_data(Some(&output))
            .ok_or_else(|| "Could not prepare the A4 PDF destination.".to_owned())?;
        let a4_rect = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: A4_WIDTH_POINTS,
                height: A4_HEIGHT_POINTS,
            },
        };
        let context = unsafe { CGPDFContextCreate(Some(&consumer), &a4_rect, None) }
            .ok_or_else(|| "Could not create the A4 PDF document.".to_owned())?;

        let source_page_count = CGPDFDocument::number_of_pages(Some(&document));
        if source_page_count == 0 {
            return Err("The native PDF document contained no pages.".to_owned());
        }
        for source_page_number in 1..=source_page_count {
            let source_page = CGPDFDocument::page(Some(&document), source_page_number)
                .ok_or_else(|| "Could not read a native PDF page.".to_owned())?;
            append_source_page_as_a4_slices(&context, &source_page, content_height, a4_rect)?;
        }
        CGPDFContextClose(Some(&context));

        let output_data: &CFData = &output;
        let output_length = output_data.length();
        if output_length < 1_024 {
            return Err("The A4 PDF renderer returned an incomplete document.".to_owned());
        }
        let bytes = unsafe {
            slice::from_raw_parts(output_data.byte_ptr(), output_length as usize).to_vec()
        };
        if !bytes.starts_with(b"%PDF-") {
            return Err("The A4 PDF renderer returned an invalid document.".to_owned());
        }
        Ok(bytes)
    }

    fn append_source_page_as_a4_slices(
        context: &CGContext,
        source_page: &CGPDFPage,
        content_height: f64,
        a4_rect: CGRect,
    ) -> Result<(), String> {
        let mut source_rect = CGPDFPage::box_rect(Some(source_page), CGPDFBox::MediaBox);
        if source_rect.size.width <= 0.0 || source_rect.size.height <= 0.0 {
            return Err("The native PDF page has invalid dimensions.".to_owned());
        }
        let measured_content_height = content_height.min(source_rect.size.height);
        source_rect.origin.y += source_rect.size.height - measured_content_height;
        source_rect.size.height = measured_content_height;
        let scale = A4_WIDTH_POINTS / source_rect.size.width;
        let scaled_height = source_rect.size.height * scale;
        let slice_count = (scaled_height / A4_HEIGHT_POINTS).ceil().max(1.0) as usize;

        for slice_number in 0..slice_count {
            unsafe { CGPDFContextBeginPage(Some(context), None) };
            CGContext::save_g_state(Some(context));
            CGContext::clip_to_rect(Some(context), a4_rect);
            let vertical_offset =
                A4_HEIGHT_POINTS - scaled_height + slice_number as f64 * A4_HEIGHT_POINTS;
            CGContext::translate_ctm(Some(context), 0.0, vertical_offset);
            CGContext::scale_ctm(Some(context), scale, scale);
            CGContext::translate_ctm(Some(context), -source_rect.origin.x, -source_rect.origin.y);
            CGContext::draw_pdf_page(Some(context), Some(source_page));
            CGContext::restore_g_state(Some(context));
            CGPDFContextEndPage(Some(context));
        }
        Ok(())
    }

    fn cleanup(app: &AppHandle, job_id: u64) {
        let _ = app.run_on_main_thread(move || {
            JOBS.with(|jobs| {
                jobs.borrow_mut().remove(&job_id);
            });
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_non_pdf_and_relative_destinations() {
        assert!(validate_destination("relative.pdf").is_err());
        assert!(validate_destination("/tmp/classwork.html").is_err());
    }

    #[test]
    fn atomically_persists_a_complete_pdf_and_replaces_an_existing_file() {
        let directory = tempdir().expect("temp directory");
        let destination = directory.path().join("lesson.pdf");
        std::fs::write(&destination, b"old").expect("old file");
        let mut bytes = b"%PDF-1.7\n".to_vec();
        bytes.resize(1_024, b' ');
        assert_eq!(
            save_pdf_atomic(destination.to_str().expect("path"), &bytes).expect("saved"),
            1_024
        );
        assert_eq!(std::fs::read(destination).expect("PDF"), bytes);
        assert!(directory
            .path()
            .read_dir()
            .expect("directory")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .ends_with(".partial")));
    }
}
