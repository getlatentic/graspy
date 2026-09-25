import {
  EMULATOR,
  accountPlan,
  claimsOf,
  deleteGoogleAccount,
  emulatorIsUp,
  expiredSignIn,
  googleAccount,
  signInOnThisDevice,
  signInToGoogle,
} from "../support/accounts";
import { onDevice, withAppClosed } from "../support/devices";
import {
  SERVER,
  agreesWithAccount,
  devicePlan,
  oldDevice,
  serverIsUp,
} from "../support/learner-db";
import { tab } from "../support/learner-pages";
import { HOUR, learnerIn, phonePlan } from "../support/plans";
import { signedIn } from "../support/signed-in";

const API = `${SERVER}/api`;

interface SessionCall {
  request: { body: { deviceId?: string; firebaseIdToken?: string } };
  response?: { body: { signedIn?: boolean } };
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
  cy.intercept("POST", `${API}/session`).as("session");
  onDevice("phone");
  oldDevice(phonePlan(Date.now() - HOUR), {
    graspy_user_profile: learnerIn(1),
  });
});

it("refreshes an expired ID token through the emulator, and signs in with the fresh one", () => {
  signInToGoogle(googleAccount("Ada Lovelace")).then((signIn) => {
    const expired = expiredSignIn(signIn);
    signInOnThisDevice(expired, { expirationTime: Date.now() - HOUR });
    cy.intercept("POST", `${EMULATOR}/securetoken.googleapis.com/**`).as(
      "refresh",
    );

    cy.visit("/app/learn/you");

    cy.wait("@refresh");
    agreesWithAccount();
    cy.contains("Ada Lovelace");
    cy.contains("button", "Sign out");
    cy.get<SessionCall[]>("@session.all").then((calls) => {
      const exchanged = calls.filter(
        (call) => call.request.body.firebaseIdToken,
      );
      expect(exchanged, "exchanges of an ID token").to.have.length(1);
      const sent = exchanged[0].request.body.firebaseIdToken!;
      expect(sent).not.to.equal(expired.idToken);
      expect(claimsOf(sent).exp * 1000).to.be.greaterThan(Date.now());
      expect(exchanged[0].response?.body.signedIn).to.equal(true);
    });
    accountPlan(signIn).its("planId").should("equal", "plan-phone");
  });
});

// What happens now, for the owner to judge: the tab keeps the account's session until
// it lapses, and the next start shows the learner signed out, with the plan kept.
it("signs the learner out on the next start once the account is deleted", () => {
  signedIn(googleAccount("Ada Lovelace")).then((signIn) => {
    deleteGoogleAccount(signIn);

    cy.reload();
    cy.contains("Ada Lovelace");
    cy.contains("button", "Sign out");

    withAppClosed(() => undefined);
    cy.visit("/app/learn/you");
    cy.contains("button", "Sign in with Google");
    cy.contains("Ada Lovelace").should("not.exist");
    cy.window()
      .its("localStorage")
      .invoke("getItem", "graspy.account")
      .should("be.null");
    cy.get<SessionCall[]>("@session.all").should((calls) => {
      const last = calls[calls.length - 1];
      expect(last.request.body.firebaseIdToken).to.equal(undefined);
      expect(last.response?.body.signedIn).to.equal(false);
    });
    devicePlan().its("planId").should("equal", "plan-phone");
    tab("Subjects");
    cy.contains("main", "Basic Science");
  });
});
