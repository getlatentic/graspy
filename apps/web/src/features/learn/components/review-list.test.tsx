// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewList } from "./review-list";

afterEach(cleanup);

const OWED = [
  { subjectSlug: "mathematics", topicIndex: 1, topic: "Fractions" },
  { subjectSlug: "science", topicIndex: 0, topic: "Matter" },
];

describe("the topics to practise again", () => {
  it("names each topic and opens the one the learner taps", () => {
    const onOpen = vi.fn();
    render(<ReviewList topics={OWED} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Matter" }));

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(onOpen).toHaveBeenCalledWith(OWED[1]);
  });
});
