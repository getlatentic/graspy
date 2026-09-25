import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClassTimetableWorkspace } from "./ClassTimetableWorkspace";
import { NextClassPanel } from "./NextClassPanel";
import type { ClassTimetableGateway } from "../application/ClassTimetableGateway";
import type { TeachingSlot } from "../domain/classTimetable";
import { DEFAULT_SCHOOL_DAY } from "../domain/schoolDay";

const context = { academicSessionId: "session", academicPeriodId: "term-1" };
const classes = [
  { id: "class-mathematics", displayName: "Mathematics · JSS 1 · B" },
  { id: "class-english", displayName: "English Studies · JSS 2 · A" },
];

function gateway(overrides: Partial<ClassTimetableGateway> = {}): ClassTimetableGateway {
  return {
    getTimetable: vi.fn().mockResolvedValue([] as TeachingSlot[]),
    setTimetable: vi.fn().mockImplementation(({ slots }) => Promise.resolve(slots)),
    getNextSlot: vi.fn().mockResolvedValue(null),
    getTodaysClasses: vi.fn().mockResolvedValue([]),
    getSchoolDay: vi.fn().mockResolvedValue(DEFAULT_SCHOOL_DAY),
    setSchoolDay: vi.fn().mockImplementation((day) => Promise.resolve(day)),
    ...overrides,
  };
}

describe("setting when a class is taught", () => {
  it("saves the periods a teacher marked, for the class they marked them on", async () => {
    const user = userEvent.setup();
    const setTimetable = vi.fn().mockImplementation(({ slots }) => Promise.resolve(slots));
    const onDone = vi.fn();
    render(
      <ClassTimetableWorkspace
        gateway={gateway({ setTimetable })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={onDone}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Monday period 3 —/ }));
    await user.click(screen.getByRole("button", { name: /Thursday period 1 —/ }));
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));

    expect(setTimetable).toHaveBeenCalledWith({
      academicSessionId: "session",
      academicPeriodId: "term-1",
      teachingAssignmentId: "class-mathematics",
      slots: [
        { weekday: "monday", period: 3 },
        { weekday: "thursday", period: 1 },
      ],
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("marks a period a teacher has already chosen, so tapping it again clears it", async () => {
    const user = userEvent.setup();
    render(
      <ClassTimetableWorkspace
        gateway={gateway({
          getTimetable: vi.fn().mockResolvedValue([{ weekday: "monday", period: 3 }]),
        })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    const monday3 = await screen.findByRole("button", { name: /Monday period 3 — taught/ });
    expect(monday3).toHaveAttribute("aria-pressed", "true");
    await user.click(monday3);
    expect(
      screen.getByRole("button", { name: /Monday period 3 — not taught/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  /// The grid is per class. Reading the first class's periods onto the second
  /// would have a teacher save a timetable they never set.
  it("opens each class on its own periods", async () => {
    const user = userEvent.setup();
    const getTimetable = vi.fn().mockImplementation(({ teachingAssignmentId }) =>
      Promise.resolve(
        teachingAssignmentId === "class-mathematics" ? [{ weekday: "monday", period: 3 }] : [],
      ),
    );
    render(
      <ClassTimetableWorkspace
        gateway={gateway({ getTimetable })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /Monday period 3 — taught/ });

    await user.click(
      within(screen.getByRole("navigation", { name: "Your classes" })).getByRole("button", {
        name: "English Studies · JSS 2 · A",
      }),
    );

    expect(
      await screen.findByRole("button", { name: /Monday period 3 — not taught/ }),
    ).toBeVisible();
  });

  /// Nearly every school teaches Monday to Friday. A Saturday column shown to
  /// everyone to serve the few is a column of empty squares on every screen.
  it("draws the week a school actually teaches, not the one before it", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway({
          getSchoolDay: vi.fn().mockResolvedValue({
            ...DEFAULT_SCHOOL_DAY,
            teachingDays: ["monday", "wednesday", "friday", "saturday"],
          }),
        })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    expect(await screen.findByRole("columnheader", { name: "Sat" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Tue" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Thu" })).toBeNull();
  });

  it("shows the week a school keeps, and no more", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway()}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    await screen.findByRole("columnheader", { name: "Mon" });

    expect(screen.getByRole("columnheader", { name: "Fri" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Sat" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Sun" })).toBeNull();
  });

  /// The rows are the day, not a form: seven periods with the times a teacher
  /// reads off their own timetable, and the breaks drawn where they fall so
  /// nobody taps one.
  it("offers the periods the school day actually holds, with their times", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway()}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    await screen.findByRole("columnheader", { name: "Mon" });

    expect(screen.getByRole("rowheader", { name: "1 08:00–08:40" })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "7 12:45–13:25" })).toBeVisible();
    expect(screen.queryByRole("rowheader", { name: /^8 / })).toBeNull();
    expect(screen.getByText("Short break")).toBeVisible();
    expect(screen.getByText("Long break")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Monday period/ })).toHaveLength(7);
  });

  /// A day described once shapes every grid after it. Sixty-minute periods make
  /// a shorter day, and the grid is that day rather than the one before it.
  it("rebuilds the grid from the day a teacher described", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway({
          getSchoolDay: vi.fn().mockResolvedValue({
            ...DEFAULT_SCHOOL_DAY,
            periodMinutes: 60,
          }),
        })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    expect(await screen.findByRole("rowheader", { name: "1 08:00–09:00" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Monday period/ })).toHaveLength(5);
  });

  /// A teacher whose day is not the default should meet the question before
  /// they meet a grid that assumes it.
  it("asks for the school day before anything has described it", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway({ getSchoolDay: vi.fn().mockResolvedValue(null) })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "What does your school day look like?" }),
    ).toBeVisible();
    expect(screen.getByLabelText("School opens")).toHaveValue("08:00");
  });

  it("keeps the described day out of the way once it is described", async () => {
    const user = userEvent.setup();
    render(
      <ClassTimetableWorkspace
        gateway={gateway()}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("Your day: 08:00–14:00, 40-minute periods, 7 a day."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Change the day" }));

    expect(
      screen.getByRole("heading", { name: "What does your school day look like?" }),
    ).toBeVisible();
  });

  /// Where a break falls is a fact about the day in front of a teacher, so it
  /// is moved on the row it sits on rather than in a form above the grid.
  it("moves a break through the day from the row it is on", async () => {
    const user = userEvent.setup();
    const setSchoolDay = vi.fn().mockImplementation((day) => Promise.resolve(day));
    render(
      <ClassTimetableWorkspace
        gateway={gateway({ setSchoolDay })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    await screen.findByRole("columnheader", { name: "Mon" });

    await user.click(screen.getByRole("button", { name: "Move short break later" }));

    expect(setSchoolDay).toHaveBeenCalledWith(
      expect.objectContaining({ shortBreak: { afterPeriod: 3, minutes: 15 } }),
    );
  });

  /// Nothing comes before the first period, so there is nothing to break after.
  it("will not offer to move a break above the first period", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway({
          getSchoolDay: vi.fn().mockResolvedValue({
            ...DEFAULT_SCHOOL_DAY,
            shortBreak: { afterPeriod: 1, minutes: 15 },
          }),
        })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Move short break earlier" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move short break later" })).toBeEnabled();
  });

  it("takes a break out of the day and offers to put one back", async () => {
    const user = userEvent.setup();
    const setSchoolDay = vi.fn().mockImplementation((day) => Promise.resolve(day));
    render(
      <ClassTimetableWorkspace
        gateway={gateway({ setSchoolDay })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );
    await screen.findByRole("columnheader", { name: "Mon" });

    await user.click(screen.getByRole("button", { name: "Remove the long break" }));

    expect(setSchoolDay).toHaveBeenCalledWith(expect.objectContaining({ longBreak: null }));
    expect(await screen.findByRole("button", { name: "Add a long break" })).toBeVisible();
  });

  it("says the class it is asking about", async () => {
    render(
      <ClassTimetableWorkspace
        gateway={gateway()}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "When do you teach Mathematics · JSS 1 · B?" }),
    ).toBeVisible();
  });

  it("reports a period another class already holds, and what to do about it", async () => {
    const user = userEvent.setup();
    render(
      <ClassTimetableWorkspace
        gateway={gateway({
          setTimetable: vi
            .fn()
            .mockRejectedValue(
              new Error("You already teach another class in that period. Free it there first."),
            ),
        })}
        context={context}
        classes={classes}
        termName="First term"
        onDone={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Monday period 3 —/ }));
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));

    expect(await screen.findByText("Timetable not saved")).toBeVisible();
    expect(screen.getByText(/already teach another class/)).toBeVisible();
  });
});

describe("what happens next", () => {
  it("leads with the period, the class and the lesson", () => {
    render(
      <NextClassPanel
        next={{
          teachingAssignmentId: "class-mathematics",
          className: "JSS 1 B",
          subject: "Mathematics",
          weekday: "monday",
          period: 3,
          isToday: false,
          weekOrdinal: 4,
          lesson: {
            lessonId: "lesson",
            topic: "Fractions",
            subtopic: null,
            readyToTeach: true,
          },
        }}
        onSetTimetable={vi.fn()}
        onOpenClass={vi.fn()}
      />,
    );

    const band = screen.getByRole("region", { name: /Monday · Period 3/ });
    expect(band).toHaveTextContent("Monday · Period 3");
    expect(band).toHaveTextContent("JSS 1 B · Mathematics");
    expect(band).toHaveTextContent("Fractions");
  });

  /// Without a timetable there is nothing true to say about the next period, so
  /// the panel names the one thing that would change that.
  it("offers the way to fix it when graspy does not know the timetable", async () => {
    const user = userEvent.setup();
    const onSetTimetable = vi.fn();
    render(
      <NextClassPanel next={null} onSetTimetable={onSetTimetable} onOpenClass={vi.fn()} />,
    );

    expect(
      screen.getByText(/Say which periods you teach each class/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Set your timetable" }));
    expect(onSetTimetable).toHaveBeenCalled();
  });
});
