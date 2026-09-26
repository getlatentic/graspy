import { serverIsUp } from "../support/learner-db";
import {
  ASKED,
  learnerIn,
  MARKED,
  visitWithMicrophone,
  voiceAnswersKept,
  voiceServer,
  wavFormat,
} from "../support/voice";

const NOTE = "graspy sends your voice to check your answers.";
const LESSON = "/app/learn/voice/lesson";

beforeEach(() => {
  serverIsUp();
  cy.viewport(402, 860);
});

/** Through the note, and the taught line, to the question the child answers. */
function toTheQuestion(): void {
  cy.contains("button", "OK").click();
  cy.wait("@heard");
  cy.contains(ASKED.say_text.en);
  cy.contains("button", "Record your answer");
  // She said both lines: a line she could not say leaves this note.
  cy.contains("The teacher's voice didn't load.").should("not.exist");
  cy.contains("button", "Record your answer").click();
}

describe("Home's voice card", () => {
  it("shows for a class with voice lessons, and opens them", () => {
    voiceServer();
    learnerIn("primary-4");
    cy.visit("/app/learn");
    cy.contains("h2", "Voice lessons");
    cy.contains("Aunty Chioma");
    cy.contains("section", "Voice lessons").contains("button", "Start").click();
    cy.location("pathname").should("eq", "/app/learn/voice");
    cy.wait("@catalogue")
      .its("request.url")
      .should("include", "learner_class=primary_4");
    cy.contains("button", "Times tables").should(
      "have.attr",
      "aria-expanded",
      "true",
    );
    cy.contains("a", "The 7 times table")
      .should("contain", "Start here")
      .and("contain", "Started");
    cy.contains("button", "Numbers and counting").click();
    cy.contains("a", "Counting to twenty").should("contain", "Known");
  });

  it("is not there past primary school, or outside Nigeria", () => {
    learnerIn("jss-1");
    cy.visit("/app/learn");
    cy.contains("h2", "Your subjects");
    cy.contains("h2", "Voice lessons").should("not.exist");

    learnerIn("primary-4", "GH");
    cy.visit("/app/learn");
    cy.contains("h2", "Your subjects");
    cy.contains("h2", "Voice lessons").should("not.exist");
  });
});

describe("a voice lesson", () => {
  it("takes a whole turn: her line, the child's spoken answer, the mark and her reply", () => {
    const recorded = voiceServer();
    learnerIn("primary-4");
    visitWithMicrophone(LESSON);
    cy.contains(NOTE);
    toTheQuestion();

    cy.wait("@sample", { timeout: 20_000 }).then(({ request }) => {
      expect(request.headers["idempotency-key"]).to.match(/^[0-9a-f-]{36}$/);
      expect(request.body).to.deep.include({
        prompt_id: "mul_fact_7x8_answer",
        task: "reasoning",
        topic: "multiplication",
        learner_class: "primary_4",
        language_pair: "pcm-en",
        spoken_language: "en",
        plan_id: ASKED.plan_id,
        event_id: ASKED.event_id,
        consent: { granted: true, scope: "voice_lesson" },
      });
    });
    cy.wait("@audio").then(() => {
      const format = wavFormat(recorded.wav!);
      expect(format).to.deep.include({
        riff: "RIFF",
        wave: "WAVE",
        format: 1,
        channels: 1,
        sampleRate: 16_000,
        bits: 16,
      });
      expect(format.dataBytes).to.equal(format.size - 44);
      // "fifty six" and the quiet that ended it: more than a second, less than the loop.
      expect(format.dataBytes / 32_000).to.be.within(1, 6);
    });
    cy.wait("@evaluation");
    cy.contains("Correct!");
    cy.contains("fifty six");
    cy.contains(MARKED.feedback);
    cy.wait("@replyAudio");
    cy.contains("Done for today.", { timeout: 10_000 });
    voiceAnswersKept().should("equal", 0);
  });

  it("shows the note once per learner, and not again", () => {
    voiceServer();
    learnerIn("primary-4");
    cy.visit(LESSON);
    cy.contains(NOTE);
    cy.contains("button", "OK").click();
    cy.visit(LESSON);
    cy.contains("button", "Start");
    cy.contains(NOTE).should("not.exist");

    // Another learner on the same device.
    cy.window().then((win) =>
      win.localStorage.setItem("graspy_device_id", "another-learner-1"),
    );
    cy.visit(LESSON);
    cy.contains(NOTE);
  });

  it("keeps an answer it cannot send, and sends it once back online", () => {
    voiceServer();
    cy.intercept("POST", "**/api/voice/samples", {
      forceNetworkError: true,
    }).as("unsent");
    learnerIn("primary-4");
    visitWithMicrophone(LESSON);
    toTheQuestion();
    cy.wait("@unsent", { timeout: 20_000 });
    cy.contains("Saved. It sends when you're online.");
    voiceAnswersKept().should("equal", 1);

    voiceServer();
    cy.window().then((win) => win.dispatchEvent(new Event("online")));
    cy.wait("@audio");
    cy.contains("Correct!");
    voiceAnswersKept().should("equal", 0);
  });
});

describe("a refused answer", () => {
  const REFUSALS = [
    [409, "step_not_offered", "Your teacher has moved on."],
    [409, "audio_not_ready", "Your answer didn't arrive. Say it again."],
    [409, "unsupported_prompt", "graspy can't check this one."],
    [409, "idempotency_conflict", "That answer was already sent."],
    [409, "learner_required", "Choose who is learning first."],
    [422, "no_speech", "I couldn't hear you. Say it again."],
    [502, "provider_failure", "I couldn't check that. Say it again."],
  ] as const;

  for (const [status, code, line] of REFUSALS) {
    it(`shows one line for ${code}`, () => {
      voiceServer({ status, body: { detail: code, code } });
      learnerIn("primary-4");
      visitWithMicrophone(LESSON);
      toTheQuestion();
      cy.wait("@evaluation", { timeout: 20_000 });
      cy.contains('[role="alert"]', line);
      voiceAnswersKept().should("equal", 0);
    });
  }
});
