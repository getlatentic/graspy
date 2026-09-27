import { learnerMessages, sendLearnerThreads } from "../support/account-api";
import { emulatorIsUp, googleAccount } from "../support/accounts";
import { onDevice } from "../support/devices";
import { SERVER, retried, serverIsUp } from "../support/learner-db";
import { phoneAndLaptop } from "../support/signed-in";

// A learner's conversations follow them: what they ask on one device opens on the other
// with its history. The tutor's answer is not needed, so the checks are on the questions,
// which each device keeps whether or not the tutor answered.

const FRACTIONS_CHAT = "/app/learn/ask/mathematics/1";
const SEND = 'button[aria-label="Send"]';

function ask(question: string): void {
  cy.visit(FRACTIONS_CHAT);
  cy.get("textarea").type(question);
  cy.get(SEND).click();
  cy.wait("@sent");
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
  cy.intercept("POST", `${SERVER}/api/learner/threads`).as("sent");
});

it("opens a conversation started on the phone on the laptop with its history, and the other way round", () => {
  const onPhone = "What is a half of a quarter?";
  const onLaptop = "And a quarter of a half?";
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((ada) => {
    onDevice("phone");
    ask(onPhone);

    onDevice("laptop");
    cy.visit(FRACTIONS_CHAT);
    cy.contains(onPhone);
    ask(onLaptop);
    retried(
      () => learnerMessages(ada.signIn, ada.learner),
      (messages) =>
        expect(messages.map((m) => m.content)).to.include.members([
          onPhone,
          onLaptop,
        ]),
    );

    onDevice("phone");
    cy.visit(FRACTIONS_CHAT);
    cy.contains(onLaptop);
    cy.contains(onPhone);
  });
});

it("opens a conversation the Android app sent, its note leading where the phone's does", () => {
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((ada) => {
    const at = Date.now();
    sendLearnerThreads(ada.signIn, ada.learner, [
      {
        id: `thread-${at}-android`,
        scope: {
          kind: "topic",
          planId: "plan-phone",
          subjectSlug: "mathematics",
          topic: "Fractions",
        },
        createdAt: at,
        updatedAt: at,
        messages: [
          {
            id: `msg-${at}-question`,
            type: "user",
            content: "Asked on the Android app",
            timestamp: at,
            editedAt: at,
          },
          {
            id: `msg-${at + 1}-note`,
            type: "complete",
            content: "Decimals is ready for you.",
            timestamp: at + 1,
            editedAt: at + 1,
            metadata: {
              link: {
                label: "Open lesson",
                to: {
                  type: "lesson",
                  subjectSlug: "mathematics",
                  topicIndex: 2,
                },
              },
            },
          },
        ],
      },
    ]);

    cy.visit(FRACTIONS_CHAT);
    cy.contains("Asked on the Android app");
    cy.contains("a", "Open lesson")
      .should("have.attr", "href")
      .and("match", /\/app\/learn\/mathematics\/lesson\/2$/);
  });
});
