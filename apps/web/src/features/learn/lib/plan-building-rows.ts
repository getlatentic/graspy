import { topicsOf, type CurriculumData } from "@/lib/curriculum-record";

export type RowState = "done" | "working" | "waiting";

export type BuildingRow =
  | { kind: "choosing"; state: RowState }
  | {
      kind: "subject";
      slug: string;
      name: string;
      topicCount: number;
      state: RowState;
    }
  | { kind: "lesson"; state: RowState };

/** What the plan has so far, as the rows of its progress: each subject once its topics have come,
 * and the first lesson once the plan is ready for it. Before the plan names a subject there is
 * only the choosing of them. */
export function buildingRows(
  plan: CurriculumData | null,
  makingFirstLesson: boolean,
): BuildingRow[] {
  const subjects = plan?.subjects ?? [];
  if (subjects.length === 0) {
    return [
      { kind: "choosing", state: "working" },
      { kind: "lesson", state: "waiting" },
    ];
  }
  const rows: BuildingRow[] = subjects.map(({ slug, name }) => {
    const topicCount = topicsOf(plan, slug).length;
    return {
      kind: "subject",
      slug,
      name,
      topicCount,
      state: topicCount > 0 ? "done" : "working",
    };
  });
  return [
    ...rows,
    { kind: "lesson", state: makingFirstLesson ? "working" : "waiting" },
  ];
}
