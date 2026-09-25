import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LessonFollowUps } from "./LessonFollowUps";

describe("LessonFollowUps", () => {
  it("offers the next steps where the lesson ends", async () => {
    const onOpenGroupClasswork = vi.fn();
    const user = userEvent.setup();
    render(
      <LessonFollowUps
        approved
        printForPupils={<button type="button">Print for pupils</button>}
        printWithAnswers={<button type="button">Print with answers</button>}
        onOpenGroupClasswork={onOpenGroupClasswork}
      />,
    );

    expect(screen.getByRole("button", { name: "Print for pupils" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Print with answers" })).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Make versions for different groups" }),
    );
    expect(onOpenGroupClasswork).toHaveBeenCalledOnce();
  });

  it("does not offer printing a lesson the teacher has not marked ready", () => {
    render(
      <LessonFollowUps
        approved={false}
        printForPupils={<button type="button">Print for pupils</button>}
        printWithAnswers={<button type="button">Print with answers</button>}
        onOpenGroupClasswork={() => undefined}
      />,
    );

    // Offering an action that cannot work is the dead end this screen exists
    // to remove, so it says what to do instead.
    expect(screen.queryByRole("button", { name: "Print for pupils" })).not.toBeInTheDocument();
    expect(screen.getByText(/mark it ready/i)).toBeVisible();
  });

  it("says nothing about groups when there is nowhere to go", () => {
    render(
      <LessonFollowUps
        approved
        printForPupils={<button type="button">Print for pupils</button>}
        printWithAnswers={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Make versions for different groups" }),
    ).not.toBeInTheDocument();
  });
});
