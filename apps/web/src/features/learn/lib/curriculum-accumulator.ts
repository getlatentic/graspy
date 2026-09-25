import { createSlug, normalizeSlug } from "@/lib/slug";
import {
  planIdFor,
  type CurriculumData,
  type CurriculumSubject,
  type LearningSession,
} from "@/lib/curriculum-record";
import type { CurriculumResultEvent } from "@/lib/curriculum-api";
import type { PlanDetails } from "@/lib/plan-details";

const DEFAULT_GRADE_LEVEL = "middle school learners";

type CurriculumShape = Partial<PlanDetails> &
  Pick<PlanDetails, "country" | "language"> & {
    subjects: CurriculumSubject[];
    topics: Record<string, string[]>;
    nextSubjectSlug?: string | null;
    activeSession?: LearningSession;
    createdAt?: number;
    planId?: string;
  };

export function buildCurriculum({
  subjects,
  topics,
  nextSubjectSlug,
  activeSession,
  createdAt = Date.now(),
  planId,
  ...details
}: CurriculumShape): CurriculumData {
  return {
    id: "current",
    ...details,
    gradeLevel: details.gradeLevel ?? DEFAULT_GRADE_LEVEL,
    subjects,
    // Copied so the persisted record shares no arrays with a live accumulator.
    topics: Object.fromEntries(
      Object.entries(topics).map(([slug, list]) => [slug, [...list]]),
    ),
    activeSession,
    assessment: { nextSubject: nextSubjectSlug ?? null },
    createdAt,
    updatedAt: Date.now(),
    planId: planId ?? planIdFor(createdAt),
  };
}

export function emptyCurriculum(): CurriculumData {
  return buildCurriculum({
    country: "",
    language: "",
    gradeLevel: "",
    subjects: [],
    topics: {},
  });
}

// The stream names subjects as strings or objects, repeats them, and keys
// topics by slug or display name: key by slug, fall back to name, update repeats.
export class CurriculumAccumulator {
  private readonly subjectsBySlug = new Map<string, CurriculumSubject>();
  private readonly topicsBySlug: Record<string, string[]> = {};

  constructor(initial: CurriculumSubject[] = []) {
    for (const subject of initial) {
      this.subjectsBySlug.set(subject.slug, { ...subject });
    }
  }

  get subjects(): CurriculumSubject[] {
    return Array.from(this.subjectsBySlug.values());
  }

  get topics(): Record<string, string[]> {
    return { ...this.topicsBySlug };
  }

  get firstSubject(): CurriculumSubject | null {
    return this.subjects[0] ?? null;
  }

  private findByName(name: string): CurriculumSubject | null {
    for (const subject of this.subjectsBySlug.values()) {
      if (subject.name === name) return subject;
    }
    return null;
  }

  apply(chunk: CurriculumResultEvent): boolean {
    return [this.applySubjects(chunk), this.applyTopics(chunk)].some(Boolean);
  }

  private applySubjects(chunk: CurriculumResultEvent): boolean {
    if (!Array.isArray(chunk.subjects)) return false;
    let changed = false;
    for (const entry of chunk.subjects) {
      const added =
        typeof entry === "string" ? this.addName(entry) : this.addEntry(entry);
      changed = added || changed;
    }
    return changed;
  }

  private addName(raw: string): boolean {
    const name = raw.trim();
    if (!name || this.findByName(name)) return false;
    const slug = createSlug(name, new Set(this.subjectsBySlug.keys()));
    if (this.subjectsBySlug.has(slug)) return false;
    this.subjectsBySlug.set(slug, { name, slug });
    return true;
  }

  private addEntry(entry: CurriculumSubject): boolean {
    const name = entry.name.trim();
    // The slug field may hold a display name; the name lookup prevents a duplicate.
    const slug = normalizeSlug(entry.slug?.trim() || name);
    const existing = this.subjectsBySlug.get(slug) ?? this.findByName(name);
    if (!existing) {
      this.subjectsBySlug.set(slug, { name, slug });
      return true;
    }
    if (existing.name === name) return false;
    existing.name = name;
    return true;
  }

  private applyTopics(chunk: CurriculumResultEvent): boolean {
    if (!chunk.topics || Object.keys(chunk.topics).length === 0) return false;

    let changed = false;

    for (const [key, topics] of Object.entries(chunk.topics)) {
      if (!Array.isArray(topics) || topics.length === 0) continue;

      const subject =
        this.subjectsBySlug.get(normalizeSlug(key)) ?? this.findByName(key);
      this.topicsBySlug[subject ? subject.slug : normalizeSlug(key)] = [
        ...topics,
      ];
      changed = true;
    }

    return changed;
  }
}
