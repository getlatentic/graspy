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
    };

/** What the plan has so far, as the rows of its progress: each subject done once its topics have
 * come, the first one without topics being worked on. The plan is done when its topics are in; the
 * first lesson is made after. Before the plan names a subject there is only the choosing of them. */
export function buildingRows(plan: CurriculumData | null): BuildingRow[] {
  const subjects = plan?.subjects ?? [];
  if (subjects.length === 0) return [{ kind: "choosing", state: "working" }];
  const counts = subjects.map(({ slug }) => topicsOf(plan, slug).length);
  const first = counts.findIndex((count) => count === 0);
  return subjects.map(({ slug, name }, index) => ({
    kind: "subject",
    slug,
    name,
    topicCount: counts[index],
    state: counts[index] > 0 ? "done" : index === first ? "working" : "waiting",
  }));
}
