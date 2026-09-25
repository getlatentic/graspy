use std::collections::{HashMap, HashSet};

use crate::{
    classwork::{
        self,
        domain::{
            ClassworkBlock, ClassworkFigure, ClassworkFigureRequest, ClassworkRun,
            ClassworkSourceSummary, ClassworkWorkspaceRequest,
        },
    },
    content_corpus::ContentCorpus,
    db::Database,
    differentiated_classwork::{self, domain::DifferentiatedClassworkGroup},
};

use super::{
    domain::{
        ExportClassworkSet, ExportCopy, PrepareClassworkExportRequest, PreparedClassworkExport,
    },
    html::{self, ExportBlock, ExportDocument, ExportFigure, ExportSection, ExportSource},
};

type Result<T> = std::result::Result<T, String>;

pub(crate) fn prepare(
    database: &Database,
    corpus: &ContentCorpus,
    request: PrepareClassworkExportRequest,
) -> Result<PreparedClassworkExport> {
    let base_workspace = classwork::export_workspace(
        database,
        corpus,
        ClassworkWorkspaceRequest {
            context: request.context.clone(),
            lesson_id: request.lesson_id.clone(),
        },
    )?;
    let run = base_workspace
        .run
        .as_ref()
        .ok_or_else(|| "Create and approve the classwork before exporting it.".to_owned())?;
    require_approved_base(run)?;
    let (session, term, prepared_on) = context_details(database, &request)?;
    let figure_data = load_figure_data(database, corpus, &request, run)?;

    let (classwork_label, sections) = match request.classwork_set {
        ExportClassworkSet::Original => (
            "Classwork".to_owned(),
            original_sections(run, &figure_data)?,
        ),
        ExportClassworkSet::Group => {
            let group_id = request.group_id.as_deref().ok_or_else(|| {
                "Choose the teaching group whose classwork you want to export.".to_owned()
            })?;
            let adjusted = differentiated_classwork::export_workspace(
                database,
                crate::differentiated_classwork::domain::DifferentiatedWorkspaceRequest {
                    context: request.context.clone(),
                    lesson_id: request.lesson_id.clone(),
                },
            )?;
            let group = adjusted
                .run
                .as_ref()
                .and_then(|value| value.groups.iter().find(|group| group.id == group_id))
                .ok_or_else(|| "This group classwork is no longer available.".to_owned())?;
            require_complete_group(group)?;
            (
                format!("Classwork for {}", group.name),
                group_sections(group, &run.figures, &figure_data)?,
            )
        }
    };
    let sources = cited_sources(&sections, &run.sources)?;
    let document = ExportDocument {
        title: base_workspace.lesson.topic.clone(),
        subject: base_workspace.lesson.subject,
        grade: base_workspace.lesson.grade,
        subtopic: base_workspace.lesson.subtopic,
        session,
        term,
        prepared_on,
        copy: request.copy,
        classwork_label: classwork_label.clone(),
        learning_goals: base_workspace.lesson.learning_goals,
        sections,
        sources,
    };
    let copy_label = match request.copy {
        ExportCopy::Student => "student",
        ExportCopy::Teacher => "teacher",
    };
    let file_name = format!(
        "{}-{}-{copy_label}.pdf",
        file_slug(&document.title),
        file_slug(&classwork_label),
    );
    let title = format!("{} - {}", document.title, classwork_label);
    let html = html::render(&document)?;
    Ok(PreparedClassworkExport {
        title,
        file_name,
        html,
    })
}

fn require_approved_base(run: &ClassworkRun) -> Result<()> {
    if run.status != "complete" {
        return Err("Finish creating every lesson section before exporting.".to_owned());
    }
    let version = run.document_version.as_ref().ok_or_else(|| {
        "The classwork is not ready for export. Reopen the lesson and try again.".to_owned()
    })?;
    if version.status != "approved" {
        return Err("Approve the classwork before exporting it.".to_owned());
    }
    if run.sections.iter().any(|section| section.status != "done") {
        return Err("Finish creating every lesson section before exporting.".to_owned());
    }
    Ok(())
}

fn require_complete_group(group: &DifferentiatedClassworkGroup) -> Result<()> {
    if group.sections.iter().any(|section| {
        section.status != "done" || section.title.is_none() || section.blocks.len() != 4
    }) {
        return Err(format!(
            "Finish creating every section for {} before exporting it.",
            group.name
        ));
    }
    Ok(())
}

fn context_details(
    database: &Database,
    request: &PrepareClassworkExportRequest,
) -> Result<(String, String, String)> {
    database.with_connection(|connection| -> Result<(String, String, String)> {
        let (start_year, end_year, period_name): (i64, i64, String) = connection
            .query_row(
                "SELECT academic_sessions.start_year,
                        academic_sessions.end_year,
                        academic_periods.name
                 FROM academic_sessions
                 JOIN academic_periods
                   ON academic_periods.academic_session_id = academic_sessions.id
                 WHERE academic_sessions.id = ?1 AND academic_periods.id = ?2",
                [
                    &request.context.academic_session_id,
                    &request.context.academic_period_id,
                ],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        let prepared_on = connection
            .query_row("SELECT date('now', 'localtime')", [], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|error| error.to_string())?;
        Ok((
            format!("{start_year}/{end_year}"),
            period_name,
            display_date(&prepared_on)?,
        ))
    })
}

fn original_sections(
    run: &ClassworkRun,
    figure_data: &HashMap<String, String>,
) -> Result<Vec<ExportSection>> {
    let sections = run
        .sections
        .iter()
        .map(|section| {
            Ok(ExportSection {
                sequence: section.sequence,
                step_title: section.step_title.clone(),
                title: section.title.clone().ok_or_else(|| {
                    "An approved lesson section has no title and cannot be exported.".to_owned()
                })?,
                learning_goal_numbers: section.learning_goal_numbers.clone(),
                blocks: section.blocks.iter().map(export_original_block).collect(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    attach_figures(sections, &run.figures, figure_data)
}

fn export_original_block(block: &ClassworkBlock) -> ExportBlock {
    ExportBlock {
        kind: block.kind.clone(),
        text: block.text.clone(),
        learning_goal_numbers: block.learning_goal_numbers.clone(),
        source_material_keys: block.source_material_keys.clone(),
        figures: vec![],
    }
}

fn group_sections(
    group: &DifferentiatedClassworkGroup,
    figures: &[ClassworkFigure],
    figure_data: &HashMap<String, String>,
) -> Result<Vec<ExportSection>> {
    let sections = group
        .sections
        .iter()
        .map(|section| {
            Ok(ExportSection {
                sequence: section.sequence,
                step_title: section.step_title.clone(),
                title: section.title.clone().ok_or_else(|| {
                    "A section of the group classwork has no title and cannot be exported."
                        .to_owned()
                })?,
                learning_goal_numbers: section.learning_goal_numbers.clone(),
                blocks: section
                    .blocks
                    .iter()
                    .map(|block| ExportBlock {
                        kind: block.kind.clone(),
                        text: block.text.clone(),
                        learning_goal_numbers: block.learning_goal_numbers.clone(),
                        source_material_keys: block.source_material_keys.clone(),
                        figures: vec![],
                    })
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    attach_figures(sections, figures, figure_data)
}

fn attach_figures(
    mut sections: Vec<ExportSection>,
    figures: &[ClassworkFigure],
    figure_data: &HashMap<String, String>,
) -> Result<Vec<ExportSection>> {
    let mut remaining = figures.iter().collect::<Vec<_>>();
    for section in &mut sections {
        for block in &mut section.blocks {
            let mut index = 0;
            while index < remaining.len() {
                if block
                    .source_material_keys
                    .contains(&remaining[index].source_material_key)
                {
                    let figure = remaining.remove(index);
                    block.figures.push(export_figure(figure, figure_data)?);
                } else {
                    index += 1;
                }
            }
        }
    }
    if let Some(last_block) = sections
        .last_mut()
        .and_then(|section| section.blocks.last_mut())
    {
        for figure in remaining {
            last_block.figures.push(export_figure(figure, figure_data)?);
        }
    }
    Ok(sections)
}

fn export_figure(
    figure: &ClassworkFigure,
    figure_data: &HashMap<String, String>,
) -> Result<ExportFigure> {
    Ok(ExportFigure {
        data_url: figure_data.get(&figure.id).cloned().ok_or_else(|| {
            "A trusted lesson figure could not be prepared for export.".to_owned()
        })?,
        caption: figure.caption.clone(),
        alt_text: figure.alt_text.clone(),
        width_px: figure.width_px,
        height_px: figure.height_px,
    })
}

fn load_figure_data(
    database: &Database,
    corpus: &ContentCorpus,
    request: &PrepareClassworkExportRequest,
    run: &ClassworkRun,
) -> Result<HashMap<String, String>> {
    run.figures
        .iter()
        .map(|figure| {
            Ok((
                figure.id.clone(),
                classwork::export_figure_data(
                    database,
                    corpus,
                    ClassworkFigureRequest {
                        context: request.context.clone(),
                        lesson_id: request.lesson_id.clone(),
                        figure_id: figure.id.clone(),
                    },
                )?,
            ))
        })
        .collect()
}

fn cited_sources(
    sections: &[ExportSection],
    sources: &[ClassworkSourceSummary],
) -> Result<Vec<ExportSource>> {
    let cited = sections
        .iter()
        .flat_map(|section| section.blocks.iter())
        .flat_map(|block| block.source_material_keys.iter().cloned())
        .collect::<HashSet<_>>();
    let result = sources
        .iter()
        .filter(|source| cited.contains(&source.key))
        .map(|source| ExportSource {
            key: source.key.clone(),
            title: source.title.clone(),
            publisher: source.publisher.clone(),
            source_url: source.source_url.clone(),
            licence_name: source.licence_name.clone(),
            licence_url: source.licence_url.clone(),
            attribution: source.attribution.clone(),
        })
        .collect::<Vec<_>>();
    if cited
        .iter()
        .any(|key| !result.iter().any(|source| source.key == *key))
    {
        return Err(
            "The approved classwork references published material that is no longer available."
                .to_owned(),
        );
    }
    Ok(result)
}

fn display_date(value: &str) -> Result<String> {
    let mut values = value.split('-');
    let year = values
        .next()
        .ok_or_else(|| "The export date is unavailable.".to_owned())?;
    let month = values
        .next()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| (1..=12).contains(value))
        .ok_or_else(|| "The export date is unavailable.".to_owned())?;
    let day = values
        .next()
        .and_then(|value| value.parse::<u8>().ok())
        .filter(|value| (1..=31).contains(value))
        .ok_or_else(|| "The export date is unavailable.".to_owned())?;
    if values.next().is_some() {
        return Err("The export date is unavailable.".to_owned());
    }
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    Ok(format!("{day} {} {year}", MONTHS[month - 1]))
}

pub(crate) fn file_slug(value: &str) -> String {
    let mut slug = String::with_capacity(value.len().min(80));
    let mut separator = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            slug.push(character);
            separator = false;
        } else {
            separator = true;
        }
        if slug.len() >= 72 {
            break;
        }
    }
    if slug.is_empty() {
        "lesson-classwork".to_owned()
    } else {
        slug.trim_end_matches('-').to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_stable_safe_file_names() {
        assert_eq!(
            file_slug("Linear equations: JSS 2 / A"),
            "linear-equations-jss-2-a"
        );
        assert_eq!(file_slug("---"), "lesson-classwork");
        assert!(!file_slug(&"A".repeat(200)).len().gt(&72));
    }

    #[test]
    fn formats_the_local_sqlite_date_for_teacher_documents() {
        assert_eq!(display_date("2026-07-18").expect("date"), "18 July 2026");
        assert!(display_date("18/07/2026").is_err());
    }
}
