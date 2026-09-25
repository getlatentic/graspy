import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurriculumRequest,
  CurriculumStreamEvent,
} from "@/lib/curriculum-api";
import { generatePlan } from "./generate-plan";

const { streamCurriculum, saveCurriculum, deleteCurriculum } = vi.hoisted(
  () => ({
    streamCurriculum: vi.fn(),
    saveCurriculum: vi.fn(),
    deleteCurriculum: vi.fn(),
  }),
);
vi.mock("@/lib/curriculum-api", () => ({ streamCurriculum }));
vi.mock("@/lib/curriculum-db", () => ({ saveCurriculum, deleteCurriculum }));

function streams(...events: CurriculumStreamEvent[]) {
  streamCurriculum.mockImplementation(async function* () {
    yield* events;
  });
}

const request: CurriculumRequest = {
  country: "NG",
  language: "en",
  gradeLevel: "JSS 1",
  subjects: ["Mathematics"],
};

beforeEach(() => {
  vi.clearAllMocks();
  saveCurriculum.mockResolvedValue(undefined);
  deleteCurriculum.mockResolvedValue(undefined);
});

describe("generatePlan", () => {
  it("asks for the plan in English names and keeps what the stream made", async () => {
    streams(
      { type: "status", message: "Thinking" },
      { type: "result", subjects: ["Mathematics", "English Language"] },
      {
        type: "result",
        topics: {
          mathematics: ["Fractions", "Decimals"],
          "english-language": ["Nouns"],
        },
      },
    );

    await expect(generatePlan(request)).resolves.toEqual({
      subjectCount: 2,
      topicCount: 3,
    });
    expect(streamCurriculum).toHaveBeenCalledWith({
      ...request,
      country: "Nigeria",
      language: "English",
    });
    expect(deleteCurriculum).toHaveBeenCalled();
    expect(saveCurriculum).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "Nigeria",
        languageName: "English",
        gradeLevel: "JSS 1",
        assessment: { nextSubject: "mathematics" },
      }),
    );
  });

  it("fails with the stream's last error and keeps nothing", async () => {
    streams(
      { type: "error", message: "first" },
      { type: "error", message: "busy" },
    );

    await expect(generatePlan(request)).rejects.toThrow("busy");
    expect(saveCurriculum).not.toHaveBeenCalled();
  });
});
