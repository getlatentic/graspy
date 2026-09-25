import {
  addLearnerTo,
  learnerKept,
  learnerPlan,
  learnersOf,
  saveLearnerPlan,
} from "../support/account-api";
import {
  emulatorIsUp,
  googleAccount,
  signInOnThisDevice,
  signInToGoogle,
  type GoogleAccount,
  type GoogleSignIn,
  type Learner,
} from "../support/accounts";
import { onDevice } from "../support/devices";
import {
  SERVER,
  devicePlan,
  localKeys,
  online,
  retried,
  serverFollowsTheConnection,
  serverIsUp,
  storeCounts,
} from "../support/learner-db";
import { inClass, keepPlanWith, openDetails } from "../support/learner-pages";
import { HOUR, inJss, laptopPlan, phonePlan } from "../support/plans";
import { learnerOnDevice, pickLearner, profile } from "../support/signed-in";

const API = `${SERVER}/api`;

interface Family {
  signIn: GoogleSignIn;
  ada: Learner;
  grace: Learner;
}

/** A parent's account holding Ada, in JSS 1, and Grace, in JSS 3, each with a plan. */
function family(parent: GoogleAccount): Cypress.Chainable<Family> {
  return signInToGoogle(parent).then((signIn) =>
    addLearnerTo(signIn, "Ada").then((ada) => {
      saveLearnerPlan(signIn, ada, phonePlan(Date.now() - HOUR));
      return addLearnerTo(signIn, "Grace").then((grace) => {
        saveLearnerPlan(signIn, grace, laptopPlan(Date.now() - HOUR, 3));
        return cy.wrap({ signIn, ada, grace });
      });
    }),
  );
}

/** An empty device signs in to the account, as the learner named. */
function learningAs(parent: GoogleAccount, name: string): void {
  signInToGoogle(parent).then((signIn) => signInOnThisDevice(signIn));
  cy.visit("/app");
  pickLearner({ choose: name });
  cy.location("pathname").should("eq", "/app/learn");
}

function youShow(name: string, level: string): void {
  cy.visit("/app/learn/you");
  cy.contains(`Learning as ${name}`);
  cy.contains("dd", new RegExp(`^${level}$`));
}

function switchTo(name: string): void {
  cy.visit("/app/learn/you");
  cy.contains("a", "Switch learner").click();
  pickLearner({ choose: name });
  cy.location("pathname").should("eq", "/app/learn");
}

/** Nothing on the device names the plan, in its storage or its database. */
function nothingOf(planId: string): void {
  localKeys().then((keys) =>
    expect(keys.filter((key) => key.includes(planId))).to.deep.equal([]),
  );
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve, reject) => {
        const open = win.indexedDB.open("graspy-db");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = [...db.objectStoreNames];
          const tx = db.transaction(names, "readonly");
          const all = names.map((name) => tx.objectStore(name).getAll());
          tx.oncomplete = () => {
            db.close();
            const kept = JSON.stringify(all.map((request) => request.result));
            expect(kept, "the device's database").not.to.include(planId);
            resolve();
          };
        };
      }),
  );
}

beforeEach(() => {
  serverIsUp();
  emulatorIsUp();
  cy.viewport(402, 860);
});

afterEach(() => online(true));

it("switches between a parent's learners, each with their own plan and class", () => {
  const parent = googleAccount("Pat Okafor");
  family(parent);
  onDevice("tablet");
  learningAs(parent, "Ada");
  youShow("Ada", "JSS 1");
  devicePlan().its("planId").should("equal", "plan-phone");
  cy.visit("/app/learn/mathematics");
  cy.contains("0 of 3 learnt");

  switchTo("Grace");
  cy.location("pathname").should("eq", "/app/learn");
  youShow("Grace", "JSS 3");
  devicePlan().its("planId").should("equal", "plan-laptop");
  profile().should("include", { gradeLevel: inJss(3) });
  nothingOf("plan-phone");
  cy.visit("/app/learn/subjects");
  cy.contains("main", "English Studies");
  cy.contains("main", "Basic Science").should("not.exist");

  switchTo("Ada");
  youShow("Ada", "JSS 1");
  devicePlan().its("planId").should("equal", "plan-phone");
  nothingOf("plan-laptop");
});

it("sends the laptop to the picker, wiped, once its learner is removed on the phone", () => {
  const parent = googleAccount("Pat Okafor");
  family(parent).then(({ signIn, ada, grace }) => {
    onDevice("laptop");
    learningAs(parent, "Grace");
    youShow("Grace", "JSS 3");

    onDevice("phone");
    learningAs(parent, "Ada");
    cy.visit("/app/learn/you");
    cy.contains("a", "Learners").click();
    cy.location("pathname").should("eq", "/app/learn/you/learners");
    cy.contains("li", "Grace").contains("button", "Remove").click();
    cy.contains(
      "Remove Grace? Their plan, progress, lessons and conversations are deleted from graspy. This can't be undone.",
    );
    cy.contains("button", "Remove Grace").click();
    cy.contains("li", "Grace").should("not.exist");
    learnerKept(signIn, grace).should("equal", false);
    learnersOf(signIn).should("deep.equal", [ada]);

    onDevice("laptop");
    cy.visit("/app/learn");
    cy.location("pathname").should("eq", "/app/learners");
    cy.contains("button", "Ada");
    cy.contains("button", "Grace").should("not.exist");
    learnerOnDevice().should("equal", null);
    devicePlan().should("equal", null);
    cy.window()
      .its("localStorage")
      .invoke("getItem", "graspy_user_profile")
      .should("be.null");
    nothingOf("plan-laptop");
  });
});

it("renames a learner, and their other device learns the new name on its next start", () => {
  const parent = googleAccount("Pat Okafor");
  family(parent);
  onDevice("laptop");
  learningAs(parent, "Ada");
  onDevice("phone");
  learningAs(parent, "Ada");

  cy.visit("/app/learn/you/learners");
  cy.contains("li", "Ada").contains("button", "Rename").click();
  cy.get('input[aria-label="Learner\'s name"]').clear().type("Ada L.");
  cy.contains("button", "Save").click();
  cy.contains("li", "Ada L.");
  youShow("Ada L.", "JSS 1");

  onDevice("laptop");
  youShow("Ada L.", "JSS 1");
});

it("deletes the account with every learner, wiping and signing out the device", () => {
  const parent = googleAccount("Pat Okafor");
  family(parent);
  onDevice("phone");
  learningAs(parent, "Ada");
  let was: string | null = null;
  cy.window().then((win) => {
    was = win.localStorage.getItem("graspy_device_id");
  });

  cy.visit("/app/learn/you/learners");
  cy.contains("Your Google account itself stays with Google.");
  cy.contains("button", "Delete my account").click();
  cy.contains(
    "Delete this account? Every learner's plan, progress, lessons and conversations are deleted from graspy.",
  );
  cy.contains("button", "Yes, delete my account").click();

  cy.location("pathname").should("eq", "/");
  learnerOnDevice().should("equal", null);
  cy.window()
    .its("localStorage")
    .invoke("getItem", "graspy_user_profile")
    .should("be.null");
  storeCounts().then((counts) =>
    expect(Object.values(counts).every((count) => count === 0)).to.equal(true),
  );
  cy.window().then((win) => {
    const now = win.localStorage.getItem("graspy_device_id");
    expect(now, "the device's id").not.to.equal(was);
  });
  signInToGoogle(parent).then((again) => {
    learnersOf(again).should("deep.equal", []);
    signInOnThisDevice(again);
  });
  cy.visit("/app");
  cy.contains("h1", "Who's learning?");
  cy.contains("button", "Add a learner");
  cy.contains("button", "Ada").should("not.exist");
});

it("refuses to switch until what is unsent reaches the server, losing nothing", () => {
  const parent = googleAccount("Pat Okafor");
  family(parent).then(({ signIn, ada }) => {
    onDevice("tablet");
    learningAs(parent, "Ada");
    serverFollowsTheConnection();
    cy.intercept("PUT", `${API}/learner/curriculum`, {
      forceNetworkError: true,
    }).as("unsent");
    cy.visit("/app/learn/you");
    openDetails();
    keepPlanWith(inClass("JSS 2"));
    cy.wait("@unsent");
    cy.contains("a", "Switch learner").click();
    cy.contains("button", "Grace");

    online(false);
    cy.contains("button", "Grace").click();
    cy.contains('[role="alert"]', "Connect to the internet, then switch");
    online(true);
    cy.contains("button", "Grace").click();
    cy.contains('[role="alert"]', "Connect to the internet, then switch");
    cy.location("pathname").should("eq", "/app/learners");
    learnerOnDevice().its("name").should("equal", "Ada");
    devicePlan().should("deep.include", {
      planId: "plan-phone",
      gradeLevel: inJss(2),
    });
    learnerPlan(signIn, ada).its("gradeLevel").should("equal", inJss(1));

    cy.intercept("PUT", `${API}/learner/curriculum`, (request) =>
      request.continue(),
    );
    cy.contains("button", "Grace").click();
    cy.location("pathname").should("eq", "/app/learn");
    learnerOnDevice().its("name").should("equal", "Grace");
    retried(
      () => learnerPlan(signIn, ada),
      (plan) => expect(plan?.gradeLevel).to.equal(inJss(2)),
    );
  });
});
