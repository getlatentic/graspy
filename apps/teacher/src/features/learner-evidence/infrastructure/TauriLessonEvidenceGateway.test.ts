import { describe, expect, it, vi } from "vitest";

import { TauriLessonEvidenceGateway } from "./TauriLessonEvidenceGateway";

describe("TauriLessonEvidenceGateway", () => {
  it("rejects malformed native snapshots", async () => {
    const gateway = new TauriLessonEvidenceGateway(vi.fn().mockResolvedValue({ lesson: { topic: "Missing identifiers" } }));
    await expect(gateway.getWorkspace({ context: { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" }, lessonId: "lesson" })).rejects.toThrow();
  });
});
