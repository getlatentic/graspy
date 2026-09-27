// Fixed when a conversation starts; a rebuilt plan is a new conversation.
export type ThreadScope =
  | { kind: "topic"; planId: string; subjectSlug: string; topic: string }
  | { kind: "subject"; planId: string; subjectSlug: string }
  | { kind: "general"; planId: string }
  | { kind: "earlier" };

/** One conversation for each: a learner's devices find each other's copy by it. */
export function scopeKey(scope: ThreadScope): string {
  if (scope.kind === "topic") {
    return `topic\u0000${scope.planId}\u0000${scope.subjectSlug}\u0000${scope.topic}`;
  }
  if (scope.kind === "subject") {
    return `subject\u0000${scope.planId}\u0000${scope.subjectSlug}`;
  }
  return scope.kind === "general" ? `general\u0000${scope.planId}` : "earlier";
}
