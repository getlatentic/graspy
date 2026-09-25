# Lesson material export and print

## User contract

Only an approved lesson-material document can be exported. The teacher chooses the
original materials or one completed teaching group's materials and then chooses one
of two explicit copies:

- **Students** is the safe default and excludes solutions and lesson connections.
- **Teacher, with answers** includes solutions, learning-goal connections, and source
  notes needed for review and delivery.

The preview, saved PDF, and printed document are representations of the same selected
copy. Preparing a preview does not grant permission to save or print it later: each
native operation reloads and re-authorizes the active academic context, immutable
lesson version, current approved document version, and selected completed group from
SQLite. A stale preview therefore cannot export superseded or unapproved wording.

## Application boundary

`document_export::service` owns document assembly. It accepts a
`PrepareLessonMaterialExportRequest`, loads the approved material aggregate through
the lesson-material and differentiated-material application contracts, resolves
trusted local figures, and produces a presentation-independent export document.
Tauri commands are adapters around this service; the domain does not depend on a
window, save dialog, WebKit, PDFKit, or a model server.

The frontend gateway exposes three deliberate operations:

1. prepare the selected document for the paper preview;
2. choose a destination and save an authorized PDF; and
3. open the native print window for a newly authorized document.

The export dialog models preparing, ready, saving, printing, saved, and failed as
separate states. Closing the save dialog is cancellation, not failure. Invalid or
changed source state fails visibly in teacher language; there is no cached-success or
browser-print fallback.

## Self-contained document

Rust renders a complete HTML document with a restrictive content-security policy.
It embeds the exact Nunito font, KaTeX runtime, KaTeX stylesheet, mathematics fonts,
and authorized local figures as data URLs. No network request is needed to prepare,
save, or print a document. Markdown is converted with raw HTML disabled, links are
restricted to approved source notes, and figure bytes are accepted only after the
existing filename and SHA-256 trust checks.

The A4 layout has stable running headers and footers, teacher-facing section names,
print-safe block boundaries, and source attribution. Readiness is signalled only after
fonts and mathematics have finished rendering. A renderer failure or timeout is
returned to the teacher instead of producing a partial file.

## Native PDF and print pipeline

On the current macOS product target, an isolated `WKWebView` renders the self-contained
document as a vector PDF. The renderer reports measured content height; Core Graphics
then slices and normalizes the result into true 595.276 by 841.890 point A4 pages. This
normalization prevents trailing blank pages and makes the Save PDF and Print paths use
the same page geometry.

Saving validates an absolute `.pdf` destination, writes into a temporary file in the
chosen folder, flushes and synchronizes it, and atomically persists it under the final
name. A failed write cannot replace an existing destination with a partial document.

Printing keeps the A4 bytes in memory, opens them as a PDFKit `PDFDocument`, and runs an
AppKit `NSPrintOperation` with the system print panel and fit-to-page scaling. The
command remains in the printing state until the teacher prints or dismisses the native
panel. JavaScript `window.print()` is not part of the product path because WebView
printing does not provide a reliable native Tauri contract.

Other operating systems return an explicit unsupported-platform error at the command
boundary until an equivalent native adapter is qualified; they do not silently open a
different document or report success.

## Verification contract

Export changes require domain and gateway tests, TypeScript and Rust checks, a
production frontend build, and native runtime evidence. At minimum, evidence must
include:

- searchable student and teacher PDFs with true A4 media boxes;
- proof that student copies exclude answers and teacher-only connections;
- rendered page inspection for every generated page;
- the real system print panel displaying the generated document; and
- 320, 375, 414, 768, and desktop-width dialog checks with no horizontal overflow.
