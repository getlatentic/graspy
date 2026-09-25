import type {
  ClassworkFigure,
  ClassworkKind,
  ClassworkSection,
  ClassworkSourceSummary,
  ClassworkWorkspaceSnapshot,
} from "./classwork";

export interface ClassworkDocumentBlock {
  readonly block: ClassworkSection["blocks"][number];
  readonly label: string;
  readonly figuresAfter: ClassworkFigure[];
}

export interface ClassworkDocumentSection {
  readonly section: ClassworkSection;
  readonly blocks: ClassworkDocumentBlock[];
}

export interface ClassworkTraceabilityRow {
  readonly item: string;
  readonly learningGoals: string[];
  readonly sources: ClassworkSourceSummary[];
  readonly teacherEdited: boolean;
}

export interface ClassworkDocument {
  readonly sections: ClassworkDocumentSection[];
  readonly traceability: ClassworkTraceabilityRow[];
  readonly citedSources: ClassworkSourceSummary[];
}

const labels: Record<ClassworkKind, string> = {
  review: "Review",
  worked_example: "Worked example",
  practice: "Practice",
  solution: "Solution",
};

export function buildClassworkDocument(
  snapshot: ClassworkWorkspaceSnapshot,
): ClassworkDocument | null {
  if (!snapshot.run) return null;
  const sections = snapshot.run.sections
    .filter((section) => section.status === "done")
    .sort((left, right) => left.sequence - right.sequence);
  if (sections.length === 0) return null;

  const sourcesByKey = new Map(snapshot.run.sources.map((source) => [source.key, source]));
  const remainingFigures = new Map(
    snapshot.run.figures
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .map((figure) => [figure.id, figure]),
  );
  const documentSections = sections.map((section) => ({
    section,
    blocks: section.blocks.map((block) => {
      const figuresAfter = [...remainingFigures.values()].filter((figure) =>
        block.sourceMaterialKeys.includes(figure.sourceMaterialKey));
      for (const figure of figuresAfter) remainingFigures.delete(figure.id);
      return { block, label: labels[block.kind], figuresAfter };
    }),
  }));

  const finalBlock = documentSections.at(-1)?.blocks.at(-1);
  if (finalBlock) finalBlock.figuresAfter.push(...remainingFigures.values());

  const traceability = documentSections.flatMap(({ section, blocks }) =>
    blocks.map(({ block, label }) => ({
      item: `Lesson step ${section.sequence} · ${label}`,
      learningGoals: block.learningGoalNumbers.map((number) =>
        requiredItem(snapshot.lesson.learningGoals, number - 1, "learning goal")),
      sources: block.sourceMaterialKeys.map((key) =>
        requiredMapValue(sourcesByKey, key, "published source")),
      teacherEdited: block.teacherEdited,
    })),
  );
  const citedSourceKeys = new Set([
    ...traceability.flatMap(({ sources }) => sources.map(({ key }) => key)),
    ...snapshot.run.figures.map(({ sourceMaterialKey }) => sourceMaterialKey),
  ]);
  return {
    sections: documentSections,
    traceability,
    citedSources: snapshot.run.sources.filter(({ key }) => citedSourceKeys.has(key)),
  };
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Saved lesson instructionalMaterials reference an unavailable ${label}.`);
  return value;
}

function requiredMapValue<K, V>(values: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = values.get(key);
  if (value === undefined) throw new Error(`Saved lesson instructionalMaterials reference an unavailable ${label}.`);
  return value;
}
