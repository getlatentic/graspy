import { learnerPlan } from "../support/account-api";
import {
  EMULATOR,
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
  onlyLocalKeys,
  oldDevice,
  serverIsUp,
  storeCounts,
} from "../support/learner-db";
import { HOUR, learnerIn, phonePlan } from "../support/plans";
import { signedIn } from "../support/signed-in";

const API = `${SERVER}/api`;

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
  const ada = googleAccount("Ada Lovelace");
  signedIn(ada, { add: "Ada" }).then(({ learner }) =>
    signInToGoogle(ada).then((signIn) => {
      const expired = expiredSignIn(signIn);
      signInOnThisDevice(expired, {
        expirationTime: Date.now() - HOUR,
        learner,
      });
      cy.intercept("POST", `${EMULATOR}/securetoken.googleapis.com/**`).as(
        "refresh",
      );
      cy.intercept("POST", `${API}/session`).as("restarted");

      cy.visit("/app/learn/you");

      cy.wait("@refresh");
      cy.contains("Learning as Ada");
      cy.contains("button", "Sign out");
      cy.wait("@restarted").then(({ request, response }) => {
        const sent = request.body.firebaseIdToken;
        expect(sent).not.to.equal(expired.idToken);
        expect(claimsOf(sent).exp * 1000).to.be.greaterThan(Date.now());
        expect(request.body.learnerId).to.equal(learner.id);
        expect(response?.body).to.deep.include({
          signedIn: true,
          learner: { ...response?.body.learner, id: learner.id },
        });
      });
      agreesWithAccount();
      learnerPlan(signIn, learner).its("planId").should("equal", "plan-phone");
    }),
  );
});

// Firebase no longer holding the sign-in is signing out: the tab keeps its session until
// it lapses, and the next start leaves nothing of the learner on the device.
it("signs out and wipes the device on the next start once the Google account is deleted", () => {
  signedIn(googleAccount("Ada Lovelace"), { add: "Ada" }).then(({ signIn }) => {
    deleteGoogleAccount(signIn);

    cy.reload();
    cy.contains("Learning as Ada");

    withAppClosed(() => undefined);
    cy.visit("/app/learn/you");
    cy.location("pathname").should("eq", "/");
    onlyLocalKeys(["graspy_device_id"]);
    storeCounts().then((counts) =>
      expect(Object.values(counts).every((count) => count === 0)).to.equal(
        true,
      ),
    );
    cy.visit("/app/learn/you");
    cy.location("pathname").should("eq", "/app/onboarding");
  });
});
