import { z } from "zod";

import { academicWorkspaceSnapshotSchema } from "../features/academic-workspace/domain/academicWorkspace";
import { backgroundTaskSchema } from "../features/background-tasks/domain/backgroundTask";
import { nextTeachingSlotSchema, teachingSlotSchema } from "../features/class-timetable/domain/classTimetable";
import { schoolDaySchema } from "../features/class-timetable/domain/schoolDay";
import { classworkSectionHistorySchema, classworkWorkspaceSchema } from "../features/classwork/domain/classwork";
import { curriculumCatalogSnapshotSchema } from "../features/curriculum-catalog/domain/curriculumCatalog";
import { differentiatedClassworkWorkspaceSchema } from "../features/differentiated-classwork/domain/differentiatedClasswork";
import { classworkPdfArtifactSchema, preparedClassworkExportSchema } from "../features/document-export/domain/documentExport";
import { lessonEvidenceWorkspaceSchema } from "../features/learner-evidence/domain/lessonEvidence";
import { importedLessonPlanSchema } from "../features/lesson-planning/application/LessonDocumentImporter";
import { lessonPlanPhotographSchema } from "../features/lesson-planning/application/LessonPhotographReader";
import { granularLessonProgramInputSchema, granularLessonRecordSchema } from "../features/lesson-planning/domain/granularLesson";
import { lessonWorkspaceSnapshotSchema } from "../features/lesson-planning/domain/lessonPlanning";
import { preparationStepProgressSchema } from "../features/lesson-planning/domain/preparationProgress";
import { schemeContextSnapshotSchema } from "../features/scheme-of-work/domain/schemeOfWork";

/**
 * Why a command's answer is read without a schema, said plainly so the choice
 * is a choice rather than an omission.
 */
export type Unread =
  | "answers with nothing"
  /** A single value has no shape two halves can disagree about. */
  | "answers with one plain value"
  /** No schema parses this yet, so a change to its Rust type reaches a screen. */
  | "nothing parses this answer yet";

/**
 * What reads each command's answer.
 *
 * Every command the app registers appears here — a test holds this list to the
 * one Rust writes — so a new command cannot arrive without someone saying what
 * reads what it sends back.
 */
export const READS_THE_ANSWER: Readonly<Record<string, z.ZodType | Unread>> = {
  add_teaching_assignment: academicWorkspaceSnapshotSchema,
  approve_classwork_version: classworkWorkspaceSchema,
  archive_scheme_entry: schemeContextSnapshotSchema,
  archive_teaching_assignment: academicWorkspaceSnapshotSchema,
  assign_curriculum_course: academicWorkspaceSnapshotSchema,
  can_read_a_lesson_plan_photograph: z.boolean(),
  cancel_background_task: "answers with nothing",
  cancel_lesson_note_completion: "answers with nothing",
  cancel_lesson_preparation_completion: "answers with nothing",
  cancel_model_acquisition: "answers with nothing",
  choose_lesson_model: "answers with nothing",
  confirm_granular_lesson: lessonWorkspaceSnapshotSchema,
  create_academic_session: academicWorkspaceSnapshotSchema,
  create_academic_workspace: academicWorkspaceSnapshotSchema,
  create_granular_lesson_completion: granularLessonRecordSchema,
  create_lesson_note_completion: "answers with one plain value",
  create_lesson_preparation_completion: "answers with one plain value",
  create_scheme_from_template: schemeContextSnapshotSchema,
  create_scheme_of_work: schemeContextSnapshotSchema,
  discard_lesson: lessonWorkspaceSnapshotSchema,
  dismiss_background_task: "answers with nothing",
  download_model: "nothing parses this answer yet",
  download_photograph_reading: "nothing parses this answer yet",
  edit_classwork_block: classworkWorkspaceSchema,
  get_academic_workspace: academicWorkspaceSnapshotSchema,
  get_background_task: backgroundTaskSchema.nullable(),
  get_class_timetable: z.array(teachingSlotSchema),
  get_classwork_figure: "answers with one plain value",
  get_classwork_section_history: classworkSectionHistorySchema,
  get_classwork_workspace: classworkWorkspaceSchema,
  get_curriculum_catalog: curriculumCatalogSnapshotSchema,
  get_differentiated_classwork_workspace: differentiatedClassworkWorkspaceSchema,
  get_granular_lesson_program_input: granularLessonProgramInputSchema,
  get_lesson_evidence_workspace: lessonEvidenceWorkspaceSchema,
  get_lesson_preparation_progress: z.array(preparationStepProgressSchema),
  get_lesson_workspace: lessonWorkspaceSnapshotSchema,
  get_model_installation: "nothing parses this answer yet",
  get_photograph_reading_installation: "nothing parses this answer yet",
  get_next_teaching_slot: nextTeachingSlotSchema.nullable(),
  get_scheme_of_work_context: schemeContextSnapshotSchema,
  get_school_day: schoolDaySchema.nullable(),
  get_todays_classes: z.array(z.string()),
  import_lesson_plan_document: importedLessonPlanSchema,
  import_model: "nothing parses this answer yet",
  import_photograph_reading: "nothing parses this answer yet",
  install_curriculum_package: curriculumCatalogSnapshotSchema,
  install_scheme_template_package: schemeContextSnapshotSchema,
  launch_health: "nothing parses this answer yet",
  list_background_tasks: z.array(backgroundTaskSchema),
  list_lesson_models: "nothing parses this answer yet",
  move_lesson_draft: lessonWorkspaceSnapshotSchema,
  move_scheme_entry: schemeContextSnapshotSchema,
  prepare_classwork_export: preparedClassworkExportSchema,
  prepare_lesson_plan_export: preparedClassworkExportSchema,
  print_classwork_document: "answers with nothing",
  print_lesson_plan_document: "answers with nothing",
  read_lesson_plan_photograph: lessonPlanPhotographSchema,
  regenerate_classwork_section: classworkWorkspaceSchema,
  restore_classwork_section: classworkWorkspaceSchema,
  resume_lesson_preparation: "answers with nothing",
  retry_launch: "nothing parses this answer yet",
  run_classwork_generation: classworkWorkspaceSchema,
  run_differentiated_classwork_generation: differentiatedClassworkWorkspaceSchema,
  save_authored_lesson: lessonWorkspaceSnapshotSchema,
  save_classwork_pdf: classworkPdfArtifactSchema,
  save_granular_lesson: lessonWorkspaceSnapshotSchema,
  save_lesson_draft: lessonWorkspaceSnapshotSchema,
  save_lesson_evidence: lessonEvidenceWorkspaceSchema,
  save_lesson_note: "answers with nothing",
  save_lesson_plan_pdf: classworkPdfArtifactSchema,
  save_scheme_entry: schemeContextSnapshotSchema,
  save_scheme_week: schemeContextSnapshotSchema,
  set_active_academic_context: academicWorkspaceSnapshotSchema,
  set_class_timetable: z.array(teachingSlotSchema),
  set_school_day: schoolDaySchema,
  stop_reading_lesson_plan_photograph: "answers with nothing",
  update_teaching_assignment: academicWorkspaceSnapshotSchema,
  work_through_teacher_lesson_goals: "answers with nothing",
};
