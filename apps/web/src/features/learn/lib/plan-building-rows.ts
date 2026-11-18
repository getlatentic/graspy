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

/** What the plan has so far, as the rows of its progress: each subject done once its topics have
 * come, the first one without topics being worked on, and the first lesson last. Before the plan
 * names a subject there is only the choosing of them. */
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
  const counts = subjects.map(({ slug }) => topicsOf(plan, slug).length);
  const first = counts.findIndex((count) => count === 0);
  const rows: BuildingRow[] = subjects.map(({ slug, name }, index) => ({
    kind: "subject",
    slug,
    name,
    topicCount: counts[index],
    state: counts[index] > 0 ? "done" : index === first ? "working" : "waiting",
  }));
  return [
    ...rows,
    { kind: "lesson", state: makingFirstLesson ? "working" : "waiting" },
  ];
}
