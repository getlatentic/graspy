import {
  eventually,
  MODEL,
  OLD_PLAN,
  OLD_PLAN_ID,
  oldDevice,
  oldKeptLesson,
  online,
  SERVER,
  serverIsUp,
  slide,
} from "../support/learner-db";
import {
  expectLessonsOpened,
  lessonView,
  view,
  watchLessonsOpened,
} from "../support/views";

// The real model's words vary, so checks are on what the app does with them.

const TOPIC_CHAT = "/app/learn/ask/mathematics/1";
const SUBJECT_CHAT = "/app/learn/ask/subject/mathematics";
const MATHS_TOPICS = [
  "Number and Place Value",
  "Fractions",
  "Linear Equations",
];
const FOLLOW_UPS = '[aria-label="Questions you could ask next"] button';
const READING_CHAT = "/app/learn/ask/english-studies/0";
const SEND = 'button[aria-label="Send"]';
const STOP = 'button[aria-label="Stop"]';

interface Card {
  question: string;
  options: string[];
  answerIndex: number;
}

interface SentCard {
  resourceUri: string;
  questions: Card[];
}

interface Turn {
  text: string;
  contextId?: string;
  learner: Record<string, unknown>;
  practice?: Card & {
    chosenIndex: number;
    where?: Record<string, unknown>;
    key?: string;
  };
  cards: SentCard[];
  unanswered: string[];
}

function cardsIn(stream: string): SentCard[] {
  return stream
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => {
      const parts =
        JSON.parse(line.slice(6)).result?.statusUpdate?.status?.message
          ?.parts ?? [];
      type Sent = {
        resourceUri: string;
        toolResult: { structuredContent: { questions: Card[] } };
      };
      const cards: Sent[] = parts.flatMap(
        (part: { data?: { cards?: Sent[] } }) => part.data?.cards ?? [],
      );
      return cards.map(({ resourceUri, toolResult }) => ({
        resourceUri,
        questions: toolResult.structuredContent.questions.map(
          ({ question, options, answerIndex }) => ({
            question,
            options,
            answerIndex,
          }),
        ),
      }));
    });
}

function answerIn(
  parts: { data?: Record<string, unknown> }[],
): Turn["practice"] {
  const calls = (parts.find((part) => part.data)?.data?.appCalls ?? []) as {
    method: string;
    params: { name: string; arguments: Turn["practice"] };
  }[];
  const call = calls.find(
    (request) =>
      request.method === "tools/call" &&
      request.params.name === "answer_practice",
  );
  return call?.params.arguments;
}

// The model varies LaTeX delimiters and spacing.
const plain = (text: string) =>
  text
    .replace(/\\[()]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

// The server answers a repeated question from its cache, whole and at once.
const unseen = (question: string) => `${question} (Question ${Date.now()}.)`;

const TURNS = '[role="log"] section[data-turn]';
const lastTurn = () => cy.get(TURNS).last();

// A cached answer can come and go faster than Stop can be seen, so Stop
// showing is not waited for.
function answerTo(send: () => void): void {
  cy.get('[role="log"]')
    .then((log) => log.find("section[data-turn]").length)
    .then((before) => {
      send();
      cy.get(TURNS, MODEL).should("have.length", before + 1);
      cy.get(TURNS).last().contains("graspy tutor", MODEL);
      cy.get(STOP, MODEL).should("not.exist");
    });
}

function ask(question: string): void {
  answerTo(() => {
    cy.get("textarea").type(question);
    cy.get(SEND).click();
  });
}

const practice = (index = 0) => view("Practice", index);

function watchMcp(): void {
  cy.intercept("POST", `${SERVER}/mcp`).as("mcp");
}

function toolCalled(name: string): Cypress.Chainable<Record<string, unknown>> {
  return cy
    .wait("@mcp")
    .then(({ request }) =>
      request.body.method === "tools/call" && request.body.params.name === name
        ? request.body.params.arguments
        : toolCalled(name),
    );
}

// Cypress holds back an intercepted stream until it ends: a test that
// watches an answer arrive must not call this.
function watchTutor(): void {
  cy.intercept("POST", `${SERVER}/a2a`).as("tutor");
}

function sentTurn(): Cypress.Chainable<Turn> {
  return cy.wait("@tutor", MODEL).then(({ request, response }): Turn => {
    const message = request.body.params.message;
    const parts: { text?: string; data?: Record<string, unknown> }[] =
      message.parts;
    return {
      text: parts.map((part) => part.text ?? "").join(""),
      contextId: message.contextId,
      learner: message.metadata?.learner ?? {},
      practice: answerIn(parts),
      cards: cardsIn(String(response?.body ?? "")),
      unanswered: (parts.find((part) => part.data)?.data?.unanswered ??
        []) as string[],
    };
  });
}

beforeEach(() => {
  serverIsUp();
  cy.viewport(402, 860);
  oldDevice(OLD_PLAN, {});
});

it("answers in the topic's conversation, which goes on and is kept", () => {
  watchTutor();
  cy.visit(TOPIC_CHAT);

  ask("What is 12 times 7? Reply with just the number.");
  sentTurn().then((turn) => {
    expect(turn.contextId).to.equal(undefined);
    expect(turn.learner).to.include({
      subjectSlug: "mathematics",
      topic: "Fractions",
    });
    expect(turn.learner, "no lesson kept").not.to.have.property("lesson");
  });
  lastTurn().should("contain", "84");

  cy.get(FOLLOW_UPS).should("have.length.at.least", 1);
  cy.get(FOLLOW_UPS)
    .first()
    .invoke("text")
    .then((followUp) => {
      answerTo(() => cy.get(FOLLOW_UPS).first().click());
      sentTurn().then((turn) => {
        expect(turn.text).to.equal(followUp);
        expect(turn.contextId, "the same conversation").to.be.a("string");
      });
      lastTurn().should("contain", "graspy tutor");

      cy.reload();
      cy.get('[role="log"]')
        .should("contain", "What is 12 times 7?")
        .and("contain", "84")
        .and("contain", followUp);
    });
});

it("sets a practice question as a card, marks the answer and keeps the mark", () => {
  watchTutor();
  cy.visit(TOPIC_CHAT);

  ask("Give me one practice question on converting fractions to decimals.");
  sentTurn().then(({ practice: typed, cards: [sent] }) => {
    expect(typed, "a typed question answers nothing").to.equal(undefined);
    expect(sent.resourceUri).to.equal("ui://graspy/practice");
    const [card] = sent.questions;
    cy.get('iframe[title="Practice"]').should("have.length", 1);
    practice()
      .find("button[aria-pressed]")
      .should("have.length", card.options.length);
    cy.get(FOLLOW_UPS).should("not.exist");

    // Wrong on purpose, from the key the tutor sent.
    const wrong = card.answerIndex === 0 ? 1 : 0;
    watchMcp();
    practice().find("button[aria-pressed]").eq(wrong).click();
    toolCalled("answer_practice").should("deep.include", {
      answerIndex: card.answerIndex,
      chosenIndex: wrong,
    });
    practice().contains("Not quite");
    cy.get(FOLLOW_UPS).should("have.length.at.least", 1);

    cy.reload();
    practice().contains("Not quite");

    answerTo(() => practice().contains("button", "Explain the answer").click());
    sentTurn().then((turn) => {
      expect(turn.text).to.match(/^I chose .+, but the answer is .+/);
      expect(turn.practice).to.deep.include({ ...card, chosenIndex: wrong });
      expect(turn.practice?.where).to.deep.equal({
        planId: OLD_PLAN_ID,
        subjectSlug: "mathematics",
        topic: "Fractions",
      });
    });
    lastTurn()
      .invoke("text")
      .should((text) =>
        expect(plain(text)).to.include(plain(card.options[card.answerIndex])),
      );

    answerTo(() => practice(0).contains("button", "Another question").click());
    sentTurn().then((turn) => {
      expect(turn.text).to.match(/^I chose .+ and got it wrong/);
      expect(turn.practice).to.deep.include({ ...card, chosenIndex: wrong });
      expect(turn.cards, "a new card").to.have.length(1);
      expect(turn.cards[0].questions[0].question).not.to.equal(card.question);
    });
    cy.get('iframe[title="Practice"]').should("have.length", 2);

    cy.visit("/app/learn/you");
    cy.contains("Your practice")
      .parent()
      .should("contain", "0 of 1 right")
      .and("contain", "Mathematics");
  });
});

it("sets a passage to read with questions on it, and marks each answer", () => {
  watchTutor();
  cy.visit(READING_CHAT);

  ask("Give me a short passage to read, with two questions on it.");
  sentTurn().then(({ cards: [sent] }) => {
    expect(sent.resourceUri).to.equal("ui://graspy/passage");
    expect(sent.questions, "two questions").to.have.length(2);
    const [first, second] = sent.questions;
    // The questions are in the card, not the tutor's words.
    lastTurn()
      .find("p")
      .first()
      .invoke("text")
      .should((text) => expect(text).not.to.include(first.question));

    const wrong = first.answerIndex === 0 ? 1 : 0;
    view("Reading").find("button[aria-pressed]").eq(wrong).click();
    view("Reading").contains("Not quite");
    view("Reading")
      .find("button[aria-pressed]")
      .eq(first.options.length + second.answerIndex)
      .click();
    view("Reading").contains("You got 1 of 2 right.");

    cy.reload();
    view("Reading").contains("You got 1 of 2 right.");
    answerTo(() =>
      view("Reading").contains("button", "Explain my mistakes").click(),
    );
    sentTurn().then((turn) => {
      expect(turn.text).to.match(/^Explain the ones I got wrong/);
      expect(turn.text).to.include(first.question.slice(0, 20));
    });
  });
});

it("offers a topic with a button, without leaving the conversation", () => {
  cy.visit(TOPIC_CHAT);

  ask("Take me to Linear Equations.");
  cy.location("pathname").should("eq", TOPIC_CHAT);
  cy.contains("“Linear Equations” is ready when you are.");
  cy.contains("a", "Open lesson")
    .should("have.attr", "href", "/app/learn/mathematics/lesson/2")
    .click();
  cy.location("pathname").should("eq", "/app/learn/mathematics/lesson/2");
});

it("adds a topic the learner asks for to their plan", () => {
  cy.visit(TOPIC_CHAT);

  ask("Add a topic on completing the square to my Mathematics.");
  cy.contains(/Added “.+” to Mathematics\./);
  cy.contains("a", "Open lesson").should(
    "have.attr",
    "href",
    "/app/learn/mathematics/lesson/3",
  );

  cy.visit("/app/learn/mathematics");
  cy.get("main ol > li").should("have.length", 4);
});

it("plans a path to a goal beyond the plan, and adds it when accepted", () => {
  cy.visit(TOPIC_CHAT);

  ask("I want to learn real analysis at university level. Plan me a path.");
  cy.get('[role="group"][aria-label="A learning path"]', MODEL)
    .contains("button", "Add this path", MODEL)
    .click();
  cy.contains(/Added the path “.+” to your plan\./);

  eventually((device) => {
    const subjects = device.plan.subjects as { name: string }[];
    expect(subjects.map((subject) => subject.name))
      .to.have.length(3)
      .and.include.members(["English Studies", "Mathematics"]);
  });
});

it("asks before removing a subject, and removes it when confirmed", () => {
  cy.visit(TOPIC_CHAT);

  ask("Remove English Studies from my subjects.");
  cy.get('[role="group"][aria-label="Confirm a change to your plan"]')
    .should("contain", "Remove English Studies from your plan?")
    .contains("button", "Yes, go ahead")
    .click();
  cy.contains("Your subjects are updated.");

  cy.visit("/app/learn/subjects");
  cy.get("main")
    .should("contain", "Mathematics")
    .and("not.contain", "English Studies");
});

it("keeps one conversation per context", () => {
  watchTutor();
  cy.visit(TOPIC_CHAT);
  ask("What is 2 plus 2? Reply with just the number.");
  sentTurn();

  cy.contains("button", "Change").click();
  cy.get('[role="dialog"]').contains("button", "Ask anything").click();
  cy.location("pathname").should("eq", "/app/learn/ask/general");
  cy.get('[role="log"] section[data-turn]').should("not.exist");

  ask("What colour is a clear daytime sky? One word.");
  sentTurn().then((turn) => {
    expect(turn.contextId, "a new conversation").to.equal(undefined);
    expect(turn.learner).not.to.have.property("topic");
  });

  cy.visit(TOPIC_CHAT);
  cy.get('[role="log"]')
    .should("contain", "What is 2 plus 2?")
    .and("not.contain", "clear daytime sky");
});

it("says which tool the tutor is using while it works", () => {
  cy.visit(TOPIC_CHAT);

  answerTo(() => {
    cy.get("textarea").type(
      unseen("Use the calculator to work out 1234 times 5678."),
    );
    cy.get(SEND).click();
    cy.contains("Working out the numbers...", MODEL);
  });
  // Written as the model likes: 7,006,652, 7 006 652, or in LaTeX.
  lastTurn()
    .invoke("text")
    .should((text) => {
      expect(text.replace(/[^\d]/g, "")).to.include("7006652");
    });
  cy.contains("Working out the numbers...").should("not.exist");
});

it("stops an answer mid-stream and keeps what arrived", () => {
  cy.visit(TOPIC_CHAT);

  cy.get("textarea").type(
    unseen("Explain place value in great detail, with twenty worked examples."),
  );
  cy.get(SEND).click();
  lastTurn().contains("graspy tutor", MODEL);
  cy.get(STOP).click();

  cy.get(SEND).should("exist");
  cy.get(FOLLOW_UPS).should("not.exist");
  lastTurn()
    .find("p")
    .last()
    .invoke("text")
    .should("not.be.empty")
    .then((kept) => {
      cy.reload();
      lastTurn().should("contain", kept.slice(0, 40));
    });
});

describe("when the connection drops", () => {
  afterEach(() => online(true));

  it("carries on from a request that failed, when the learner says only continue", () => {
    // "continue" alone must reach the lost question, not a fresh greeting.
    cy.visit("/app/learn/ask/general");
    cy.contains("Ask anything");
    cy.get("textarea").should("be.enabled");
    online(false);

    const lost = unseen(
      "Make me a study plan for my exams for real analysis, university level.",
    );
    cy.get("textarea").type(lost);
    cy.get(SEND).click();
    cy.contains('[role="alert"]', "That didn't get through");

    online(true);
    watchTutor();
    ask("continue");
    sentTurn().then((turn) => {
      expect(turn.text).to.equal("continue");
      expect(turn.unanswered).to.deep.equal([lost]);
    });
    lastTurn()
      .invoke("text")
      .should((text) => expect(text).to.match(/real analysis/i));
  });

  it("says the question did not get through, keeps it, and answers it once back", () => {
    cy.visit(TOPIC_CHAT);
    cy.get("textarea").should("be.enabled");
    online(false);

    const lost = unseen("What is 9 times 8?");
    cy.get("textarea").type(lost);
    cy.get(SEND).click();
    cy.contains(
      '[role="alert"]',
      "That didn't get through. Ask again when you're ready.",
    );
    cy.get('[role="log"]').should("contain", lost);
    cy.get(SEND).should("exist");

    online(true);
    watchTutor();
    ask("continue");
    sentTurn().then((turn) => expect(turn.unanswered).to.deep.equal([lost]));
    lastTurn().should("contain", "72");

    // The question is kept; the failure notice is not.
    cy.reload();
    cy.get('[role="log"]')
      .should("contain", lost)
      .and("contain", "72")
      .and("not.contain", "didn't get through");
  });
});

// Only this lesson says it: the tutor can know it only from the lesson.
const SHARER =
  "In this lesson the bottom number of a fraction is called the sharer.";

it("talks about a topic whose lesson is already kept, from the lesson", () => {
  oldDevice(
    OLD_PLAN,
    oldKeptLesson(
      "Fractions",
      1,
      [
        slide("Parts of a whole", "A fraction names equal parts of a whole."),
        slide("The sharer", SHARER),
      ],
      [SHARER],
    ),
  );
  watchLessonsOpened();
  watchTutor();

  cy.visit("/app/learn/mathematics/lesson/1");
  lessonView().contains("h2", "Parts of a whole");
  cy.contains("button", "Ask graspy").click();
  cy.location("pathname").should("eq", TOPIC_CHAT);
  cy.contains("p", "Fractions").next().should("contain", "Mathematics");

  // The app names the topic; the server reads the lesson from the record.
  ask("In my lesson, what do we call the bottom number of a fraction?");
  sentTurn().then((turn) => {
    expect(turn.contextId).to.equal(undefined);
    expect(turn.learner).to.include({
      planId: OLD_PLAN_ID,
      subject: "Mathematics",
      subjectSlug: "mathematics",
      topic: "Fractions",
    });
    expect(turn.learner.topics).to.deep.equal(MATHS_TOPICS);
    expect(turn.learner).not.to.have.property("lesson");
  });
  lastTurn()
    .invoke("text")
    .should("match", /sharer/i);

  cy.go("back");
  cy.location("pathname").should("eq", "/app/learn/mathematics/lesson/1");
  lessonView().contains("h2", "Parts of a whole");
  cy.viewport(1280, 800);
  cy.get("aside").should("contain", "what do we call the bottom number");
  expectLessonsOpened(["ready"]);
});

it("talks about the parent subject as a whole, apart from its topics", () => {
  watchTutor();
  cy.visit(TOPIC_CHAT);
  ask("What is 3 plus 4? Reply with just the number.");
  sentTurn();

  cy.contains("button", "Change").click();
  cy.get('[role="dialog"] button[aria-expanded]')
    .contains("Mathematics")
    .click();
  cy.get('[role="dialog"]').contains("button", "All of Mathematics").click();
  cy.location("pathname").should("eq", SUBJECT_CHAT);
  cy.contains("Whole subject");
  cy.get(TURNS).should("not.exist");

  ask("Which topics are in my Mathematics plan? List them.");
  sentTurn().then((turn) => {
    expect(turn.contextId, "a new conversation").to.equal(undefined);
    expect(turn.learner).to.include({ subjectSlug: "mathematics" });
    expect(turn.learner).not.to.have.property("topic");
    expect(turn.learner).not.to.have.property("lesson");
    expect(turn.learner.topics).to.deep.equal(MATHS_TOPICS);
  });
  lastTurn().should("contain", "Linear Equations");

  ask("Take me to Linear Equations.");
  sentTurn().then((turn) => {
    expect(turn.contextId, "the subject's conversation").to.be.a("string");
  });
  cy.contains("a", "Open lesson").should(
    "have.attr",
    "href",
    "/app/learn/mathematics/lesson/2",
  );
  cy.location("pathname").should("eq", SUBJECT_CHAT);

  cy.reload();
  cy.get('[role="log"]').should(
    "contain",
    "Which topics are in my Mathematics plan?",
  );
  cy.visit(TOPIC_CHAT);
  cy.get('[role="log"]')
    .should("contain", "What is 3 plus 4?")
    .and("not.contain", "Which topics are in my Mathematics plan?");
});

it("reads the lesson the server made from the learner's record, not from the app", () => {
  watchTutor();

  cy.visit("/app/learn/mathematics/lesson/2");
  // The slide controls show once the first slide is in, not while loading.
  lessonView().find('nav[aria-label="Slides"]', MODEL).should("exist");
  lessonView()
    .find("h2")
    .first()
    .invoke("text")
    .then((firstSlide) => {
      eventually(
        (device) =>
          expect(device.lessons.map((key) => key[3])).to.include(
            "Linear Equations",
          ),
        { timeout: 300_000 },
      );
      cy.contains("button", "Ask graspy").click();
      cy.location("pathname").should("eq", "/app/learn/ask/mathematics/2");

      ask(
        unseen(
          "What is the title of the first slide of my lesson? Reply with just the title.",
        ),
      );
      sentTurn().then((turn) => {
        expect(turn.learner.planId).to.equal(OLD_PLAN_ID);
        expect(turn.learner).not.to.have.property("lesson");
        expect(turn.learner).not.to.have.property("lessonId");
      });
      lastTurn()
        .invoke("text")
        .should((text) =>
          expect(plain(text)).to.include(plain(firstSlide.trim())),
        );
    });
});
