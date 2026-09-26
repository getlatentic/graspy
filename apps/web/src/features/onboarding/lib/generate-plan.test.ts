import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurriculumRequest,
  CurriculumStreamEvent,
} from "@/lib/curriculum-api";
import type { LearnerDetails } from "@/lib/user-storage";
import { generatePlan, keepVoiceOnlyPlan } from "./generate-plan";

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

const learner: LearnerDetails = {
  country: "NG",
  language: "en",
  system: "NG",
  level: "jss-1",
  levelNames: { en: "JSS 1" },
  course: "",
  gradeLevel: "JSS 1",
};

beforeEach(() => {
  vi.clearAllMocks();
  saveCurriculum.mockResolvedValue(undefined);
  deleteCurriculum.mockResolvedValue(undefined);
});

describe("generatePlan", () => {
  it("asks for the plan in English names and keeps what the stream made for the learner", async () => {
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

    await expect(generatePlan({ request, learner })).resolves.toEqual({
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
        countryCode: "NG",
        languageName: "English",
        languageCode: "en",
        gradeLevel: "JSS 1",
        system: "NG",
        level: "jss-1",
        levelNames: { en: "JSS 1" },
        course: "",
        assessment: { nextSubject: "mathematics" },
      }),
    );
  });

  it("fails with the stream's last error and keeps nothing", async () => {
    streams(
      { type: "error", message: "first" },
      { type: "error", message: "busy" },
    );

    await expect(generatePlan({ request, learner })).rejects.toThrow("busy");
    expect(saveCurriculum).not.toHaveBeenCalled();
  });
});

describe("keepVoiceOnlyPlan", () => {
  it("keeps who the plan is for, with no subjects, and never asks the model", async () => {
    await keepVoiceOnlyPlan({
      ...learner,
      level: "nursery-1",
      levelNames: { en: "Nursery 1" },
      gradeLevel: "Nursery 1 (Early childhood), Nigeria, age 3",
    });

    expect(streamCurriculum).not.toHaveBeenCalled();
    expect(saveCurriculum).toHaveBeenCalledWith({
      country: "Nigeria",
      countryName: "Nigeria",
      countryCode: "NG",
      language: "English",
      languageName: "English",
      languageCode: "en",
      gradeLevel: "Nursery 1 (Early childhood), Nigeria, age 3",
      system: "NG",
      level: "nursery-1",
      levelNames: { en: "Nursery 1" },
      course: "",
      subjects: [],
      topics: {},
      assessment: { nextSubject: null },
    });
  });
});
