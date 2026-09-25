import { describe, expect, it } from "vitest";

import {
  assessmentPrompt,
  formatCurriculumTitle,
  referenceSources,
  lessonListLabel,
  lessonsHeadline,
  schemeEntryLabel,
  workspaceLessons,
  type CurrentTeachingWeek,
} from "./lessonPlanning";

describe("workspaceLessons", () => {
  const lesson = (
    id: string,
    subtopic: string,
    schemeEntryId: string | null,
    status: "draft" | "confirmed" = "draft",
  ) =>
    ({
      id,
      topic: "Whole Numbers",
      subtopic,
      status,
      inputMode: "structured",
      planFormat: "flat",
      latestVersionNumber: status === "confirmed" ? 1 : 0,
      weekOrdinal: schemeEntryId ? 1 : null,
      schemeEntryId,
    }) as never;
  const entry = (entryId: string, subtopic: string, weekOrdinal = 1) =>
    ({
      weekId: `week-${weekOrdinal}`,
      weekOrdinal,
      entryId,
      topic: "Whole Numbers",
      subtopic,
      curriculumUnit: { id: "unit", title: "Unit" },
      curriculumOutcomes: [],
      learningGoals: [],
      assessment: [],
      instructionalMaterials: [],
    }) as never;

  /// One lesson plan is what a teacher writes for a week, so a week nobody has
  /// written for is offered as one thing — not as three plans and three
  /// signatures for the three subtopics the scheme sets in it.
  it("offers a week nobody has written for as one plan to write", () => {
    const listed = workspaceLessons([], [entry("e1", "Millions"), entry("e2", "Billions")]);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      status: "unplanned",
      lessonId: null,
      schemeWeekId: "week-1",
      schemeEntryId: null,
      subtopic: null,
      weekOrdinal: 1,
    });
  });

  /// Once one subtopic has a plan of its own, the week cannot be planned whole
  /// without covering ground twice — so what is left is offered one at a time,
  /// which is the only way left to write it.
  it("offers the rest of a week one at a time once a subtopic has its own plan", () => {
    const listed = workspaceLessons(
      [lesson("lesson-1", "Millions", "e1")],
      [entry("e1", "Millions"), entry("e2", "Billions"), entry("e3", "Trillions")],
    );

    expect(listed.map((item) => [item.subtopic, item.status])).toEqual([
      ["Millions", "draft"],
      ["Billions", "unplanned"],
      ["Trillions", "unplanned"],
    ]);
  });

  it("reads an entry that has a lesson as that lesson, not as unplanned", () => {
    const listed = workspaceLessons(
      [lesson("lesson-1", "Millions", "e1", "confirmed")],
      [entry("e1", "Millions"), entry("e2", "Billions")],
    );

    expect(listed.map((item) => [item.subtopic, item.status, item.lessonId])).toEqual([
      ["Millions", "confirmed", "lesson-1"],
      ["Billions", "unplanned", null],
    ]);
  });

  it("keeps a lesson that sits outside the scheme rather than hiding it", () => {
    const listed = workspaceLessons(
      [lesson("off-scheme", "Rounding whole numbers", null)],
      [entry("e1", "Millions")],
    );

    expect(listed.map((item) => item.subtopic)).toContain("Rounding whole numbers");
    expect(listed).toHaveLength(2);
  });

  it("keeps every lesson when several share one entry, so none goes missing", () => {
    // Exactly the state that prompted this: one entry collected four lessons.
    const listed = workspaceLessons(
      [
        lesson("a", "Millions", "e1", "confirmed"),
        lesson("b", "Millions", "e1"),
        lesson("c", "Millions", "e1"),
      ],
      [entry("e1", "Millions"), entry("e2", "Billions")],
    );

    expect(listed.filter((item) => item.schemeEntryId === "e1")).toHaveLength(3);
    expect(listed.find((item) => item.subtopic === "Billions")?.status).toBe("unplanned");
  });

  it("follows the scheme's own order", () => {
    const listed = workspaceLessons(
      [lesson("lesson-3", "Trillions", "e3")],
      [entry("e1", "Millions"), entry("e2", "Billions"), entry("e3", "Trillions")],
    );

    expect(listed.map((item) => item.subtopic)).toEqual(["Millions", "Billions", "Trillions"]);
  });
});

describe("assessmentPrompt", () => {
  it("separates the goal a check restates from the question it asks", () => {
    // Exactly as the confirmed lesson stores them.
    expect(
      assessmentPrompt(
        "Count in millions. What is the number that represents one million in digits only?",
      ),
    ).toEqual({
      objective: "Count in millions",
      question: "What is the number that represents one million in digits only?",
    });
    expect(
      assessmentPrompt(
        "Interpret the place value of a million and a billion. Which number is larger: 5,000,000 or 5,000,000,000?",
      ),
    ).toEqual({
      objective: "Interpret the place value of a million and a billion",
      question: "Which number is larger: 5,000,000 or 5,000,000,000?",
    });
  });

  it("leaves a decimal inside the question alone", () => {
    expect(
      assessmentPrompt(
        "Count in millions. Write down the numbers as digits only for the following: 1.5 million and 5.5 million.",
      ),
    ).toEqual({
      objective: "Count in millions",
      question:
        "Write down the numbers as digits only for the following: 1.5 million and 5.5 million.",
    });
  });

  it("keeps a check that states no goal whole", () => {
    expect(assessmentPrompt("What is one million in digits?")).toEqual({
      objective: null,
      question: "What is one million in digits?",
    });
  });
});

describe("referenceSources", () => {
  const attribution =
    "Siyavula Mathematics JSS 1, from https://ng.siyavula.com/read, licensed under Creative Commons Attribution 3.0 Unported. Processed into structured excerpts by graspy; formatting and segmentation changed.";
  const cite = (title: string) => `${title} — ${attribution}`;

  it("names the textbook once and the chapter its excerpts come from", () => {
    const sources = referenceSources([
      cite("Counting up to one billion"),
      cite("Exercise 1.8: Count with large numbers"),
      cite("Worked example 1.5: Writing a mixture of digits and words in digits only"),
      cite("Exercise 1.10: Count in millions and billions"),
    ]);

    expect(sources).toEqual([
      {
        textbook: "Siyavula Mathematics JSS 1",
        chapter: "Chapter 1",
        attribution,
      },
    ]);
  });

  it("reads a span of chapters when the excerpts cross them", () => {
    expect(
      referenceSources([cite("Exercise 1.8: Count"), cite("Exercise 3.2: Order")])[0]?.chapter,
    ).toBe("Chapters 1–3");
  });

  it("has no chapter to show when no excerpt is numbered", () => {
    expect(referenceSources([cite("Counting up to one billion")])[0]?.chapter).toBeNull();
  });

  it("keeps a teacher's own note whole, with no textbook or licence", () => {
    expect(referenceSources(["Chalkboard demonstration"])).toEqual([
      { textbook: "Chalkboard demonstration", chapter: null, attribution: "" },
    ]);
  });

  it("keeps sources apart when a lesson draws on more than one", () => {
    const other = "New General Mathematics 1, used with permission.";

    expect(
      referenceSources([cite("Counting"), `Place value — ${other}`]).map(
        (source) => source.attribution,
      ),
    ).toEqual([attribution, other]);
  });

  it("says a repeated citation once", () => {
    expect(referenceSources(["Chalkboard demonstration", "Chalkboard demonstration"])).toEqual([
      { textbook: "Chalkboard demonstration", chapter: null, attribution: "" },
    ]);
  });
});

describe("formatCurriculumTitle", () => {
  it("reads the source's shouting all-caps back as calm title case", () => {
    // The values are exactly as the bundled NERDC scheme stores them.
    expect(formatCurriculumTitle("WHOLE NUMBERS COUNTING AND WRITING")).toBe(
      "Whole Numbers Counting and Writing",
    );
    expect(formatCurriculumTitle("ANGLES IDENTIFICATION AND PROPERTIES OF ANGLES")).toBe(
      "Angles Identification and Properties of Angles",
    );
    expect(formatCurriculumTitle("SIMPLE EQUATION")).toBe("Simple Equation");
  });

  it("keeps small joining words lower, but never the first or last word", () => {
    expect(formatCurriculumTitle("ORDERING OF FRACTIONS")).toBe("Ordering of Fractions");
    expect(formatCurriculumTitle("THE WHOLE")).toBe("The Whole");
    expect(formatCurriculumTitle("PROPERTIES TO SORT BY")).toBe("Properties to Sort By");
  });

  it("capitalises each part around dashes and apostrophes", () => {
    expect(formatCurriculumTitle("GEOMETRY – PLANE – SHAPES")).toBe("Geometry – Plane – Shapes");
    expect(formatCurriculumTitle("SECOND TERM'S WORK")).toBe("Second Term's Work");
    expect(formatCurriculumTitle("TWO-DIGIT NUMBERS")).toBe("Two-Digit Numbers");
  });

  it("leaves an already-cased or empty title sensible", () => {
    expect(formatCurriculumTitle("Whole Numbers")).toBe("Whole Numbers");
    expect(formatCurriculumTitle("")).toBe("");
  });
});

describe("schemeEntryLabel", () => {
  it("tells apart two weeks that share a topic", () => {
    const millions = schemeEntryLabel({
      topic: "Whole Numbers",
      subtopic: "Millions",
      weekOrdinal: 1,
    });
    const billions = schemeEntryLabel({
      topic: "Whole Numbers",
      subtopic: "Billions",
      weekOrdinal: 2,
    });

    expect(millions.headline).not.toBe(billions.headline);
    expect(millions.headline).toBe("Millions");
    expect(billions.headline).toBe("Billions");
  });

  it("keeps the shared topic as the context each one sits in", () => {
    expect(
      schemeEntryLabel({ topic: "Whole Numbers", subtopic: "Millions", weekOrdinal: 1 })
        .context,
    ).toBe("Whole Numbers · Week 1");
  });

  it("leads with the topic when a plan has no subtopic to distinguish it", () => {
    expect(
      schemeEntryLabel({ topic: "Fractions", subtopic: null, weekOrdinal: 4 }),
    ).toEqual({ headline: "Fractions", context: "Week 4" });
  });

  it("never leads with a week number, which is not what a teacher is looking for", () => {
    const label = schemeEntryLabel({
      topic: "Whole Numbers",
      subtopic: "Millions",
      weekOrdinal: 1,
    });

    expect(label.headline).not.toMatch(/week/i);
  });
});

describe("lessonListLabel", () => {
  const row = (fields: Partial<Parameters<typeof lessonListLabel>[0]>) => ({
    topic: "Whole Numbers",
    subtopic: null,
    weekOrdinal: null,
    ...fields,
  });
  const beside = (
    among: readonly Parameters<typeof lessonListLabel>[0][],
    currentWeek: CurrentTeachingWeek | null = null,
  ) => ({ among, currentWeek });

  /// Nothing stands over a row any more, so the row says the whole of what it
  /// is: what it covers, the topic it sits under, and when it is taught.
  it("says what it covers, its topic and its week", () => {
    const millions = row({ subtopic: "Millions", weekOrdinal: 1 });

    expect(lessonListLabel(millions, beside([millions]))).toEqual({
      headline: "Millions",
      context: "Whole Numbers · Week 1",
    });
  });

  /// The defect: a lesson called "Equivalent fractions" and a lesson on
  /// Fractions covering equivalent fractions both read "Equivalent fractions",
  /// and nothing on either row said which was which.
  it("tells two lessons sharing a name apart by the topic each sits under", () => {
    const whole = row({ topic: "Equivalent fractions", subtopic: null });
    const part = row({ topic: "Fractions", subtopic: "Equivalent fractions" });

    expect(lessonListLabel(whole, beside([whole, part]))).toEqual({
      headline: "Equivalent fractions",
      context: "No week yet",
    });
    expect(lessonListLabel(part, beside([whole, part]))).toEqual({
      headline: "Equivalent fractions",
      context: "Fractions · No week yet",
    });
  });

  /// A lesson that is the whole of its topic leads with that topic, and does
  /// not then repeat it underneath.
  it("leads a lesson that is its own topic with the topic, once", () => {
    const whole = row({ topic: "Rounding to the nearest ten", subtopic: null, weekOrdinal: 5 });

    expect(lessonListLabel(whole, beside([whole]))).toEqual({
      headline: "Rounding to the nearest ten",
      context: "Week 5",
    });
  });

  /// A week the scheme sets is one plan covering all of it, so the week is what
  /// that row is — and the topic it covers sits beneath.
  it("reads a week the scheme sets as that week", () => {
    const week = row({ topic: "Fractions", subtopic: null, weekOrdinal: 5, schemeWeekId: "week-5" });

    expect(lessonListLabel(week, beside([week]))).toEqual({
      headline: "Week 5",
      context: "Fractions",
    });
  });

  /// The defect this fixes: three drafts of Millions with no week between them
  /// read identically, so a teacher choosing one was choosing blind. When a
  /// lesson beside it covers the very same ground, the hour it was started is
  /// the only thing that differs — so that is what the row says.
  it("says when a draft was started once a lesson beside it covers the same ground", () => {
    const first = row({ subtopic: "Millions", startedAt: "2026-07-21 13:53:35" });
    const second = row({ subtopic: "Millions", startedAt: "2026-07-21 15:11:51" });

    const [a, b] = [first, second].map((lesson) => lessonListLabel(lesson, beside([first, second])));
    expect(a?.headline).toBe("Millions");
    expect(a?.context).toMatch(/Started /);
    expect(b?.context).toMatch(/Started /);
    expect(a?.context).not.toBe(b?.context);
  });

  /// Rows differing in topic, subtopic or week already read differently, so
  /// none of them needs the hour to tell it from its neighbour.
  it("does not date rows that already read differently", () => {
    const sharedName = [
      row({ topic: "Equivalent fractions", subtopic: null, startedAt: "2026-07-21 11:29:30" }),
      row({ topic: "Fractions", subtopic: "Equivalent fractions", startedAt: "2026-07-19 13:19:24" }),
    ];
    const differentWeeks = [
      row({ topic: "Fractions", subtopic: null, weekOrdinal: 5, schemeWeekId: "week-5" }),
      row({ topic: "Fractions", subtopic: null, weekOrdinal: 6, schemeWeekId: "week-6" }),
    ];

    for (const among of [sharedName, differentWeeks]) {
      const read = among.map((lesson) => lessonListLabel(lesson, beside(among)));
      expect(read.map((label) => label.context ?? "").join("|")).not.toMatch(/Started /);
      expect(read[0]).not.toEqual(read[1]);
    }
  });
});

describe("when a lesson is taught, as its row says it", () => {
  const row = (weekOrdinal: number | null) => ({
    topic: "Whole Numbers",
    subtopic: "Millions",
    weekOrdinal,
  });
  const said = (lesson: ReturnType<typeof row>, currentWeek: CurrentTeachingWeek | null) =>
    lessonListLabel(lesson, { among: [lesson], currentWeek }).context;

  /// "Not scheduled yet" was a band over a group, in the engine's words. A
  /// lesson with no week is not late and not lost, and its own row says so.
  it("says a lesson has no week yet, on the row rather than over a group", () => {
    expect(said(row(null), { ordinal: 2, standing: "thisWeek" })).toBe("Whole Numbers · No week yet");
  });

  /// The week a teacher is standing in is the one they are looking for, so it
  /// is named rather than numbered.
  it("names the running week as this week", () => {
    expect(said(row(2), { ordinal: 2, standing: "thisWeek" })).toBe("Whole Numbers · This week");
    expect(said(row(3), { ordinal: 2, standing: "thisWeek" })).toBe("Whole Numbers · Week 3");
  });

  /// A term that has closed, or has not opened, has no current week — calling
  /// its last week "this week" is the lie the class card used to tell.
  it("numbers every week when the term has no current one", () => {
    expect(said(row(2), { ordinal: 2, standing: "finished" })).toBe("Whole Numbers · Week 2");
    expect(said(row(2), null)).toBe("Whole Numbers · Week 2");
  });
});

describe("lessonsHeadline", () => {
  it("counts a lesson ready to teach only when its classwork is written too", () => {
    const headline = lessonsHeadline(
      [
        { weekOrdinal: 1, status: "confirmed", classworkComplete: true },
        { weekOrdinal: 1, status: "confirmed", classworkComplete: false },
        { weekOrdinal: 1, status: "draft", classworkComplete: false },
        { weekOrdinal: 3, status: "confirmed", classworkComplete: true },
      ],
      { ordinal: 1, title: "Whole Numbers" },
    );

    expect(headline).toEqual({
      title: "This week",
      subtitle: "3 lessons · 1 ready to teach · 1 still needs classwork",
    });
  });

  /// The claim that had to go: three confirmed plans with nothing written for
  /// the class to do were counted as three lessons ready to teach.
  it("claims no readiness at all when every lesson still needs its classwork", () => {
    expect(
      lessonsHeadline(
        [
          { weekOrdinal: 1, status: "confirmed", classworkComplete: false },
          { weekOrdinal: 1, status: "confirmed", classworkComplete: false },
        ],
        { ordinal: 1, title: "Whole Numbers" },
      ),
    ).toEqual({ title: "This week", subtitle: "2 lessons · 2 still need classwork" });
  });

  it("says so plainly when this week has no lessons yet", () => {
    expect(
      lessonsHeadline([{ weekOrdinal: 5, status: "draft", classworkComplete: false }], { ordinal: 1 }),
    ).toEqual({ title: "This week", subtitle: "No lessons this week yet" });
  });

  it("counts the class when there is no current week, and reads one lesson as singular", () => {
    expect(
      lessonsHeadline([{ weekOrdinal: null, status: "confirmed", classworkComplete: true }], null),
    ).toEqual({ title: "Your lessons", subtitle: "1 lesson · 1 ready to teach" });
  });
});
