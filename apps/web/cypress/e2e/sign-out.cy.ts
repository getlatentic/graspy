import { learnerLearnt, learnerPlan } from "../support/account-api";
import {
  emulatorIsUp,
  googleAccount,
  signInOnThisDevice,
  signInToGoogle,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  devicePlan,
  onlyLocalKeys,
  online,
  serverFollowsTheConnection,
  serverIsUp,
  storeCounts,
} from "../support/learner-db";
import {
  HOUR,
  firstTopicLearnt,
  inJss,
  learnerIn,
  phonePlan,
} from "../support/plans";
import {
  learnerOnDevice,
  pickLearner,
  signedIn,
  usedDevice,
} from "../support/signed-in";

interface SessionCall {
  request: { body: { deviceId?: string } };
}

function signOut(): void {
  cy.visit("/app/learn/you");
  cy.contains("button", "Sign out").click();
}

function wiped(): void {
  cy.location("pathname").should("eq", "/");
  onlyLocalKeys(["graspy_device_id"]);
  storeCounts().then((counts) =>
    expect(
      Object.entries(counts).filter(([, count]) => count > 0),
      "stores still holding records",
    ).to.deep.equal([]),
  );
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
});

afterEach(() => online(true));

it("leaves nothing of the learner on the device, and gives the next account none of it", () => {
  onDevice("tablet");
  usedDevice(
    phonePlan(Date.now() - HOUR),
    learnerIn(1),
    firstTopicLearnt("Mathematics"),
  );
  signedIn(googleAccount("Ada Lovelace"), { add: "Ada" });
  cy.visit("/app/learn/mathematics");
  cy.contains("1 of 3 learnt");
  let was: string | null = null;
  cy.window().then((win) => {
    was = win.localStorage.getItem("graspy_device_id");
  });

  signOut();

  wiped();
  cy.contains("button", "Sign out").should("not.exist");
  cy.window().then((win) => {
    const now = win.localStorage.getItem("graspy_device_id");
    expect(now, "the device's id").not.to.equal(was);
  });
  cy.intercept("POST", `${SERVER}/api/session`).as("session");

  signInToGoogle(googleAccount("Grace Hopper")).then((grace) => {
    signInOnThisDevice(grace);
    cy.visit("/app");
    pickLearner({ add: "Grace" });
    cy.location("pathname").should("eq", "/app/onboarding");
    cy.get<SessionCall[]>("@session.all").then((calls) =>
      calls.forEach(({ request }) =>
        expect(request.body.deviceId, "the device named").not.to.equal(was),
      ),
    );
    learnerOnDevice().then((learner) => {
      learnerPlan(grace, learner!).should("equal", null);
      learnerLearnt(grace, learner!, "plan-phone").should("deep.equal", []);
    });
  });
  devicePlan().should("equal", null);
});

it("brings the learner's plan back on signing in again", () => {
  const ada = googleAccount("Ada Lovelace");
  onDevice("phone");
  usedDevice(phonePlan(Date.now() - HOUR, 3), learnerIn(3));
  signedIn(ada, { add: "Ada" });
  signOut();
  wiped();

  signedIn(ada, { choose: "Ada" });
  cy.contains("Learning as Ada");
  cy.contains("dd", /^JSS 3$/);
  devicePlan().should("deep.include", {
    planId: "plan-phone",
    gradeLevel: inJss(3),
  });
});

it("warns before signing out with changes the server has not taken, and lets the learner stay", () => {
  onDevice("phone");
  usedDevice(phonePlan(Date.now() - HOUR), learnerIn(1));
  signedIn(googleAccount("Ada Lovelace"), { add: "Ada" });
  serverFollowsTheConnection();
  online(true, false);

  signOut();
  cy.contains(
    '[role="alertdialog"]',
    "Some changes have not reached graspy yet. If you sign out now, they are lost.",
  );
  cy.contains("button", "Cancel").click();
  cy.contains("button", "Sign out");
  learnerOnDevice().its("name").should("equal", "Ada");
  devicePlan().its("planId").should("equal", "plan-phone");

  cy.contains("button", "Sign out").click();
  cy.contains("button", "Sign out anyway").click();
  wiped();
});
