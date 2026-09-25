import { z } from "zod";

export const curriculumPackageTrustSchema = z.enum(["verified", "school"]);
export const curriculumPackageOriginSchema = z.enum(["bundled", "imported"]);

const curriculumPackageSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  jurisdictionId: z.string().min(1),
  jurisdiction: z.string().min(1),
  edition: z.string().min(1),
  rightsName: z.string().min(1),
  attribution: z.string().min(1),
  trust: curriculumPackageTrustSchema,
  origin: curriculumPackageOriginSchema,
  installedAt: z.string().min(1),
  /**
   * Earlier conversions of this same curriculum that are still installed. They
   * stay because lessons already cite them; the count is what the teacher is
   * told, rather than a second row with the same name on it.
   */
  earlierVersionsKept: z.number().int().nonnegative(),
});

const curriculumCourseOptionSchema = z.object({
  id: z.string().min(1),
  packageId: z.string().min(1),
  jurisdictionId: z.string().min(1),
  framework: z.string().min(1),
  subjectId: z.string().min(1),
  subject: z.string().min(1),
  gradeLevelId: z.string().min(1),
  gradeLevel: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  edition: z.string().min(1),
  trust: curriculumPackageTrustSchema,
});

export const curriculumCatalogSnapshotSchema = z.object({
  packages: z.array(curriculumPackageSummarySchema),
  courses: z.array(curriculumCourseOptionSchema),
});

export type CurriculumCatalogSnapshot = z.infer<
  typeof curriculumCatalogSnapshotSchema
>;
export type CurriculumCourseOption = CurriculumCatalogSnapshot["courses"][number];

export interface InstallCurriculumPackageRequest {
  readonly packageContents: string;
}

export interface AssignCurriculumCourseRequest {
  readonly assignmentId: string;
  readonly curriculumCourseId: string;
}

export function compatibleCurriculumCourses(
  catalog: CurriculumCatalogSnapshot,
  subjectId: string,
  gradeLevelId: string,
): CurriculumCourseOption[] {
  return catalog.courses.filter(
    (course) =>
      course.subjectId === subjectId && course.gradeLevelId === gradeLevelId,
  );
}
