import type {
  LessonBlock,
  LessonCheck,
  LessonContent,
  LessonContentStep,
} from "./lessonContent";

/**
 * Editing a hand-written lesson: add, edit, reorder and remove its goals, steps,
 * blocks and checks. A hand-written lesson answers to no curriculum or evidence,
 * so — unlike the generated-lesson editors — nothing here aligns a step to an
 * objective or keeps a role at a boundary. A teacher builds the lesson freely,
 * and every operation returns a new lesson so the surface can hold it in state.
 */

export type MoveDirection = "up" | "down";
export type LessonBlockType = "explanation" | "worked_example" | "practice";

export function emptyLessonContent(): LessonContent {
  return { objectives: [], instructionalMaterials: [], steps: [], checks: [] };
}

export function addObjective(content: LessonContent): LessonContent {
  return { ...content, objectives: [...content.objectives, ""] };
}

export function updateObjective(
  content: LessonContent,
  index: number,
  statement: string,
): LessonContent {
  return { ...content, objectives: replaceAt(content.objectives, index, statement) };
}

export function removeObjective(content: LessonContent, index: number): LessonContent {
  return { ...content, objectives: removeAt(content.objectives, index) };
}

export function moveObjective(
  content: LessonContent,
  index: number,
  direction: MoveDirection,
): LessonContent {
  return { ...content, objectives: moveAt(content.objectives, index, direction) };
}

export function addInstructionalMaterial(content: LessonContent): LessonContent {
  return { ...content, instructionalMaterials: [...content.instructionalMaterials, ""] };
}

export function updateInstructionalMaterial(
  content: LessonContent,
  index: number,
  material: string,
): LessonContent {
  return { ...content, instructionalMaterials: replaceAt(content.instructionalMaterials, index, material) };
}

export function removeInstructionalMaterial(content: LessonContent, index: number): LessonContent {
  return { ...content, instructionalMaterials: removeAt(content.instructionalMaterials, index) };
}

export function moveInstructionalMaterial(
  content: LessonContent,
  index: number,
  direction: MoveDirection,
): LessonContent {
  return { ...content, instructionalMaterials: moveAt(content.instructionalMaterials, index, direction) };
}

export function addStep(content: LessonContent): LessonContent {
  const step: LessonContentStep = {
    id: nextId("step", content.steps.map(({ id }) => id)),
    title: "",
    durationMinutes: null,
    summary: "",
    blocks: [],
  };
  return { ...content, steps: [...content.steps, step] };
}

export function updateStep(
  content: LessonContent,
  stepId: string,
  patch: Partial<Pick<LessonContentStep, "title" | "summary" | "durationMinutes">>,
): LessonContent {
  const index = requiredIndex(content.steps, stepId, "lesson step");
  return {
    ...content,
    steps: replaceAt(content.steps, index, { ...content.steps[index], ...patch }),
  };
}

export function removeStep(content: LessonContent, stepId: string): LessonContent {
  return { ...content, steps: content.steps.filter(({ id }) => id !== stepId) };
}

export function moveStep(
  content: LessonContent,
  stepId: string,
  direction: MoveDirection,
): LessonContent {
  const index = requiredIndex(content.steps, stepId, "lesson step");
  return { ...content, steps: moveAt(content.steps, index, direction) };
}

export function addStepBlock(
  content: LessonContent,
  stepId: string,
  type: LessonBlockType,
): LessonContent {
  const index = requiredIndex(content.steps, stepId, "lesson step");
  const step = content.steps[index];
  const block = createBlock(
    type,
    nextId("block", content.steps.flatMap(({ blocks }) => blocks.map(({ id }) => id))),
  );
  return {
    ...content,
    steps: replaceAt(content.steps, index, { ...step, blocks: [...step.blocks, block] }),
  };
}

export function setStepBlock(
  content: LessonContent,
  stepId: string,
  block: LessonBlock,
): LessonContent {
  const stepIndex = requiredIndex(content.steps, stepId, "lesson step");
  const step = content.steps[stepIndex];
  const blockIndex = requiredIndex(step.blocks, block.id, "lesson content");
  return {
    ...content,
    steps: replaceAt(content.steps, stepIndex, {
      ...step,
      blocks: replaceAt(step.blocks, blockIndex, block),
    }),
  };
}

export function removeStepBlock(
  content: LessonContent,
  stepId: string,
  blockId: string,
): LessonContent {
  const index = requiredIndex(content.steps, stepId, "lesson step");
  const step = content.steps[index];
  return {
    ...content,
    steps: replaceAt(content.steps, index, {
      ...step,
      blocks: step.blocks.filter(({ id }) => id !== blockId),
    }),
  };
}

export function moveStepBlock(
  content: LessonContent,
  stepId: string,
  blockId: string,
  direction: MoveDirection,
): LessonContent {
  const stepIndex = requiredIndex(content.steps, stepId, "lesson step");
  const step = content.steps[stepIndex];
  const blockIndex = requiredIndex(step.blocks, blockId, "lesson content");
  return {
    ...content,
    steps: replaceAt(content.steps, stepIndex, {
      ...step,
      blocks: moveAt(step.blocks, blockIndex, direction),
    }),
  };
}

export function addCheck(content: LessonContent): LessonContent {
  const check: LessonCheck = {
    id: nextId("check", content.checks.map(({ id }) => id)),
    question: "",
    expectedAnswer: "",
  };
  return { ...content, checks: [...content.checks, check] };
}

export function updateCheck(
  content: LessonContent,
  checkId: string,
  patch: Partial<Pick<LessonCheck, "question" | "expectedAnswer">>,
): LessonContent {
  const index = requiredIndex(content.checks, checkId, "check for understanding");
  return {
    ...content,
    checks: replaceAt(content.checks, index, { ...content.checks[index], ...patch }),
  };
}

export function removeCheck(content: LessonContent, checkId: string): LessonContent {
  return { ...content, checks: content.checks.filter(({ id }) => id !== checkId) };
}

export function moveCheck(
  content: LessonContent,
  checkId: string,
  direction: MoveDirection,
): LessonContent {
  const index = requiredIndex(content.checks, checkId, "check for understanding");
  return { ...content, checks: moveAt(content.checks, index, direction) };
}

function createBlock(type: LessonBlockType, id: string): LessonBlock {
  switch (type) {
    case "explanation":
      return { type, id, content: "" };
    case "worked_example":
      return { type, id, problem: "", steps: [{ label: "", content: "" }], finalAnswer: "" };
    case "practice":
      return { type, id, question: "", expectedAnswer: "", hints: [] };
  }
}

function nextId(prefix: string, values: string[]): string {
  const existing = new Set(values);
  for (let sequence = 1; sequence <= existing.size + 1; sequence += 1) {
    const candidate = `${prefix}-${sequence}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`A unique ${prefix} reference could not be created.`);
}

function requiredIndex<T extends { readonly id: string }>(
  values: readonly T[],
  id: string,
  label: string,
): number {
  const index = values.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new Error(`The selected ${label} is no longer available.`);
  return index;
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => (currentIndex === index ? value : current));
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, currentIndex) => currentIndex !== index);
}

function moveAt<T>(values: readonly T[], index: number, direction: MoveDirection): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= values.length || target < 0 || target >= values.length) {
    throw new Error("The selected item is already at that boundary.");
  }
  const next = [...values];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
