import {
  accountPlan,
  emulatorIsUp,
  googleAccount,
  type GoogleSignIn,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  devicePlan,
  online,
  retried,
  serverFollowsTheConnection,
  serverIsUp,
} from "../support/learner-db";
import {
  inClass,
  keepPlanWith,
  learningIn,
  openDetails,
} from "../support/learner-pages";
import { inJss } from "../support/plans";
import { phoneAndLaptop, profile } from "../support/signed-in";

const API = `${SERVER}/api`;

function accountIn(signIn: GoogleSignIn, gradeLevel: string): void {
  retried(
    () => accountPlan(signIn),
    (plan) => expect(plan?.gradeLevel).to.equal(gradeLevel),
  );
}

function showsClass(name: string): void {
  cy.visit("/app/learn/you");
  cy.contains("dd", new RegExp(`^${name}$`));
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
  cy.intercept("PUT", `${API}/learner/curriculum`).as("send");
});

afterEach(() => online(true));

it("takes a class changed on the phone to the laptop, on the same plan", () => {
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((signIn) => {
    onDevice("phone");
    cy.visit("/app/learn/you");
    openDetails();
    keepPlanWith(inClass("JSS 2"));
    cy.wait("@send").its("request.body.gradeLevel").should("equal", inJss(2));
    accountIn(signIn, inJss(2));
  });

  onDevice("laptop");
  showsClass("JSS 2");
  cy.contains("dd", "JSS 1").should("not.exist");
  devicePlan().should("deep.include", {
    planId: "plan-phone",
    gradeLevel: inJss(2),
  });
  profile().should("include", { level: "jss-2" });
});

it("takes a learning language changed on the phone to the laptop's details and interface", () => {
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((signIn) => {
    cy.contains("h1", "You");
    onDevice("phone");
    cy.visit("/app/learn/you");
    openDetails();
    keepPlanWith(learningIn("Yor"));
    cy.contains("h1", "Ìwọ");
    retried(
      () => accountPlan(signIn),
      (plan) => expect(plan).to.include({ languageCode: "yo" }),
    );
  });

  onDevice("laptop");
  cy.visit("/app/learn/you");
  cy.contains("h1", "Ìwọ");
  cy.get("html").should("have.attr", "lang", "yo");
  profile().should("include", { language: "yo", level: "jss-1" });
  devicePlan().should("deep.include", {
    planId: "plan-phone",
    languageCode: "yo",
  });
  cy.contains("a", "Yí i padà").click();
  cy.get("#language").invoke("val").should("match", /Yor/);
});

it("sends a change the phone made offline once it is back, and the laptop gets it", () => {
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((signIn) => {
    onDevice("phone");
    serverFollowsTheConnection();
    cy.visit("/app/learn/you");
    openDetails();
    online(false);
    keepPlanWith(inClass("JSS 2"));
    cy.contains("dd", /^JSS 2$/);
    accountPlan(signIn).its("gradeLevel").should("equal", inJss(1));

    online(true);
    accountIn(signIn, inJss(2));
  });

  onDevice("laptop");
  showsClass("JSS 2");
  devicePlan().its("planId").should("equal", "plan-phone");
});

it("keeps the later of two changes made apart, on both devices", () => {
  phoneAndLaptop(googleAccount("Ada Lovelace")).then((signIn) => {
    onDevice("phone");
    serverFollowsTheConnection();
    cy.visit("/app/learn/you");
    openDetails();
    online(false);
    keepPlanWith(inClass("JSS 2"));
    cy.contains("dd", /^JSS 2$/);
    online(true, false);

    onDevice("laptop");
    online(true);
    cy.visit("/app/learn/you");
    openDetails();
    keepPlanWith(inClass("JSS 3"));
    accountIn(signIn, inJss(3));

    onDevice("phone");
    cy.intercept("PUT", `${API}/learner/curriculum`).as("phoneSends");
    showsClass("JSS 3");
    cy.wait("@phoneSends").then(({ request, response }) => {
      expect(request.body.gradeLevel, "the phone's change").to.equal(inJss(2));
      expect(response?.body.plan.gradeLevel, "the account keeps").to.equal(
        inJss(3),
      );
    });
    accountPlan(signIn).its("gradeLevel").should("equal", inJss(3));
  });

  onDevice("laptop");
  showsClass("JSS 3");
});
