export interface LessonModelChoice {
  readonly id: string;
  readonly displayName: string;
  readonly summary: string;
  readonly downloadBytes: number;
  readonly memoryRequiredBytes: number;
  readonly fitsThisMachine: boolean;
  readonly isInstalled: boolean;
  readonly isSelected: boolean;
}

/**
 * Whether the teacher has anything to decide. One option is not a choice, and a
 * picker showing a single row asks a teacher to think about something that
 * cannot change.
 */
export function isWorthChoosing(choices: readonly LessonModelChoice[]): boolean {
  return choices.length > 1;
}

/**
 * What this option costs the machine, in the order a teacher weighs it: whether
 * it runs here at all, then what it takes to get.
 */
export function memoryGuidance(choice: LessonModelChoice): string {
  const needed = formatMemory(choice.memoryRequiredBytes);
  return choice.fitsThisMachine
    ? `Runs on this computer. Needs about ${needed} of memory free.`
    : `Needs about ${needed} of memory free, which is more than this computer has to spare right now.`;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
