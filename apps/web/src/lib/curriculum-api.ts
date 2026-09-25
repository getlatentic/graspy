import type { CurriculumSubject } from "@/lib/curriculum-record";
import { createSSEStream } from "@/lib/api/sse";
import { API_BASE_URL } from "@/lib/env";
import { getJson } from "@/lib/api/request";

export interface CurriculumRequest {
  country: string;
  language: string;
  gradeLevel?: string;
  subjects?: string[];
}

type CurriculumSubjectEntry = CurriculumSubject | string;

export interface CurriculumResultEvent {
  type: "result";
  subjects?: CurriculumSubjectEntry[];
  topics?: Record<string, string[]>;
}

interface CurriculumStatusEvent {
  type: "status";
  message: string;
}

interface CurriculumErrorEvent {
  type: "error";
  message: string;
}

export type CurriculumStreamEvent =
  CurriculumResultEvent | CurriculumStatusEvent | CurriculumErrorEvent;

interface LearningPathStep {
  title: string;
  level: string;
}

/** The topics from what a learner can study now to a goal they named. */
export interface LearningPath {
  subject: string;
  goal: string;
  steps: LearningPathStep[];
}

export async function planLearningPath(request: {
  country: string;
  language: string;
  gradeLevel?: string;
  goal: string;
}): Promise<LearningPath> {
  const params = new URLSearchParams({
    country: request.country,
    language: request.language,
    goal: request.goal,
  });
  if (request.gradeLevel) params.set("gradeLevel", request.gradeLevel);
  return getJson<LearningPath>(
    `${API_BASE_URL}/curriculum/path?${params.toString()}`,
  );
}

export function streamCurriculum(
  request: CurriculumRequest,
): AsyncGenerator<CurriculumStreamEvent> {
  const url = new URL(`${API_BASE_URL}/curriculum/generate-stream`);
  url.searchParams.set("country", request.country);
  url.searchParams.set("language", request.language);
  if (request.gradeLevel) url.searchParams.set("gradeLevel", request.gradeLevel);
  for (const subject of request.subjects ?? []) {
    url.searchParams.append("subject", subject);
  }
  return createSSEStream<CurriculumStreamEvent>(url.toString());
}
