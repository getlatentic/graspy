import { TauriAcademicWorkspaceGateway } from "../features/academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import { TauriClassTimetableGateway } from "../features/class-timetable/infrastructure/TauriClassTimetableGateway";
import { TauriLessonPlanningGateway } from "../features/lesson-planning/infrastructure/TauriLessonPlanningGateway";
import { LocalGranularLessonGenerator } from "../features/lesson-planning/infrastructure/LocalGranularLessonGenerator";
import { TauriGranularLessonCompletionGateway } from "../features/lesson-planning/infrastructure/TauriGranularLessonCompletionGateway";
import { TauriPreparationProgressGateway } from "../features/lesson-planning/infrastructure/TauriPreparationProgressGateway";
import { TauriLessonDocumentImporter } from "../features/lesson-planning/infrastructure/TauriLessonDocumentImporter";
import { TauriLessonPhotographReader } from "../features/lesson-planning/infrastructure/TauriLessonPhotographReader";
import { TauriSchemeOfWorkGateway } from "../features/scheme-of-work/infrastructure/TauriSchemeOfWorkGateway";
import { TauriClassworkGateway } from "../features/classwork/infrastructure/TauriClassworkGateway";
import { LocalLessonNoteGenerator } from "../features/lesson-planning/infrastructure/LocalLessonNoteGenerator";
import { TauriLessonNoteCompletionGateway } from "../features/lesson-planning/infrastructure/TauriLessonNoteCompletionGateway";
import { TauriLessonEvidenceGateway } from "../features/learner-evidence/infrastructure/TauriLessonEvidenceGateway";
import { TauriDifferentiatedClassworkGateway } from "../features/differentiated-classwork/infrastructure/TauriDifferentiatedClassworkGateway";
import {
  PHOTOGRAPH_READING_FILE,
  TauriModelAcquisitionGateway,
} from "../features/model-acquisition/infrastructure/TauriModelAcquisitionGateway";
import { TauriLessonModelGateway } from "../features/model-catalogue/infrastructure/TauriLessonModelGateway";
import { TauriClassworkExportGateway } from "../features/document-export/infrastructure/TauriClassworkExportGateway";
import { TauriLessonPlanExportGateway } from "../features/document-export/infrastructure/TauriLessonPlanExportGateway";
import { TauriCurriculumCatalogGateway } from "../features/curriculum-catalog/infrastructure/TauriCurriculumCatalogGateway";
import { TauriLaunchHealthGateway } from "../features/launch-health/infrastructure/TauriLaunchHealthGateway";

export const academicWorkspaceGateway = new TauriAcademicWorkspaceGateway();
export const schemeOfWorkGateway = new TauriSchemeOfWorkGateway();
export const lessonPlanningGateway = new TauriLessonPlanningGateway();
export const lessonPreparationGenerator = new LocalGranularLessonGenerator(
  new TauriGranularLessonCompletionGateway(),
);
export const preparationProgressGateway = new TauriPreparationProgressGateway();
export const lessonDocumentImporter = new TauriLessonDocumentImporter();
export const lessonPhotographReader = new TauriLessonPhotographReader();
export const photographReadingGateway = new TauriModelAcquisitionGateway(PHOTOGRAPH_READING_FILE);
export const classworkGateway = new TauriClassworkGateway();
export const lessonNoteGenerator = new LocalLessonNoteGenerator(
  new TauriLessonNoteCompletionGateway(),
);
export const lessonEvidenceGateway = new TauriLessonEvidenceGateway();
export const differentiatedClassworkGateway = new TauriDifferentiatedClassworkGateway();
export const modelAcquisitionGateway = new TauriModelAcquisitionGateway();
export const lessonModelGateway = new TauriLessonModelGateway();
export const classworkExportGateway = new TauriClassworkExportGateway();
export const lessonPlanExportGateway = new TauriLessonPlanExportGateway();
export const curriculumCatalogGateway = new TauriCurriculumCatalogGateway();
export const launchHealthGateway = new TauriLaunchHealthGateway();
export const classTimetableGateway = new TauriClassTimetableGateway();
