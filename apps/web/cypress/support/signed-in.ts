import {
  signInOnThisDevice,
  signInToGoogle,
  type GoogleAccount,
  type GoogleSignIn,
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

/** Signs the device in hand in to the account, and opens the app until the device
 * and the account agree on a plan. */
export function signedIn(
  account: GoogleAccount,
  path = "/app/learn/you",
): Cypress.Chainable<GoogleSignIn> {
  return signInToGoogle(account).then((signIn) => {
    signInOnThisDevice(signIn);
    cy.visit(path);
    agreesWithAccount();
    return cy.wrap(signIn);
  });
}

export function profile(): Cypress.Chainable<Record<string, unknown>> {
  return cy
    .window()
    .its("localStorage")
    .invoke("getItem", "graspy_user_profile")
    .then((saved) => JSON.parse(saved as string));
}

/** A phone and a laptop signed in to the account, holding the phone's plan for JSS 1
 * as the account's one plan. The laptop is left in hand. */
export function phoneAndLaptop(
  account: GoogleAccount,
): Cypress.Chainable<GoogleSignIn> {
  onDevice("phone");
  oldDevice(phonePlan(Date.now() - HOUR), {
    graspy_user_profile: learnerIn(1),
  });
  signedIn(account);
  onDevice("laptop");
  oldDevice(laptopPlan(Date.now() - 2 * HOUR, 3), {
    graspy_user_profile: learnerIn(3),
  });
  return signedIn(account).then((signIn) => {
    cy.contains("dd", /^JSS 1$/);
    devicePlan().its("planId").should("equal", "plan-phone");
    return cy.wrap(signIn);
  });
}
