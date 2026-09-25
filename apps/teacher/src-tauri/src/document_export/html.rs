use std::fmt::Write;

use comrak::{markdown_to_html, Options};

use super::{assets, domain::ExportCopy};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExportDocument {
    pub title: String,
    pub subject: String,
    pub grade: String,
    pub subtopic: Option<String>,
    pub session: String,
    pub term: String,
    pub prepared_on: String,
    pub copy: ExportCopy,
    pub classwork_label: String,
    pub learning_goals: Vec<String>,
    pub sections: Vec<ExportSection>,
    pub sources: Vec<ExportSource>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExportSection {
    pub sequence: i64,
    pub step_title: String,
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<ExportBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExportBlock {
    pub kind: String,
    pub text: String,
    pub learning_goal_numbers: Vec<i64>,
    pub source_material_keys: Vec<String>,
    pub figures: Vec<ExportFigure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExportFigure {
    pub data_url: String,
    pub caption: String,
    pub alt_text: String,
    pub width_px: i64,
    pub height_px: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExportSource {
    pub key: String,
    pub title: String,
    pub publisher: String,
    pub source_url: String,
    pub licence_name: String,
    pub licence_url: String,
    pub attribution: String,
}

pub(crate) fn render(document: &ExportDocument) -> Result<String, String> {
    validate_document(document)?;
    let copy_label = match document.copy {
        ExportCopy::Student => "Student copy",
        ExportCopy::Teacher => "Teacher copy with answers",
    };
    let mut body = String::with_capacity(32_000);
    write!(
        body,
        "<header class=\"running-header\"><b>graspy</b><span>{} · {}</span><span>{}</span></header>",
        escape(&document.subject),
        escape(&document.grade),
        escape(copy_label),
    )
    .map_err(format_error)?;
    body.push_str("<main>");
    write!(
        body,
        "<header class=\"document-heading\"><p class=\"eyebrow\">{}</p><h1>{}</h1>",
        escape(&document.classwork_label),
        escape(&document.title),
    )
    .map_err(format_error)?;
    if let Some(subtopic) = document.subtopic.as_deref() {
        write!(body, "<p class=\"subtopic\">{}</p>", escape(subtopic)).map_err(format_error)?;
    }
    write!(
        body,
        "<dl class=\"document-meta\"><div><dt>Class</dt><dd>{} · {}</dd></div><div><dt>Academic session</dt><dd>{}</dd></div><div><dt>Term</dt><dd>{}</dd></div><div><dt>Prepared</dt><dd>{}</dd></div></dl></header>",
        escape(&document.subject),
        escape(&document.grade),
        escape(&document.session),
        escape(&document.term),
        escape(&document.prepared_on),
    )
    .map_err(format_error)?;
    body.push_str("<section class=\"learning-goals\"><h2>Learning goals</h2><ol>");
    for goal in &document.learning_goals {
        write!(body, "<li>{}</li>", escape(goal)).map_err(format_error)?;
    }
    body.push_str("</ol></section>");

    for section in &document.sections {
        write!(
            body,
            "<section class=\"lesson-section\"><header><p>Lesson step {}</p><h2>{}</h2><span>{}</span></header>",
            section.sequence,
            escape(&section.title),
            escape(&section.step_title),
        )
        .map_err(format_error)?;
        for block in &section.blocks {
            if document.copy == ExportCopy::Student && block.kind == "solution" {
                continue;
            }
            write!(
                body,
                "<article class=\"classwork-block classwork-block-{}\"><h3>{}</h3><div class=\"classwork-text\">{}</div>",
                escape_attribute(&block.kind),
                block_label(&block.kind)?,
                render_markdown(&block.text),
            )
            .map_err(format_error)?;
            for figure in &block.figures {
                write!(
                    body,
                    "<figure><img src=\"{}\" alt=\"{}\" width=\"{}\" height=\"{}\"><figcaption>{}</figcaption></figure>",
                    escape_attribute(&figure.data_url),
                    escape_attribute(&figure.alt_text),
                    figure.width_px,
                    figure.height_px,
                    escape(&figure.caption),
                )
                .map_err(format_error)?;
            }
            body.push_str("</article>");
        }
        body.push_str("</section>");
    }

    if document.copy == ExportCopy::Teacher {
        render_connections(document, &mut body)?;
    }
    render_sources(document, &mut body)?;
    body.push_str("</main>");
    write!(
        body,
        "<footer class=\"running-footer\"><span>{}</span><span class=\"page-number\"></span></footer>",
        escape(&document.title),
    )
    .map_err(format_error)?;

    let copy_class = if document.copy == ExportCopy::Student {
        "copy-student"
    } else {
        "copy-teacher"
    };
    Ok(document_shell(
        &format!("{} - {}", document.title, copy_label),
        &format!("graspy-export {copy_class}"),
        "",
        &body,
    ))
}

/// Shared print-ready HTML shell for every export document: identical `<head>`,
/// embedded fonts, print CSS, KaTeX, and the readiness script the PDF renderer
/// waits on. `extra_css` carries any document-specific rules on top of the
/// common stylesheet so the classwork and lesson-plan documents stay visually
/// consistent.
pub(super) fn document_shell(
    page_title: &str,
    body_class: &str,
    extra_css: &str,
    body: &str,
) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'\"><title>{title}</title><style>{fonts}{css}{extra}</style></head><body class=\"{body_class}\">{body}<script>{katex}</script><script>{ready}</script></body></html>",
        title = escape(page_title),
        fonts = assets::embedded_font_css(),
        css = PRINT_CSS,
        extra = extra_css,
        body_class = body_class,
        body = body,
        katex = assets::KATEX_JS,
        ready = READY_SCRIPT,
    )
}

fn validate_document(document: &ExportDocument) -> Result<(), String> {
    if document.title.trim().is_empty()
        || document.subject.trim().is_empty()
        || document.grade.trim().is_empty()
        || document.learning_goals.is_empty()
        || document.sections.is_empty()
        || document.sections.iter().any(|section| {
            section.title.trim().is_empty()
                || section.blocks.len() != 4
                || section
                    .blocks
                    .iter()
                    .any(|block| block.text.trim().is_empty())
        })
    {
        return Err("The approved classwork is incomplete and cannot be exported.".to_owned());
    }
    Ok(())
}

fn render_connections(document: &ExportDocument, body: &mut String) -> Result<(), String> {
    body.push_str("<section class=\"connections\"><h2>Lesson connections</h2><p>How each activity supports the confirmed learning goals and published material.</p><table><thead><tr><th>Activity</th><th>Learning goal</th><th>Published source</th></tr></thead><tbody>");
    for section in &document.sections {
        for block in &section.blocks {
            let goals = block
                .learning_goal_numbers
                .iter()
                .map(|number| {
                    document
                        .learning_goals
                        .get((*number - 1) as usize)
                        .map(|goal| escape(goal))
                        .ok_or_else(|| {
                            "The approved classwork refers to a learning goal that is no longer available."
                                .to_owned()
                        })
                })
                .collect::<Result<Vec<_>, _>>()?
                .join("<br>");
            let sources = block
                .source_material_keys
                .iter()
                .map(|key| {
                    document
                        .sources
                        .iter()
                        .find(|source| source.key == *key)
                        .map(|source| format!("{} - {}", escape(&source.title), escape(&source.publisher)))
                        .ok_or_else(|| {
                            "The approved classwork refers to published source material that is no longer available."
                                .to_owned()
                        })
                })
                .collect::<Result<Vec<_>, _>>()?
                .join("<br>");
            write!(
                body,
                "<tr><th>Lesson step {} · {}</th><td>{}</td><td>{}</td></tr>",
                section.sequence,
                block_label(&block.kind)?,
                goals,
                sources,
            )
            .map_err(format_error)?;
        }
    }
    body.push_str("</tbody></table></section>");
    Ok(())
}

fn render_sources(document: &ExportDocument, body: &mut String) -> Result<(), String> {
    body.push_str("<section class=\"source-notes\"><h2>Source notes</h2><ol>");
    for source in &document.sources {
        write!(
            body,
            "<li><cite>{}</cite>, {}. <a href=\"{}\">{}</a>. <a href=\"{}\">{}</a><span>{}</span></li>",
            escape(&source.title),
            escape(&source.publisher),
            escape_attribute(&source.source_url),
            escape(&source.source_url),
            escape_attribute(&source.licence_url),
            escape(&source.licence_name),
            escape(&source.attribution),
        )
        .map_err(format_error)?;
    }
    body.push_str("</ol></section>");
    Ok(())
}

pub(super) fn render_markdown(markdown: &str) -> String {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    options.extension.superscript = true;
    options.extension.math_dollars = true;
    options.extension.math_code = true;
    markdown_to_html(markdown, &options)
}

fn block_label(kind: &str) -> Result<&'static str, String> {
    match kind {
        "review" => Ok("Review"),
        "worked_example" => Ok("Worked example"),
        "practice" => Ok("Practice"),
        "solution" => Ok("Answers"),
        _ => Err("The approved classwork contains an unknown activity type.".to_owned()),
    }
}

pub(super) fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attribute(value: &str) -> String {
    escape(value).replace('"', "&quot;").replace('\'', "&#39;")
}

fn format_error(error: std::fmt::Error) -> String {
    error.to_string()
}

const READY_SCRIPT: &str = r#"
(() => {
  try {
    document.querySelectorAll('[data-math-style]').forEach((node) => {
      const displayMode = node.getAttribute('data-math-style') === 'display';
      katex.render(node.textContent || '', node, { displayMode, throwOnError: false, strict: 'warn' });
    });
    const pageHeight = 1122.519685;
    const pageMargin = 68.031496;
    if (window.parent === window) {
      document.querySelectorAll('.plan-section, .plan-signature, .classwork-block, figure, .connections, .source-notes').forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.height >= pageHeight) return;
        const top = rect.top + window.scrollY;
        const nextBoundary = (Math.floor(top / pageHeight) + 1) * pageHeight;
        if (top + rect.height > nextBoundary) {
          const marginTop = Number.parseFloat(getComputedStyle(node).marginTop) || 0;
          node.style.marginTop = `${marginTop + nextBoundary + pageMargin - top}px`;
        }
      });
    }
    const contentBottom = document.querySelector('main')?.getBoundingClientRect().bottom || 0;
    const printableHeight = Math.max(pageHeight, Math.ceil(contentBottom + pageMargin));
    if (window.parent === window) {
      const pageCount = Math.ceil(printableHeight / pageHeight);
      const header = document.querySelector('.running-header');
      for (let page = 1; header && page < pageCount; page += 1) {
        const repeatedHeader = header.cloneNode(true);
        repeatedHeader.classList.add('page-running-header');
        repeatedHeader.style.top = `${page * pageHeight + 22.677165}px`;
        document.body.append(repeatedHeader);
      }
      const footer = document.querySelector('.running-footer');
      for (let page = 0; footer && page < pageCount; page += 1) {
        const repeatedFooter = footer.cloneNode(true);
        repeatedFooter.classList.add('page-running-footer');
        repeatedFooter.style.top = `${(page + 1) * pageHeight - 45.354331}px`;
        repeatedFooter.lastElementChild.classList.remove('page-number');
        repeatedFooter.lastElementChild.textContent = `Page ${page + 1}`;
        document.body.append(repeatedFooter);
      }
    }
    document.title = `graspy-export-ready:${printableHeight}`;
    document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      window.location.hash = 'graspy-export-ready';
      window.parent.postMessage('graspy:export-ready', '*');
    })));
    document.addEventListener('click', (event) => event.preventDefault());
  } catch (error) {
    document.documentElement.dataset.exportError = String(error);
    document.title = 'graspy-export-failed';
    window.location.hash = 'graspy-export-failed';
    window.parent.postMessage('graspy:export-failed', '*');
  }
})();
"#;

const PRINT_CSS: &str = r#"
@page { size: A4; margin: 18mm 16mm 18mm; }
* { box-sizing: border-box; }
html { color: #101820; background: #fff; font-family: "Nunito", sans-serif; font-size: 10.5pt; line-height: 1.45; }
body { margin: 0; }
a { color: inherit; text-decoration: underline; text-underline-offset: 1.5pt; }
.running-header, .running-footer { position: fixed; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; color: #45566a; font-size: 8pt; }
.running-header { top: -12mm; padding-bottom: 2.5mm; border-bottom: .5pt solid #b8c8d8; }
.running-header b { color: #0087c8; font-size: 12pt; letter-spacing: -.03em; }
.running-footer { bottom: -12mm; padding-top: 2.5mm; border-top: .5pt solid #b8c8d8; }
.page-number::after { content: "Page " counter(page); }
main { width: 100%; }
.document-heading { padding: 2mm 0 7mm; border-bottom: 1.5pt solid #101820; }
.eyebrow { margin: 0 0 2mm; color: #006fa6; font-size: 8.5pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
h1, h2, h3, p { orphans: 3; widows: 3; }
h1 { margin: 0; font-size: 28pt; line-height: 1.08; letter-spacing: -.025em; }
.subtopic { margin: 2mm 0 0; color: #45566a; font-size: 12pt; }
.document-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 6mm 0 0; }
.document-meta div { border-left: 1.5pt solid #0087c8; padding-left: 2.5mm; }
.document-meta dt { color: #586a7c; font-size: 7.5pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.document-meta dd { margin: 1mm 0 0; font-weight: 700; }
.learning-goals { margin: 8mm 0 0; padding: 5mm 6mm; background: #f1f7fb; border-top: .7pt solid #b8d5e5; border-bottom: .7pt solid #b8d5e5; break-inside: avoid; }
.learning-goals h2, .source-notes h2 { margin: 0 0 2mm; font-size: 13pt; }
.learning-goals ol { margin: 0; padding-left: 6mm; }
.learning-goals li + li { margin-top: 1mm; }
.lesson-section { padding-top: 9mm; }
.lesson-section + .lesson-section { break-before: page; }
.lesson-section > header { break-after: avoid; border-bottom: .8pt solid #9db4c7; padding-bottom: 3mm; }
.lesson-section > header p { margin: 0 0 1mm; color: #006fa6; font-size: 8pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.lesson-section > header h2 { margin: 0; font-size: 20pt; line-height: 1.14; }
.lesson-section > header span { display: block; margin-top: 1mm; color: #586a7c; }
.classwork-block { padding: 5mm 0; border-bottom: .45pt solid #cad6df; }
.classwork-block h3 { margin: 0 0 2mm; color: #263746; font-size: 10pt; break-after: avoid; }
.classwork-block-solution { margin-top: 2mm; padding: 5mm; background: #f5f5f5; border: .6pt solid #c5c5c5; break-inside: avoid; }
.classwork-text > :first-child { margin-top: 0; }
.classwork-text > :last-child { margin-bottom: 0; }
.classwork-text p, .classwork-text ul, .classwork-text ol, .classwork-text table { margin: 0 0 2.5mm; }
.classwork-text ul, .classwork-text ol { padding-left: 6mm; }
.classwork-text li + li { margin-top: .8mm; }
.classwork-text h1, .classwork-text h2, .classwork-text h3 { font-size: 11pt; margin: 3mm 0 1.5mm; break-after: avoid; }
.classwork-text table, .connections table { width: 100%; border-collapse: collapse; }
.classwork-text th, .classwork-text td, .connections th, .connections td { border: .5pt solid #b7c4cf; padding: 2mm; text-align: left; vertical-align: top; }
.classwork-text th, .connections thead th { background: #eef3f6; }
.classwork-text blockquote { margin: 2mm 0; padding-left: 3mm; border-left: 2pt solid #7f9db2; color: #45566a; }
.classwork-text code { font-family: ui-monospace, monospace; font-size: .9em; background: #f1f3f5; padding: 0 .8mm; }
.katex-display { margin: 3mm 0; overflow: hidden; }
figure { margin: 5mm 0 1mm; break-inside: avoid; }
figure img { display: block; max-width: 135mm; max-height: 100mm; width: auto; height: auto; object-fit: contain; }
figcaption { max-width: 135mm; margin-top: 1.5mm; color: #586a7c; font-size: 8.5pt; }
.connections { break-before: page; }
.connections h2 { margin: 0 0 1mm; font-size: 20pt; }
.connections > p { margin: 0 0 5mm; color: #586a7c; }
.connections table { font-size: 8.5pt; }
.connections tr { break-inside: avoid; }
.connections tbody th { width: 28%; }
.source-notes { margin-top: 9mm; padding-top: 5mm; border-top: 1pt solid #101820; }
.connections + .source-notes { break-before: page; margin-top: 0; }
.source-notes ol { margin: 0; padding-left: 6mm; }
.source-notes li { overflow-wrap: anywhere; }
.source-notes li + li { margin-top: 3mm; }
.source-notes span { display: block; margin-top: 1mm; color: #586a7c; font-size: 8.5pt; }
@media screen {
  html { background: #fff; }
  body { width: 210mm; min-height: 297mm; margin: 0; padding: 18mm 16mm; background: #fff; }
  .running-header { top: 6mm; left: 16mm; right: 16mm; }
  .running-footer { display: none; }
  .page-running-header, .page-running-footer { position: absolute; }
  .page-running-footer { bottom: auto; display: flex; left: 16mm; right: 16mm; }
}
@media (max-width: 760px) {
  body { width: 100%; min-height: 100dvh; margin: 0; padding: 18mm 10mm; box-shadow: none; }
  .document-meta { grid-template-columns: repeat(2, 1fr); }
  .running-header { left: 10mm; right: 10mm; }
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(copy: ExportCopy) -> ExportDocument {
        ExportDocument {
            title: "Equivalent fractions".to_owned(),
            subject: "Mathematics".to_owned(),
            grade: "JSS 2".to_owned(),
            subtopic: Some("Fraction models".to_owned()),
            session: "2026/2027".to_owned(),
            term: "First term".to_owned(),
            prepared_on: "18 July 2026".to_owned(),
            copy,
            classwork_label: "Classwork".to_owned(),
            learning_goals: vec!["Compare equivalent fractions.".to_owned()],
            sections: vec![ExportSection {
                sequence: 1,
                step_title: "Compare models".to_owned(),
                title: "Seeing equal fractions".to_owned(),
                learning_goal_numbers: vec![1],
                blocks: ["review", "worked_example", "practice", "solution"]
                    .into_iter()
                    .map(|kind| ExportBlock {
                        kind: kind.to_owned(),
                        text: if kind == "review" {
                            "Use $\\frac{1}{2}=\\frac{2}{4}$, not <script>alert(1)</script>."
                                .to_owned()
                        } else {
                            format!("{kind} wording")
                        },
                        learning_goal_numbers: vec![1],
                        source_material_keys: vec!["source".to_owned()],
                        figures: vec![],
                    })
                    .collect(),
            }],
            sources: vec![ExportSource {
                key: "source".to_owned(),
                title: "Fractions".to_owned(),
                publisher: "Siyavula".to_owned(),
                source_url: "https://example.test/source".to_owned(),
                licence_name: "CC BY 3.0".to_owned(),
                licence_url: "https://creativecommons.org/licenses/by/3.0/".to_owned(),
                attribution: "Adapted from Siyavula Mathematics.".to_owned(),
            }],
        }
    }

    #[test]
    fn student_copy_excludes_answers_and_teacher_connections_but_keeps_attribution() {
        let html = render(&sample(ExportCopy::Student)).expect("student export");
        assert!(!html.contains("solution wording"));
        assert!(!html.contains("Lesson connections"));
        assert!(html.contains("Adapted from Siyavula Mathematics."));
        assert!(html.contains("data-math-style=\"inline\""));
        assert!(!html.contains("<script>alert(1)</script>"));
        assert!(html.contains("graspy-export-ready"));
        assert!(html.contains("page-running-header"));
        assert!(html.contains("classList.remove('page-number')"));
    }

    #[test]
    fn teacher_copy_includes_answers_and_complete_connections() {
        let html = render(&sample(ExportCopy::Teacher)).expect("teacher export");
        assert!(html.contains("solution wording"));
        assert!(html.contains("Teacher copy with answers"));
        assert!(html.contains("Lesson connections"));
        assert!(html.contains("Compare equivalent fractions."));
        assert!(html.contains("Fractions - Siyavula"));
    }
}
