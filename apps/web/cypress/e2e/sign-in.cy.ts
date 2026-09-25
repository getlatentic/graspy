import {
  accountLearnt,
  accountPlan,
  emulatorIsUp,
  googleAccount,
  saveAccountPlan,
  signInToGoogle,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  browserCache,
  devicePlan,
  oldDevice,
  serverIsUp,
} from "../support/learner-db";
import {
  HOUR,
  LAPTOP_SUBJECTS,
  PHONE_SUBJECTS,
  classDetails,
  firstTopicLearnt,
  inJss,
  laptopPlan,
  learnerIn,
  phonePlan,
  plan,
} from "../support/plans";
import { profile, signedIn, usedDevice } from "../support/signed-in";

const API = `${SERVER}/api`;
const UNION = [
  { name: "Mathematics", slug: "mathematics" },
  { name: "Basic Science", slug: "basic-science" },
  { name: "English Studies", slug: "english-studies" },
];

function subjectsShown(names: string[]): void {
  cy.visit("/app/learn/subjects");
  for (const name of names) cy.contains("main", name);
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
  cy.intercept("POST", `${API}/learner/curriculum/join`).as("join");
  cy.intercept("PUT", `${API}/learner/curriculum`).as("send");
});

it("opens the emulator's sign-in window, and asks nothing of an account signed out", () => {
  onDevice("phone");
  oldDevice(phonePlan(Date.now()), { graspy_user_profile: learnerIn(1) });

  cy.visit("/app/learn/you", {
    onBeforeLoad: (win) => cy.stub(win, "open").as("popup").returns(null),
  });
  cy.contains("Sign in with Google to keep your learning on all your devices");
  cy.contains("button", "Sign in with Google").click();

  cy.get("@popup").should("have.been.calledOnce");
  cy.get("@popup")
    .its("firstCall.args.0")
    .should("match", /^http:\/\/127\.0\.0\.1:9099\/emulator\/auth\/handler\?/);
  cy.contains('[role="alert"]', "Your browser blocked the sign-in window");
  cy.get("@join.all").should("have.length", 0);
  cy.get("@send.all").should("have.length", 0);
});

describe("joining an account on a device's first sign-in", () => {
  it("makes the first device's plan the account's, with its progress", () => {
    const ada = googleAccount("Ada Lovelace");
    onDevice("phone");
    usedDevice(
      phonePlan(Date.now() - HOUR),
      learnerIn(1),
      firstTopicLearnt("Mathematics"),
    );
    cy.contains("1 of 5 topics completed");

    signedIn(ada).then((signIn) => {
      cy.contains("Ada Lovelace");
      cy.contains(ada.email);
      cy.contains("1 of 5 topics completed");
      accountPlan(signIn).should("deep.include", {
        planId: "plan-phone",
        subjects: [
          { name: "Mathematics", slug: "mathematics" },
          { name: "Basic Science", slug: "basic-science" },
        ],
      });
      accountLearnt(signIn, "plan-phone").should("deep.equal", [
        ["plan-phone", "mathematics", 0, "Whole Numbers"],
      ]);
    });
  });

  it("merges a second device's plan for the same class, and moves its progress", () => {
    const ada = googleAccount("Ada Lovelace");
    onDevice("phone");
    usedDevice(
      phonePlan(Date.now() - HOUR),
      learnerIn(1),
      firstTopicLearnt("Mathematics"),
    );
    signedIn(ada);

    onDevice("laptop");
    usedDevice(
      laptopPlan(Date.now() - 2 * HOUR),
      learnerIn(1),
      firstTopicLearnt("English Studies"),
    );
    cy.contains("1 of 5 topics completed");
    cy.intercept("POST", `${API}/learner/curriculum/join`).as("laptopJoins");
    signedIn(ada).then((signIn) => {
      cy.wait("@laptopJoins")
        .its("request.body.planId")
        .should("equal", "plan-laptop");
      accountLearnt(signIn, "plan-phone").should("have.deep.members", [
        ["plan-phone", "mathematics", 0, "Whole Numbers"],
        ["plan-phone", "english-studies", 0, "Reading Comprehension"],
      ]);
    });
    devicePlan().should("deep.include", {
      planId: "plan-phone",
      subjects: UNION,
    });
    cy.contains("2 of 7 topics completed");
    subjectsShown(["Mathematics", "Basic Science", "English Studies"]);
    cy.visit("/app/learn/english-studies");
    cy.contains("1 of 2 learnt");

    devicePlan().then((laptops) => {
      onDevice("phone");
      subjectsShown(["Mathematics", "Basic Science", "English Studies"]);
      cy.visit("/app/learn/you");
      cy.contains("2 of 7 topics completed");
      devicePlan().should("deep.equal", laptops);
    });
  });

  it("takes the account's newer plan for another class whole", () => {
    const ada = googleAccount("Ada Lovelace");
    onDevice("phone");
    oldDevice(phonePlan(Date.now() - HOUR, 3), {
      graspy_user_profile: learnerIn(3),
    });
    signedIn(ada);

    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(ada).then((signIn) => {
      cy.contains("dd", /^JSS 3$/);
      cy.contains("dd", "JSS 1").should("not.exist");
      devicePlan().should("deep.include", {
        planId: "plan-phone",
        gradeLevel: inJss(3),
        subjects: [
          { name: "Mathematics", slug: "mathematics" },
          { name: "Basic Science", slug: "basic-science" },
        ],
      });
      accountPlan(signIn).its("planId").should("equal", "plan-phone");
    });
    profile().should("include", { gradeLevel: inJss(3), level: "jss-3" });
    cy.contains("a", "Change").click();
    cy.get("#grade").should("have.value", "JSS 3");
    cy.contains("button", "Save changes").should("be.disabled");
  });

  it("gives the account a second device's newer plan for another class, which the first follows", () => {
    const ada = googleAccount("Ada Lovelace");
    onDevice("phone");
    oldDevice(phonePlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(ada);

    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - HOUR, 3), {
      graspy_user_profile: learnerIn(3),
    });
    signedIn(ada).then((signIn) => {
      cy.contains("dd", /^JSS 3$/);
      devicePlan().its("planId").should("equal", "plan-laptop");
      accountPlan(signIn).should("deep.include", {
        planId: "plan-laptop",
        gradeLevel: inJss(3),
      });
    });

    onDevice("phone");
    cy.visit("/app/learn/you");
    cy.contains("dd", /^JSS 3$/);
    cy.contains("dd", "JSS 1").should("not.exist");
    devicePlan().should("deep.include", {
      planId: "plan-laptop",
      gradeLevel: inJss(3),
    });
    profile().should("include", { gradeLevel: inJss(3), level: "jss-3" });
    cy.contains("a", "Change").click();
    cy.get("#grade").should("have.value", "JSS 3");
  });

  it("shows the interface in the language of the account's newer plan", () => {
    const ada = googleAccount("Ada Lovelace");
    signInToGoogle(ada).then((another) =>
      saveAccountPlan(
        another,
        plan({
          planId: "plan-yoruba",
          subjects: PHONE_SUBJECTS,
          updatedAt: Date.now() - HOUR,
          details: classDetails(3, "yo"),
        }),
      ),
    );
    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    cy.visit("/app/learn/you");
    cy.contains("h1", "You");

    signedIn(ada);
    cy.contains("h1", "Ìwọ");
    cy.get("html").should("have.attr", "lang", "yo");
    cy.contains("button", "Jáde");
    profile().should("include", { language: "yo", level: "jss-3" });
    devicePlan().its("planId").should("equal", "plan-yoruba");
  });

  it("finds the class of an earlier version's plan, on a later start when the catalogue was unreachable", () => {
    const ada = googleAccount("Ada Lovelace");
    const earlier = plan({
      planId: "plan-earlier",
      subjects: PHONE_SUBJECTS,
      updatedAt: Date.now() - HOUR,
      details: {
        country: "Nigeria",
        language: "English",
        gradeLevel: inJss(3),
      },
    });
    signInToGoogle(ada).then((another) => saveAccountPlan(another, earlier));

    onDevice("tablet");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(ada);
    cy.contains("dd", /^JSS 3$/);
    profile().should("include", { level: "jss-3", system: "NG" });
    cy.contains("a", "Change").click();
    cy.get("#grade").should("have.value", "JSS 3");
    cy.contains("button", "Save changes").should("be.disabled");
    cy.get("#grade").click().type("JSS 2");
    cy.contains("button", "JSS 2").click();
    cy.contains("button", "Save changes").should("be.enabled");

    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    // The catalogue is cached an hour: the tablet's answer would skip the network.
    browserCache(false);
    cy.intercept("GET", `${API}/education/countries/*`, {
      forceNetworkError: true,
    }).as("unreachable");
    signedIn(ada);
    cy.wait("@unreachable");
    cy.contains("dd", inJss(3));
    profile().should("include", { gradeLevel: inJss(3), level: "" });

    cy.intercept("GET", `${API}/education/countries/*`, (request) =>
      request.continue(),
    );
    cy.reload();
    cy.contains("dd", /^JSS 3$/);
    profile().should("include", { level: "jss-3", system: "NG" });
    browserCache(true);
  });

  it("merges a rebuilt plan that kept codes for its place with the account's for the same class", () => {
    const ada = googleAccount("Ada Lovelace");
    signInToGoogle(ada).then((another) =>
      saveAccountPlan(another, phonePlan(Date.now() - HOUR)),
    );
    const rebuilt = plan({
      planId: "plan-rebuilt",
      subjects: LAPTOP_SUBJECTS,
      updatedAt: Date.now() - 2 * HOUR,
      details: { country: "NG", language: "en", gradeLevel: inJss(1) },
    });
    onDevice("laptop");
    oldDevice(rebuilt, { graspy_user_profile: learnerIn(1) });

    signedIn(ada, "/app/learn/subjects").then((signIn) => {
      cy.wait("@join").its("request.body").should("include", {
        planId: "plan-rebuilt",
        country: "Nigeria",
        language: "English",
      });
      accountPlan(signIn).should("deep.include", {
        planId: "plan-phone",
        subjects: UNION,
      });
    });
    devicePlan().should("deep.include", {
      planId: "plan-phone",
      subjects: UNION,
    });
    subjectsShown(["Mathematics", "Basic Science", "English Studies"]);
  });
});
