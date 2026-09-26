import {
  addLearnerTo,
  learnerLearnt,
  learnerPlan,
  learnersOf,
  saveLearnerPlan,
} from "../support/account-api";
import {
  emulatorIsUp,
  googleAccount,
  signInOnThisDevice,
  signInToGoogle,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  agreesWithAccount,
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
import {
  pickLearner,
  profile,
  signedIn,
  usedDevice,
} from "../support/signed-in";

const API = `${SERVER}/api`;
const UNION = [
  { name: "Mathematics", slug: "mathematics" },
  { name: "Basic Science", slug: "basic-science" },
  { name: "English Studies", slug: "english-studies" },
];
const PHONES = UNION.slice(0, 2);

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
  cy.contains("Keep your learning on every device.");
  cy.contains("button", "Continue with Google").click();

  cy.get("@popup").should("have.been.calledOnce");
  cy.get("@popup")
    .its("firstCall.args.0")
    .should("match", /^http:\/\/127\.0\.0\.1:9099\/emulator\/auth\/handler\?/);
  cy.contains('[role="alert"]', "Your browser blocked the sign-in window");
  cy.get("@join.all").should("have.length", 0);
  cy.get("@send.all").should("have.length", 0);
});

it("offers sign-in from the landing page and onboarding, before any plan is made", () => {
  onDevice("tablet");
  cy.visit("/");
  cy.contains("header a", "Sign in");
  cy.contains("p", "Already learning with graspy?").find("a").click();
  cy.location("pathname").should("eq", "/app/sign-in");
  cy.contains("a", "Start learning").click();
  cy.contains("header a", "Sign in").click();

  cy.location("pathname").should("eq", "/app/sign-in");
  cy.window().then((win) => cy.stub(win, "open").as("popup").returns(null));
  cy.contains("h1", /^Sign in$/);
  cy.contains("button", "Continue with Google").click();

  cy.get("@popup")
    .its("firstCall.args.0")
    .should("match", /^http:\/\/127\.0\.0\.1:9099\/emulator\/auth\/handler\?/);
  cy.get("@join.all").should("have.length", 0);
  cy.get("@send.all").should("have.length", 0);
});

it("tells a device with a plan of its own that it goes to the learner chosen", () => {
  onDevice("phone");
  usedDevice(phonePlan(Date.now() - HOUR), learnerIn(1));
  signInToGoogle(googleAccount("Ada Lovelace")).then((signIn) =>
    signInOnThisDevice(signIn),
  );
  cy.visit("/app");
  cy.contains("h1", "Who's learning?");
  cy.contains("This device's plan goes to who you choose.");

  onDevice("tablet");
  signInToGoogle(googleAccount("Grace Hopper")).then((signIn) =>
    signInOnThisDevice(signIn),
  );
  cy.visit("/app");
  cy.contains("h1", "Who's learning?");
  cy.contains("This device's plan").should("not.exist");
});

it("adds a learner only once named and vouched for by them or their guardian", () => {
  onDevice("phone");
  oldDevice(phonePlan(Date.now()), { graspy_user_profile: learnerIn(1) });
  signInToGoogle(googleAccount("Ada Lovelace")).then(signInOnThisDevice);
  cy.visit("/app/learn/you");

  cy.location("pathname").should("eq", "/app/learners");
  cy.contains("h1", "Who's learning?");
  cy.contains("button", "Add learner").click();
  const add = () => cy.contains("button", /^Add$/);
  add().should("be.disabled");
  cy.get("#learner-name").type("Ada");
  add().should("be.disabled");
  cy.contains("label", "I'm this learner").find("input").check();
  add().should("be.enabled");
  cy.get("#learner-name").clear();
  add().should("be.disabled");
});

it("says when the account holds as many learners as it can", () => {
  signInToGoogle(googleAccount("Pat Okafor")).then((signIn) => {
    for (let n = 1; n <= 8; n += 1) addLearnerTo(signIn, `Child ${n}`);
    onDevice("tablet");
    signInOnThisDevice(signIn);
  });
  cy.visit("/app");

  cy.contains("button", "Child 8");
  cy.contains("This account is full: 8 learners.");
  cy.contains("button", "Add learner").should("not.exist");
});

describe("a device's first sign-in, choosing who is learning", () => {
  it("gives a learner added then the device's plan and progress", () => {
    const ada = googleAccount("Ada Lovelace");
    onDevice("phone");
    usedDevice(
      phonePlan(Date.now() - HOUR),
      learnerIn(1),
      firstTopicLearnt("Mathematics"),
    );
    cy.contains("1 of 5 topics completed");

    signedIn(ada, { add: "Ada" }).then(({ signIn, learner }) => {
      cy.contains("Ada Lovelace");
      cy.contains(ada.email);
      cy.contains("Learning as Ada");
      cy.contains("1 of 5 topics completed");
      learnerPlan(signIn, learner).should("deep.include", {
        planId: "plan-phone",
        subjects: PHONES,
      });
      learnerLearnt(signIn, learner, "plan-phone").should("deep.equal", [
        ["plan-phone", "mathematics", 0, "Whole Numbers"],
      ]);
    });
  });

  it("merges the device's plan into a learner's for the same class, with its progress", () => {
    const account = googleAccount("Ada Lovelace");
    onDevice("phone");
    usedDevice(
      phonePlan(Date.now() - HOUR),
      learnerIn(1),
      firstTopicLearnt("Mathematics"),
    );
    signedIn(account, { add: "Ada" });

    onDevice("laptop");
    usedDevice(
      laptopPlan(Date.now() - 2 * HOUR),
      learnerIn(1),
      firstTopicLearnt("English Studies"),
    );
    cy.contains("1 of 5 topics completed");
    cy.intercept("POST", `${API}/learner/curriculum/join`).as("laptopJoins");
    signedIn(account, { choose: "Ada" }).then(({ signIn, learner }) => {
      cy.wait("@laptopJoins")
        .its("request.body.planId")
        .should("equal", "plan-laptop");
      learnerLearnt(signIn, learner, "plan-phone").should("have.deep.members", [
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

  it("takes a learner's newer plan for another class whole", () => {
    const account = googleAccount("Ada Lovelace");
    onDevice("phone");
    oldDevice(phonePlan(Date.now() - HOUR, 3), {
      graspy_user_profile: learnerIn(3),
    });
    signedIn(account, { add: "Ada" });

    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(account, { choose: "Ada" }).then(({ signIn, learner }) => {
      cy.contains("dd", /^JSS 3$/);
      cy.contains("dd", "JSS 1").should("not.exist");
      devicePlan().should("deep.include", {
        planId: "plan-phone",
        gradeLevel: inJss(3),
        subjects: PHONES,
      });
      learnerPlan(signIn, learner).its("planId").should("equal", "plan-phone");
    });
    profile().should("include", { gradeLevel: inJss(3), level: "jss-3" });
    cy.contains("a", "Change").click();
    cy.get("#grade").should("have.value", "JSS 3");
    cy.contains("button", "Save changes").should("be.disabled");
  });

  it("gives a learner the device's newer plan for another class, which their other device follows", () => {
    const account = googleAccount("Ada Lovelace");
    onDevice("phone");
    oldDevice(phonePlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(account, { add: "Ada" });

    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - HOUR, 3), {
      graspy_user_profile: learnerIn(3),
    });
    signedIn(account, { choose: "Ada" }).then(({ signIn, learner }) => {
      cy.contains("dd", /^JSS 3$/);
      devicePlan().its("planId").should("equal", "plan-laptop");
      learnerPlan(signIn, learner).should("deep.include", {
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

  it("shows the interface in the language of the learner's newer plan", () => {
    const account = googleAccount("Ada Lovelace");
    signInToGoogle(account).then((another) =>
      addLearnerTo(another, "Ada").then((ada) =>
        saveLearnerPlan(
          another,
          ada,
          plan({
            planId: "plan-yoruba",
            subjects: PHONE_SUBJECTS,
            updatedAt: Date.now() - HOUR,
            details: classDetails(3, "yo"),
          }),
        ),
      ),
    );
    onDevice("laptop");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    cy.visit("/app/learn/you");
    cy.contains("h1", "You");

    signedIn(account, { choose: "Ada" });
    cy.contains("h1", "Ìwọ");
    cy.get("html").should("have.attr", "lang", "yo");
    cy.contains("button", "Jáde");
    profile().should("include", { language: "yo", level: "jss-3" });
    devicePlan().its("planId").should("equal", "plan-yoruba");
  });

  it("finds the class of an earlier version's plan, on a later start when the catalogue was unreachable", () => {
    const account = googleAccount("Ada Lovelace");
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
    signInToGoogle(account).then((another) =>
      addLearnerTo(another, "Ada").then((ada) =>
        saveLearnerPlan(another, ada, earlier),
      ),
    );

    onDevice("tablet");
    oldDevice(laptopPlan(Date.now() - 2 * HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signedIn(account, { choose: "Ada" });
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
    signedIn(account, { choose: "Ada" });
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

  it("merges a rebuilt plan that kept codes for its place with a learner's for the same class", () => {
    const account = googleAccount("Ada Lovelace");
    signInToGoogle(account).then((another) =>
      addLearnerTo(another, "Ada").then((ada) =>
        saveLearnerPlan(another, ada, phonePlan(Date.now() - HOUR)),
      ),
    );
    const rebuilt = plan({
      planId: "plan-rebuilt",
      subjects: LAPTOP_SUBJECTS,
      updatedAt: Date.now() - 2 * HOUR,
      details: { country: "NG", language: "en", gradeLevel: inJss(1) },
    });
    onDevice("laptop");
    oldDevice(rebuilt, { graspy_user_profile: learnerIn(1) });

    signedIn(account, { choose: "Ada" }, "/app/learn/subjects").then(
      ({ signIn, learner }) => {
        cy.wait("@join").its("request.body").should("include", {
          planId: "plan-rebuilt",
          country: "Nigeria",
          language: "English",
        });
        learnerPlan(signIn, learner).should("deep.include", {
          planId: "plan-phone",
          subjects: UNION,
        });
      },
    );
    devicePlan().should("deep.include", {
      planId: "plan-phone",
      subjects: UNION,
    });
    subjectsShown(["Mathematics", "Basic Science", "English Studies"]);
  });

  // An account from before learners becomes its first learner on the server
  // (tests/test_learners.py); the running server keeps no such account to sign in to.
  it("asks a device signed in before accounts held learners who is learning, and joins its plan", () => {
    const account = googleAccount("Ada Lovelace");
    onDevice("phone");
    oldDevice(phonePlan(Date.now() - HOUR), {
      graspy_user_profile: learnerIn(1),
    });
    signInToGoogle(account).then((signIn) => {
      signInOnThisDevice(signIn);
      cy.window().then((win) =>
        win.localStorage.setItem(
          "graspy.account",
          JSON.stringify({
            uid: signIn.uid,
            name: account.name,
            email: account.email,
          }),
        ),
      );
      cy.visit("/app/learn/you");
      pickLearner({ add: "Ada" });
      cy.location("pathname").should("eq", "/app/learn");
      agreesWithAccount();
      learnersOf(signIn).then(([ada]) =>
        learnerPlan(signIn, ada).its("planId").should("equal", "plan-phone"),
      );
    });
  });
});
