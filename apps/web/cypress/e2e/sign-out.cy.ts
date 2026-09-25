import {
  accountLearnt,
  accountPlan,
  emulatorIsUp,
  googleAccount,
  learntInAccount,
  type GoogleAccount,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  devicePlan,
  oldDevice,
  serverIsUp,
  stored,
} from "../support/learner-db";
import {
  inClass,
  keepPlanWith,
  openDetails,
  tab,
} from "../support/learner-pages";
import {
  HOUR,
  firstTopicLearnt,
  inJss,
  learnerIn,
  phonePlan,
} from "../support/plans";
import { signedIn, usedDevice } from "../support/signed-in";

const API = `${SERVER}/api`;

function signOut(): void {
  cy.visit("/app/learn/you");
  cy.contains("button", "Sign out").click();
  cy.contains("button", "Sign in with Google");
  cy.window()
    .its("localStorage")
    .invoke("getItem", "graspy.account")
    .should("be.null");
}

function signedInPhone(account: GoogleAccount) {
  onDevice("phone");
  oldDevice(phonePlan(Date.now() - HOUR), {
    graspy_user_profile: learnerIn(1),
  });
  return signedIn(account);
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
});

it("keeps the plan on the device, and sends the account no change made after", () => {
  signedInPhone(googleAccount("Ada Lovelace")).then((signIn) => {
    signOut();
    cy.intercept(/\/api\/learner\/curriculum/).as("toTheAccount");
    devicePlan().its("planId").should("equal", "plan-phone");
    tab("Subjects");
    cy.contains("main", "Basic Science");

    cy.visit("/app/learn/you");
    openDetails();
    keepPlanWith(inClass("JSS 2"));
    cy.contains("dd", /^JSS 2$/);
    devicePlan().its("gradeLevel").should("equal", inJss(2));
    cy.reload();
    cy.contains("button", "Sign in with Google");
    cy.get("@toTheAccount.all").should("have.length", 0);
    accountPlan(signIn).its("gradeLevel").should("equal", inJss(1));
  });
});

it("joins again on signing back in to the same account, ending on one plan", () => {
  const ada = googleAccount("Ada Lovelace");
  signedInPhone(ada);
  signOut();
  openDetails();
  keepPlanWith(inClass("JSS 2"));

  cy.intercept("POST", `${API}/learner/curriculum/join`).as("joinsAgain");
  signedIn(ada).then((signIn) => {
    cy.wait("@joinsAgain")
      .its("request.body")
      .should("include", { planId: "plan-phone", gradeLevel: inJss(2) });
    cy.contains("dd", /^JSS 2$/);
    devicePlan().then((plan) =>
      accountPlan(signIn).should("deep.include", {
        planId: plan.planId,
        updatedAt: plan.updatedAt,
        gradeLevel: inJss(2),
      }),
    );
  });
});

// What happens now, for the owner to judge: a shared device keeps the first account's
// plan, and the second account takes it on signing in, with what the device learnt
// before any sign-in. What the first account learnt stays with it.
it("gives a second account signing in after the first signed out the plan the device kept", () => {
  const ada = googleAccount("Ada Lovelace");
  const grace = googleAccount("Grace Hopper");
  onDevice("phone");
  usedDevice(
    phonePlan(Date.now() - HOUR),
    learnerIn(1),
    firstTopicLearnt("Mathematics"),
  );
  signedIn(ada).then((adas) => {
    learntInAccount(adas, ["plan-phone", "basic-science", 0, "Living Things"]);
    cy.reload();
    cy.contains("2 of 5 topics completed");
  });
  signOut();
  cy.reload();
  cy.contains("1 of 5 topics completed");

  cy.intercept("POST", `${API}/learner/curriculum/join`).as("graceJoins");
  signedIn(grace).then((graces) => {
    cy.contains("Grace Hopper");
    cy.wait("@graceJoins")
      .its("request.body.planId")
      .should("equal", "plan-phone");
    accountPlan(graces).should("deep.include", {
      planId: "plan-phone",
      gradeLevel: inJss(1),
    });
    accountLearnt(graces, "plan-phone").should("deep.equal", [
      ["plan-phone", "mathematics", 0, "Whole Numbers"],
    ]);
    cy.contains("1 of 5 topics completed");
  });
  stored().its("plan.planId").should("equal", "plan-phone");
});
