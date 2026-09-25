import {
  signInOnThisDevice,
  signInToGoogle,
  type GoogleAccount,
  type GoogleSignIn,
  type Learner,
} from "./accounts";
import { onDevice } from "./devices";
import {
  agreesWithAccount,
  devicePlan,
  eventually,
  oldDevice,
} from "./learner-db";
import { HOUR, laptopPlan, learnerIn, phonePlan } from "./plans";

/** A device used signed out until now: its plan, and on the server what it learnt. */
export function usedDevice(
  plan: object,
  learner: string,
  local: Record<string, string> = {},
): void {
  oldDevice(plan, { graspy_user_profile: learner, ...local });
  cy.visit("/app/learn/you");
  eventually((device) =>
    expect(device.localKeys).to.include("graspy.records.imported"),
  );
}

export type Choice = { add: string } | { choose: string };

/** On "Who's learning?": the learner is added, as the form asks, and chosen. */
export function addLearnerNamed(name: string): void {
  cy.contains("button", "Add learner").click();
  cy.get("#learner-name").type(name);
  cy.contains("label", "I'm this learner").find("input").check();
  cy.contains("button", /^Add$/).click();
}

export function pickLearner(choice: Choice): void {
  cy.location("pathname").should("eq", "/app/learners");
  cy.contains("h1", "Who's learning?");
  if ("choose" in choice) cy.contains("button", choice.choose).click();
  else addLearnerNamed(choice.add);
}

export function learnerOnDevice(): Cypress.Chainable<Learner | null> {
  return cy
    .window()
    .its("localStorage")
    .invoke("getItem", "graspy.account")
    .then((saved) => (saved ? JSON.parse(saved as string).learner : null));
}

export interface SignedIn {
  signIn: GoogleSignIn;
  learner: Learner;
}

/** Signs the device in hand in, picks who is learning, and opens the app until the
 * device and the learner agree on a plan. */
export function signedIn(
  account: GoogleAccount,
  choice: Choice,
  path = "/app/learn/you",
): Cypress.Chainable<SignedIn> {
  return signInToGoogle(account).then((signIn) => {
    signInOnThisDevice(signIn);
    cy.visit("/app");
    pickLearner(choice);
    cy.location("pathname", { timeout: 10_000 }).should("eq", "/app/learn");
    cy.visit(path);
    agreesWithAccount();
    return learnerOnDevice().then((learner) => ({ signIn, learner: learner! }));
  });
}

export function profile(): Cypress.Chainable<Record<string, unknown>> {
  return cy
    .window()
    .its("localStorage")
    .invoke("getItem", "graspy_user_profile")
    .then((saved) => JSON.parse(saved as string));
}

/** A phone and a laptop signed in to the account as its learner Ada, holding the phone's
 * plan for JSS 1 as hers. The laptop is left in hand. */
export function phoneAndLaptop(
  account: GoogleAccount,
): Cypress.Chainable<SignedIn> {
  onDevice("phone");
  oldDevice(phonePlan(Date.now() - HOUR), {
    graspy_user_profile: learnerIn(1),
  });
  signedIn(account, { add: "Ada" });
  onDevice("laptop");
  oldDevice(laptopPlan(Date.now() - 2 * HOUR, 3), {
    graspy_user_profile: learnerIn(3),
  });
  return signedIn(account, { choose: "Ada" }).then((ada) => {
    cy.contains("dd", /^JSS 1$/);
    devicePlan().its("planId").should("equal", "plan-phone");
    return cy.wrap(ada);
  });
}
