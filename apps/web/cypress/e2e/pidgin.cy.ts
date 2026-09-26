import { OLD_PLAN, oldDevice, serverIsUp } from "../support/learner-db";
import {
  keepPlanWith,
  learningIn,
  openDetails,
} from "../support/learner-pages";

const JSS_1 = "JSS 1 (Junior Secondary School), Nigeria, age 12";

const LEARNER_IN_JSS_1 = {
  graspy_user_profile: JSON.stringify({
    id: "e2e",
    country: "NG",
    language: "en",
    system: "NG",
    level: "jss-1",
    levelNames: { en: "JSS 1", local: {} },
    course: "",
    gradeLevel: JSS_1,
    preferredSubjects: ["English Studies", "Mathematics"],
    onboardingCompleted: true,
  }),
};

function inPidgin(): void {
  cy.get("html").should("have.attr", "lang", "pcm");
  cy.get("html").should("have.attr", "dir", "ltr");
}

beforeEach(() => {
  serverIsUp();
  cy.viewport(402, 860);
});

it("shows the You page in Pidgin once the learner learns in it", () => {
  oldDevice({ ...OLD_PLAN, gradeLevel: JSS_1 }, LEARNER_IN_JSS_1);
  cy.visit("/app/learn/you");
  openDetails();
  keepPlanWith(learningIn("Naij"));

  inPidgin();
  cy.contains("dt", "You dey learn with")
    .next()
    .should("have.text", "Nigerian Pidgin");
  cy.contains("a", "Change your subjects");

  cy.reload();
  inPidgin();
  cy.contains("dt", "You dey learn with");
});

it("shows the landing page in Pidgin once a visitor picks it", () => {
  oldDevice(OLD_PLAN, {});
  cy.window().then((win) => win.localStorage.clear());
  cy.visit("/app/onboarding");
  cy.get("#country").click().type("Nigeria");
  cy.contains("button", "Nigeria").click();
  learningIn("Naij")();
  inPidgin();
  cy.contains("button", "Continue");

  cy.visit("/");
  inPidgin();
  cy.contains("h2", "Or try new thing");
  cy.contains("Explain one topic");
});
