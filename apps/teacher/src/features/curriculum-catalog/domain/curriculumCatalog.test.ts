import { describe, expect, it } from "vitest";

import {
  compatibleCurriculumCourses,
  curriculumCatalogSnapshotSchema,
} from "./curriculumCatalog";

const course = {
  id: "course-maths-jss1",
  packageId: "package-ng",
  jurisdictionId: "jurisdiction-ng",
  framework: "Basic education curriculum",
  subjectId: "subject-mathematics",
  subject: "Mathematics",
  gradeLevelId: "grade-jss-1",
  gradeLevel: "JSS 1",
  title: "Mathematics · JSS 1",
  publisher: "Curriculum office",
  edition: "2026",
  trust: "verified" as const,
};

describe("curriculum catalog", () => {
  it("offers only courses matching both subject and class level", () => {
    const catalog = curriculumCatalogSnapshotSchema.parse({
      packages: [],
      courses: [
        course,
        { ...course, id: "course-maths-jss2", gradeLevelId: "grade-jss-2" },
        { ...course, id: "course-english", subjectId: "subject-english" },
      ],
    });

    expect(
      compatibleCurriculumCourses(
        catalog,
        "subject-mathematics",
        "grade-jss-1",
      ).map(({ id }) => id),
    ).toEqual(["course-maths-jss1"]);
  });
});
