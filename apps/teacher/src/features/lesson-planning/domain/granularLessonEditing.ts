import type {
  GranularLessonPlan,
  GranularLessonRecord,
  GranularLessonStep,
  LessonContentBlock,
} from "./granularLesson";

export function updateGranularPlan(
  record: GranularLessonRecord,
  update: (plan: GranularLessonPlan) => GranularLessonPlan,
): GranularLessonRecord {
  return { ...record, plan: update(record.plan) };
}

export function replaceAt<T>(values: T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) =>
    currentIndex === index ? value : current,
  );
}

export type MoveDirection = "up" | "down";
export type EditableContentBlockType =
  | "explanation"
  | "worked_example"
  | "practice";

export function moveLessonObjective(
  plan: GranularLessonPlan,
  objectiveId: string,
  direction: MoveDirection,
): GranularLessonPlan {
  const objectiveIndex = requiredIndex(
    plan.lessonObjectives,
    objectiveId,
    "learning goal",
  );
  const lessonObjectives = resequence(
    moveAt(plan.lessonObjectives, objectiveIndex, direction),
  );
  const objectiveOrder = new Map(
    lessonObjectives.map(({ id }, index) => [id, index]),
  );
  const introduction = plan.steps.filter(({ role }) => role === "introduction");
  const core = plan.steps
    .filter(({ role }) => role === "core")
    .map((step, originalIndex) => ({ step, originalIndex }))
    .sort((left, right) => {
      const objectiveDifference =
        (objectiveOrder.get(left.step.lessonObjectiveId ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (objectiveOrder.get(right.step.lessonObjectiveId ?? "") ?? Number.MAX_SAFE_INTEGER);
      return objectiveDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ step }) => step);
  const evaluation = plan.steps
    .filter(({ role }) => role === "evaluation")
    .map((step) => ({
      ...step,
      blocks: step.blocks
        .map((block, originalIndex) => ({ block, originalIndex }))
        .sort((left, right) => {
          const leftObjective =
            left.block.type === "practice"
              ? left.block.lessonObjectiveId
              : "";
          const rightObjective =
            right.block.type === "practice"
              ? right.block.lessonObjectiveId
              : "";
          const objectiveDifference =
            (objectiveOrder.get(leftObjective) ?? Number.MAX_SAFE_INTEGER) -
            (objectiveOrder.get(rightObjective) ?? Number.MAX_SAFE_INTEGER);
          return objectiveDifference || left.originalIndex - right.originalIndex;
        })
        .map(({ block }) => block),
    }));
  const assessmentGroups = new Map<string, typeof plan.assessments>();
  for (const assessment of plan.assessments) {
    const group = assessmentGroups.get(assessment.lessonObjectiveId) ?? [];
    group.push(assessment);
    assessmentGroups.set(assessment.lessonObjectiveId, group);
  }

  return {
    ...plan,
    lessonObjectives,
    steps: resequence([...introduction, ...core, ...evaluation]),
    assessments: lessonObjectives.flatMap(
      ({ id }) => assessmentGroups.get(id) ?? [],
    ),
  };
}

export function addLessonObjective(
  plan: GranularLessonPlan,
  alignedObjectiveId: string,
): GranularLessonPlan {
  const alignment = requiredById(
    plan.lessonObjectives,
    alignedObjectiveId,
    "learning goal alignment",
  );
  const component = requiredById(
    plan.knowledgeComponents,
    alignment.knowledgeComponentId,
    "knowledge component",
  );
  const id = nextId(
    "lesson-objective",
    plan.lessonObjectives.map(({ id: value }) => value),
  );
  const lessonObjectives = resequence([
    ...plan.lessonObjectives,
    { ...alignment, id, statement: "" },
  ]);
  const step = createCoreStep(plan, id, component.knowledgeType);
  const evaluationIndex = plan.steps.findIndex(
    ({ role }) => role === "evaluation",
  );
  if (evaluationIndex < 0) {
    throw new Error("The lesson needs a final check before a learning goal can be added.");
  }
  const evaluation = plan.steps[evaluationIndex];
  const evaluationQuestion: LessonContentBlock = {
    type: "practice",
    id: nextBlockId(plan, "practice"),
    lessonObjectiveId: id,
    question: "",
    expectedAnswer: "",
    hints: [],
  };
  const steps = [...plan.steps];
  steps.splice(evaluationIndex, 0, step);
  steps[evaluationIndex + 1] = {
    ...evaluation,
    blocks: [...evaluation.blocks, evaluationQuestion],
  };

  return {
    ...plan,
    lessonObjectives,
    steps: resequence(steps),
    assessments: [
      ...plan.assessments,
      createAssessment(plan, id, component.id),
    ],
  };
}

export function removeLessonObjective(
  plan: GranularLessonPlan,
  objectiveId: string,
): GranularLessonPlan {
  requiredById(plan.lessonObjectives, objectiveId, "learning goal");
  if (plan.lessonObjectives.length === 1) {
    throw new Error("A lesson needs at least one learning goal.");
  }

  return {
    ...plan,
    lessonObjectives: resequence(
      plan.lessonObjectives.filter(({ id }) => id !== objectiveId),
    ),
    steps: resequence(
      plan.steps
        .filter(
          (step) =>
            step.role !== "core" || step.lessonObjectiveId !== objectiveId,
        )
        .map((step) => ({
          ...step,
          blocks: step.blocks.filter(
            (block) =>
              block.type !== "practice" ||
              block.lessonObjectiveId !== objectiveId,
          ),
        })),
    ),
    assessments: plan.assessments.filter(
      ({ lessonObjectiveId }) => lessonObjectiveId !== objectiveId,
    ),
  };
}

export function addCoreStep(
  plan: GranularLessonPlan,
  objectiveId: string,
): GranularLessonPlan {
  const objective = requiredById(
    plan.lessonObjectives,
    objectiveId,
    "learning goal",
  );
  const component = requiredById(
    plan.knowledgeComponents,
    objective.knowledgeComponentId,
    "knowledge component",
  );
  const evaluationIndex = plan.steps.findIndex(
    ({ role }) => role === "evaluation",
  );
  if (evaluationIndex < 0) {
    throw new Error("The lesson needs a final check before a step can be added.");
  }
  const steps = [...plan.steps];
  steps.splice(
    evaluationIndex,
    0,
    createCoreStep(plan, objectiveId, component.knowledgeType),
  );
  return { ...plan, steps: resequence(steps) };
}

export function removeCoreStep(
  plan: GranularLessonPlan,
  stepId: string,
): GranularLessonPlan {
  const step = requiredById(plan.steps, stepId, "lesson step");
  if (step.role !== "core" || step.lessonObjectiveId === null) {
    throw new Error("Only a core lesson step can be removed.");
  }
  const alignedSteps = plan.steps.filter(
    ({ role, lessonObjectiveId }) =>
      role === "core" && lessonObjectiveId === step.lessonObjectiveId,
  );
  if (alignedSteps.length === 1) {
    throw new Error("Every learning goal needs at least one core lesson step.");
  }
  return {
    ...plan,
    steps: resequence(plan.steps.filter(({ id }) => id !== stepId)),
  };
}

export function moveCoreStep(
  plan: GranularLessonPlan,
  stepId: string,
  direction: MoveDirection,
): GranularLessonPlan {
  const index = requiredIndex(plan.steps, stepId, "lesson step");
  if (plan.steps[index].role !== "core") {
    throw new Error("The introduction and final check stay at the lesson boundaries.");
  }
  const target = direction === "up" ? index - 1 : index + 1;
  if (plan.steps[target]?.role !== "core") {
    throw new Error("Core lesson steps cannot cross the lesson boundaries.");
  }
  return { ...plan, steps: resequence(swap(plan.steps, index, target)) };
}

export function addContentBlock(
  plan: GranularLessonPlan,
  stepId: string,
  type: EditableContentBlockType,
  lessonObjectiveId?: string,
): GranularLessonPlan {
  const stepIndex = requiredIndex(plan.steps, stepId, "lesson step");
  const step = plan.steps[stepIndex];
  assertBlockAllowed(step, type);
  const objectiveId =
    step.role === "core" ? step.lessonObjectiveId : lessonObjectiveId;
  if (type === "practice" && !objectiveId) {
    throw new Error("Choose the learning goal this practice checks.");
  }
  if (objectiveId) {
    requiredById(plan.lessonObjectives, objectiveId, "learning goal");
  }
  const block = createContentBlock(plan, type, objectiveId ?? null);
  return {
    ...plan,
    steps: replaceAt(plan.steps, stepIndex, {
      ...step,
      blocks: [...step.blocks, block],
    }),
  };
}

export function addSourceVisualBlock(
  plan: GranularLessonPlan,
  stepId: string,
  figure: GranularLessonRecord["sourceEvidenceSnapshot"]["figures"][number],
): GranularLessonPlan {
  const stepIndex = requiredIndex(plan.steps, stepId, "lesson step");
  const step = plan.steps[stepIndex];
  if (step.role === "evaluation") {
    throw new Error("The final check can contain questions only.");
  }
  const block: LessonContentBlock = {
    type: "visual",
    id: nextId(
      "lesson-visual",
      plan.steps.flatMap(({ blocks }) => blocks.map(({ id }) => id)),
    ),
    sourceRecordId: figure.sourceRecordId,
    assetFileName: figure.assetFileName,
    figureSha256: figure.sha256,
    caption: figure.caption,
    altText: figure.altText,
  };
  return {
    ...plan,
    steps: replaceAt(plan.steps, stepIndex, {
      ...step,
      blocks: [...step.blocks, block],
    }),
  };
}

export function removeContentBlock(
  plan: GranularLessonPlan,
  stepId: string,
  blockId: string,
): GranularLessonPlan {
  const stepIndex = requiredIndex(plan.steps, stepId, "lesson step");
  const step = plan.steps[stepIndex];
  requiredById(step.blocks, blockId, "lesson content");
  return {
    ...plan,
    steps: replaceAt(plan.steps, stepIndex, {
      ...step,
      blocks: step.blocks.filter(({ id }) => id !== blockId),
    }),
  };
}

export function moveContentBlock(
  plan: GranularLessonPlan,
  stepId: string,
  blockId: string,
  direction: MoveDirection,
): GranularLessonPlan {
  const stepIndex = requiredIndex(plan.steps, stepId, "lesson step");
  const step = plan.steps[stepIndex];
  const blockIndex = requiredIndex(step.blocks, blockId, "lesson content");
  return {
    ...plan,
    steps: replaceAt(plan.steps, stepIndex, {
      ...step,
      blocks: moveAt(step.blocks, blockIndex, direction),
    }),
  };
}

export function addAssessment(
  plan: GranularLessonPlan,
  objectiveId: string,
): GranularLessonPlan {
  const objective = requiredById(
    plan.lessonObjectives,
    objectiveId,
    "learning goal",
  );
  return {
    ...plan,
    assessments: [
      ...plan.assessments,
      createAssessment(plan, objectiveId, objective.knowledgeComponentId),
    ],
  };
}

export function removeAssessment(
  plan: GranularLessonPlan,
  assessmentId: string,
): GranularLessonPlan {
  const assessment = requiredById(
    plan.assessments,
    assessmentId,
    "check for understanding",
  );
  const aligned = plan.assessments.filter(
    ({ lessonObjectiveId }) =>
      lessonObjectiveId === assessment.lessonObjectiveId,
  );
  if (aligned.length === 1) {
    throw new Error(
      "Every learning goal needs at least one check for understanding.",
    );
  }
  return {
    ...plan,
    assessments: plan.assessments.filter(({ id }) => id !== assessmentId),
  };
}

export function moveAssessment(
  plan: GranularLessonPlan,
  assessmentId: string,
  direction: MoveDirection,
): GranularLessonPlan {
  const index = requiredIndex(
    plan.assessments,
    assessmentId,
    "check for understanding",
  );
  return {
    ...plan,
    assessments: moveAt(plan.assessments, index, direction),
  };
}

function createCoreStep(
  plan: GranularLessonPlan,
  lessonObjectiveId: string,
  knowledgeType: GranularLessonStep["knowledgeType"],
): GranularLessonStep {
  return {
    id: nextId(
      "lesson-step",
      plan.steps.map(({ id }) => id),
    ),
    sequence: plan.steps.length,
    role: "core",
    title: "",
    summary: "",
    durationMinutes: 10,
    lessonObjectiveId,
    knowledgeType,
    teacherActivities: [],
    learnerActivities: [],
    blocks: [],
  };
}

function createContentBlock(
  plan: GranularLessonPlan,
  type: EditableContentBlockType,
  lessonObjectiveId: string | null,
): LessonContentBlock {
  const id = nextBlockId(plan, type);
  switch (type) {
    case "explanation":
      return { type, id, content: "" };
    case "worked_example":
      return {
        type,
        id,
        problem: "",
        steps: [{ label: "", content: "" }],
        finalAnswer: "",
      };
    case "practice":
      if (lessonObjectiveId === null) {
        throw new Error("Practice must align to a learning goal.");
      }
      return {
        type,
        id,
        lessonObjectiveId,
        question: "",
        expectedAnswer: "",
        hints: [],
      };
  }
}

function createAssessment(
  plan: GranularLessonPlan,
  lessonObjectiveId: string,
  knowledgeComponentId: string,
): GranularLessonPlan["assessments"][number] {
  const component = requiredById(
    plan.knowledgeComponents,
    knowledgeComponentId,
    "knowledge component",
  );
  return {
    id: nextId(
      "assessment",
      plan.assessments.map(({ id }) => id),
    ),
    lessonObjectiveId,
    knowledgeComponentId,
    question: "",
    expectedAnswer: "",
    bloomLevel: component.bloomLevel,
    rubric: [],
    supportingRecordIds: [...component.supportingRecordIds],
  };
}

function assertBlockAllowed(
  step: GranularLessonStep,
  type: EditableContentBlockType,
): void {
  if (step.role === "introduction" && type !== "explanation") {
    throw new Error("The introduction can add explanations only.");
  }
  if (step.role === "evaluation" && type !== "practice") {
    throw new Error("The final check can add questions only.");
  }
}

function nextBlockId(
  plan: GranularLessonPlan,
  type: EditableContentBlockType,
): string {
  return nextId(
    `lesson-${type.replace("_", "-")}`,
    plan.steps.flatMap(({ blocks }) => blocks.map(({ id }) => id)),
  );
}

function nextId(prefix: string, values: string[]): string {
  const existing = new Set(values);
  for (let sequence = 1; sequence <= existing.size + 1; sequence += 1) {
    const candidate = `${prefix}-${sequence}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`A unique ${prefix} reference could not be created.`);
}

function requiredById<T extends { readonly id: string }>(
  values: T[],
  id: string,
  label: string,
): T {
  const value = values.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`The selected ${label} is no longer available.`);
  return value;
}

function requiredIndex<T extends { readonly id: string }>(
  values: T[],
  id: string,
  label: string,
): number {
  const index = values.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new Error(`The selected ${label} is no longer available.`);
  return index;
}

function moveAt<T>(values: T[], index: number, direction: MoveDirection): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= values.length || target < 0 || target >= values.length) {
    throw new Error("The selected item is already at that boundary.");
  }
  return swap(values, index, target);
}

function swap<T>(values: T[], left: number, right: number): T[] {
  const next = [...values];
  [next[left], next[right]] = [next[right], next[left]];
  return next;
}

function resequence<T extends { readonly sequence: number }>(values: T[]): T[] {
  return values.map((value, index) => ({ ...value, sequence: index + 1 }));
}

export function updateContentBlock(
  block: LessonContentBlock,
  field: string,
  value: string | string[],
): LessonContentBlock {
  switch (block.type) {
    case "explanation":
      return field === "content" && typeof value === "string"
        ? { ...block, content: value }
        : block;
    case "worked_example":
      if (field === "problem" && typeof value === "string") {
        return { ...block, problem: value };
      }
      if (field === "finalAnswer" && typeof value === "string") {
        return { ...block, finalAnswer: value };
      }
      return block;
    case "practice":
      if (field === "question" && typeof value === "string") {
        return { ...block, question: value };
      }
      if (field === "expectedAnswer" && typeof value === "string") {
        return { ...block, expectedAnswer: value };
      }
      if (field === "hints" && Array.isArray(value)) {
        return { ...block, hints: value };
      }
      return block;
    case "visual":
      return block;
  }
}
