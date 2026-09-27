export const SUBJECTS_PATH = "/app/learn/subjects";

export const subjectPath = (subjectSlug: string) =>
  `/app/learn/${encodeURIComponent(subjectSlug)}`;

export const lessonPath = (subjectSlug: string, topicIndex: number) =>
  `${subjectPath(subjectSlug)}/lesson/${topicIndex}`;
