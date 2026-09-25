import { OLD_PLAN, oldDevice, serverIsUp } from "../support/learner-db";
import { tab } from "../support/learner-pages";

beforeEach(() => {
  serverIsUp();
  // The tab bar is a phone's navigation.
  cy.viewport(402, 860);
  oldDevice(OLD_PLAN, {});
  cy.visit("/app/learn");
});

it("Home shows what to continue", () => {
  cy.contains("Continue learning");
  cy.contains("Number and Place Value");
});

it("Subjects lists the plan's subjects", () => {
  tab("Subjects");
  cy.location("pathname").should("eq", "/app/learn/subjects");
  cy.get("main")
    .should("contain", "English Studies")
    .and("contain", "Mathematics");
});

it("Ask opens a conversation about the current topic", () => {
  tab("Ask");
  cy.location("pathname").should("eq", "/app/learn/ask/mathematics/0");
  cy.get("textarea").should("be.visible");
  cy.contains("Number and Place Value");
});

it("You shows the learner's page", () => {
  tab("You");
  cy.location("pathname").should("eq", "/app/learn/you");
  cy.get("main").invoke("text").should("not.be.empty");
});

it("a lesson's conversation leads back to the lesson", () => {
  cy.visit("/app/learn/mathematics/lesson/0");
  cy.contains("button", "Ask graspy").click();
  cy.location("pathname").should("eq", "/app/learn/ask/mathematics/0");

  cy.get('button[aria-label="Back to the lesson"]').click();
  cy.location("pathname").should("eq", "/app/learn/mathematics/lesson/0");
});
