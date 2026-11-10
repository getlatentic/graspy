import { describe, expect, it } from "vitest";
import {
  learntIn,
  marksFrom,
  nextToLearn,
  NO_MARKS,
  standingOf,
  withMark,
} from "./topic-marks";

const TOPICS = ["Number Systems", "Fractions", "Algebra"];
const at = (topicIndex: number, topic = TOPICS[topicIndex]) => ({
  planId: "plan-1",
  subjectSlug: "mathematics",
  topicIndex,
  topic,
});

describe("topic marks", () => {
  const marks = marksFrom({
    learnt: [at(0)],
    ready: [at(0), at(1)],
    review: [],
  });

  it("says where the learner stands on each topic", () => {
    expect(
      TOPICS.map((topic, index) =>
        standingOf(marks, "mathematics", index, topic),
      ),
    ).toEqual(["learnt", "ready", "not-started"]);
  });

  it("does not credit a topic that moved into a position learnt before", () => {
    const moved = marksFrom({
      learnt: [at(1, "Decimals")],
      ready: [],
      review: [],
    });
    expect(learntIn(moved, "mathematics", TOPICS)).toBe(0);
    expect(standingOf(moved, "mathematics", 1, "Fractions")).toBe(
      "not-started",
    );
  });

  it("counts learnt topics and finds the next one", () => {
    expect(learntIn(marks, "mathematics", TOPICS)).toBe(1);
    expect(nextToLearn(marks, "mathematics", TOPICS)).toBe(1);
    const all = TOPICS.reduce(
      (acc, _, index) => withMark(acc, "learnt", at(index)),
      NO_MARKS,
    );
    expect(nextToLearn(all, "mathematics", TOPICS)).toBe(-1);
  });

  it("goes to a path's goal first, then back to the steps before it", () => {
    expect(nextToLearn(NO_MARKS, "mathematics", TOPICS, 2)).toBe(2);
    const goalLearnt = withMark(NO_MARKS, "learnt", at(2));
    expect(nextToLearn(goalLearnt, "mathematics", TOPICS, 2)).toBe(0);
  });

  it("offers a topic again that has a check owed, whatever else it is", () => {
    const owed = marksFrom({
      learnt: [at(0)],
      ready: [at(0), at(1)],
      review: [at(0), at(2)],
    });

    expect(
      TOPICS.map((topic, index) =>
        standingOf(owed, "mathematics", index, topic),
      ),
    ).toEqual(["review", "ready", "review"]);
    expect(learntIn(owed, "mathematics", TOPICS)).toBe(1);
    expect(owed.review.map((topic) => topic.topicIndex)).toEqual([0, 2]);
  });

  it("does not offer again a topic whose name has moved", () => {
    const owed = marksFrom({
      learnt: [],
      ready: [],
      review: [at(1, "Decimals")],
    });
    expect(standingOf(owed, "mathematics", 1, "Fractions")).toBe("not-started");
  });

  it("adds a mark without changing the marks it was given", () => {
    const next = withMark(NO_MARKS, "ready", at(2));
    expect(standingOf(next, "mathematics", 2, "Algebra")).toBe("ready");
    expect(NO_MARKS.ready.size).toBe(0);
  });
});
