import {
  eventually,
  online,
  SERVER,
  serverFollowsTheConnection,
  MODEL,
  OLD_PLAN,
  OLD_PLAN_ID,
  oldDevice,
  oldKeptLesson,
  serverIsUp,
  slide,
  stored,
} from "../support/learner-db";
import { expectStandings, finishLesson, tab } from "../support/learner-pages";
import {
  expectLessonsOpened,
  lessonView,
  watchLessonsOpened,
} from "../support/views";

const MATHS = "mathematics";
const BROKEN_BOLD = "Numbers use digits.**\nKey Points:**\n- Base 10";

// What version 1 kept: topic 0 finished, topic 1's lesson, keys no version
// reads, and one of the learner's own that must survive.
const OLD_LOCAL = {
  "simple-topic-status:Mathematics": JSON.stringify(["completed", "generated"]),
  ...oldKeptLesson("Fractions", 1, [slide("Kept slide", BROKEN_BOLD)]),
  "topic-status:mathematics:0": "{}",
  graspy_tutor_thread: "context-1",
  graspy_theme: "dark",
};

beforeEach(() => {
  serverIsUp();
  // Watched, not answered: the real server answers.
  watchLessonsOpened();
});

it("moves an earlier version's data into the plan and the record, once", () => {
  oldDevice(OLD_PLAN, OLD_LOCAL);

  cy.visit(`/app/learn/${MATHS}`);

  cy.contains("1 of 3 learnt");
  expectStandings(["Learnt", "Ready", "Not started"]);
  eventually((device) => {
    expect(device.version).to.equal(8);
    expect(device.plan).to.deep.include({
      planId: OLD_PLAN_ID,
      subjects: [
        { name: "English Studies", slug: "english-studies" },
        { name: "Mathematics", slug: MATHS },
      ],
      assessment: { nextSubject: MATHS },
    });
    expect(device.plan.topics).to.have.keys("english-studies", MATHS);
    expect(device.progress).to.deep.equal([
      [OLD_PLAN_ID, MATHS, 0, "Number and Place Value"],
    ]);
    expect(device.lessons).to.deep.equal([
      [OLD_PLAN_ID, MATHS, 1, "Fractions"],
    ]);
    expect(device.deviceRows).to.equal(0);
    expect(device.localKeys).to.deep.equal([
      `graspy.learner.${OLD_PLAN_ID}`,
      "graspy.records.imported",
      // Each view, kept to open offline.
      "graspy.view.ui://graspy/lesson",
      "graspy.view.ui://graspy/passage",
      "graspy.view.ui://graspy/practice",
      "graspy_device_id",
      "graspy_theme",
      "graspy_user_profile",
    ]);
  });

  cy.visit(`/app/learn/${MATHS}/lesson/1`);
  lessonView().contains("h2", "Kept slide");
  lessonView().contains("strong", "Key Points:");
  expectLessonsOpened(["ready"]);
});

it("keeps finished topics and new lessons across reloads", () => {
  oldDevice(OLD_PLAN, OLD_LOCAL);

  cy.visit(`/app/learn/${MATHS}/lesson/1`);
  finishLesson();

  cy.contains("h2", "You finished Fractions");
  cy.contains("Up next").next().should("have.text", "Linear Equations");
  cy.contains("button", "Start the next topic").click();
  cy.location("pathname").should("eq", `/app/learn/${MATHS}/lesson/2`);

  lessonView().find('nav[aria-label="Slides"]', MODEL).should("be.visible");
  eventually(
    (device) =>
      expect(device.lessons).to.deep.include([
        OLD_PLAN_ID,
        MATHS,
        2,
        "Linear Equations",
      ]),
    { timeout: 300_000 },
  );
  cy.contains("button", "Back to Mathematics").click();
  expectStandings(["Learnt", "Learnt", "Ready"]);

  cy.reload();
  cy.contains("2 of 3 learnt");
  expectStandings(["Learnt", "Learnt", "Ready"]);
  cy.visit(`/app/learn/${MATHS}/lesson/2`);
  lessonView().find('nav[aria-label="Slides"]').should("be.visible");
  // The imported lesson, the new one while made, then the new one kept.
  expectLessonsOpened(["ready", "making", "ready"]);
});

it("rebuilds the plan, carrying the learner's path and dropping the rest", () => {
  const withPath = {
    ...OLD_PLAN,
    subjects: [
      ...OLD_PLAN.subjects,
      { name: "Real Analysis", slug: "real-analysis" },
    ],
    topics: { ...OLD_PLAN.topics, "real-analysis": ["Limits", "Continuity"] },
    levels: {
      "real-analysis": { Limits: "University", Continuity: "University" },
    },
  };
  oldDevice(withPath, {
    "simple-topic-status:mathematics": JSON.stringify(["completed"]),
    "simple-topic-status:real-analysis": JSON.stringify(["completed"]),
  });

  cy.visit("/app/learn/plan");
  cy.contains("button", "Rebuild my plan").click();
  cy.contains("button", "Clear and rebuild").click();

  cy.contains("Continue learning", { timeout: 300_000 });
  eventually(
    (device) => {
      const planId = device.plan.planId;
      expect(planId).not.to.equal(OLD_PLAN_ID);
      expect(device.progress, JSON.stringify(device.progress)).to.deep.equal([
        [planId, "real-analysis", 0, "Limits"],
      ]);
      expect(device.lessons, JSON.stringify(device.lessons)).to.have.length(1);
      expect(device.lessons[0].slice(0, 3)).to.deep.equal([
        planId,
        "english-studies",
        0,
      ]);
      expect(device.plan.subjects).to.deep.include({
        name: "Real Analysis",
        slug: "real-analysis",
      });
    },
    // Two model calls: the plan made again, then its first lesson.
    { timeout: 300_000 },
  );

  cy.visit(`/app/learn/${MATHS}`);
  cy.get("main ol > li").each((row) =>
    expect(row.text()).to.include("Not started"),
  );
  cy.visit("/app/learn/english-studies");
  cy.get("main ol > li").first().should("contain", "Ready");
  cy.visit("/app/learn/real-analysis");
  cy.contains("1 of 2 learnt");
});

it("rewrites the plan on a device already past version 3, so Ask opens", () => {
  // Version 3 moved lessons and progress but left the plan's old shape.
  oldDevice(OLD_PLAN, {}, 3);
  cy.viewport(402, 860);

  cy.visit("/app/learn");
  tab("Ask");

  cy.location("pathname").should("match", /^\/app\/learn\/ask\/.+/);
  cy.get("textarea").should("be.visible");
  eventually((device) => {
    expect(device.version).to.equal(8);
    expect(device.plan).to.deep.include({
      planId: OLD_PLAN_ID,
      assessment: { nextSubject: MATHS },
    });
  });
});

it("goes on making a lesson while the learner asks graspy, and makes it once", () => {
  // New to the server, so it makes the lesson rather than answer from cache.
  const topic = `Linear Equations in Everyday Life ${Date.now()}`;
  const topics = { ...OLD_PLAN.topics, Mathematics: ["Fractions", topic] };
  oldDevice({ ...OLD_PLAN, topics }, {});
  cy.viewport(402, 860);
  const kept = (device: { lessons: unknown[] }) =>
    device.lessons.some((key) => JSON.stringify(key).includes(topic));

  cy.visit(`/app/learn/${MATHS}/lesson/1`);
  expectLessonsOpened(["making"]);
  cy.contains("button", "Ask graspy").click();
  cy.location("pathname").should("eq", `/app/learn/ask/${MATHS}/1`);
  stored().then(
    (device) =>
      expect(kept(device), "not made yet when the learner left").to.be.false,
  );

  eventually((device) => expect(kept(device)).to.be.true, MODEL);

  cy.go("back");
  lessonView().find('nav[aria-label="Slides"]').should("exist");
  lessonView().should("not.contain", "Preparing your lesson");
  expectLessonsOpened(["making", "ready"]);
});

describe("without a connection", () => {
  afterEach(() => online(true));

  it("opens a lesson it opened before, and sends its end once back", () => {
    oldDevice(OLD_PLAN, OLD_LOCAL);
    serverFollowsTheConnection();
    cy.intercept("GET", `${SERVER}/ui-sandbox*`).as("sandbox");

    // On this first visit the sandbox page tells the server origin's service
    // worker to keep it.
    cy.visit(`/app/learn/${MATHS}/lesson/1`);
    lessonView().contains("h2", "Kept slide");
    cy.get("@sandbox.all").should("have.length.at.least", 2);
    cy.contains("button", "Back to Mathematics").click();
    expectStandings(["Learnt", "Ready", "Not started"]);

    online(false);
    cy.get("main ol > li").eq(1).find("button").click();
    lessonView().contains("h2", "Kept slide");
    lessonView().contains("strong", "Key Points:");
    finishLesson();

    cy.contains("h2", "You finished Fractions");
    cy.contains("button", "Back to Mathematics").click();
    cy.location("pathname").should("eq", `/app/learn/${MATHS}`);
    expectStandings(["Learnt", "Learnt", "Not started"]);
    stored().then((device) =>
      expect(device.progress, "not sent while offline").to.have.length(1),
    );
    online(true);
    eventually((device) =>
      expect(device.progress).to.deep.include([
        OLD_PLAN_ID,
        MATHS,
        1,
        "Fractions",
      ]),
    );
  });
});

it("shows what a lesson set out to teach once the learner finishes it", () => {
  oldDevice(OLD_PLAN, {});
  cy.visit(`/app/learn/${MATHS}/lesson/2`);

  // Read while the first slide is written, and gone once the slides are.
  lessonView().find('nav[aria-label="Slides"]', MODEL).should("be.visible");
  lessonView().should("not.contain", "In this lesson you'll learn to");
  finishLesson();

  cy.contains("You can now:")
    .next("ul")
    .find("li")
    .should("have.length.at.least", 3);
});
