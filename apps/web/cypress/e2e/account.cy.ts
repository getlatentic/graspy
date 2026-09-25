import {
  OLD_PLAN,
  OLD_PLAN_ID,
  SERVER,
  oldDevice,
  serverIsUp,
  stored,
} from "../support/learner-db";

// Google's popup cannot run here, so the tests start where it ends: Firebase holding
// a signed-in user, and the server exchanging its ID token for a session. The local
// server has sign-in off, so the exchange is stubbed with a session the server issued
// to a learner that stands in for the account; the plan endpoints are the real ones.

const API = `${SERVER}/api`;
const LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup*";
const USER = {
  uid: "e2eAccountUid",
  name: "Ada Lovelace",
  email: "ada@example.com",
};

let accountToken = "";

function firebaseApiKey(): Cypress.Chainable<string> {
  return cy
    .readFile(".env.development.local")
    .then((env: string) =>
      /^VITE_FIREBASE_API_KEY=(.+)$/m.exec(env)![1].trim(),
    );
}

// As Firebase's browserLocalPersistence keeps a signed-in user.
function firebaseUser(apiKey: string): Record<string, string> {
  const user = {
    uid: USER.uid,
    email: USER.email,
    displayName: USER.name,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    stsTokenManager: {
      refreshToken: "e2e-refresh",
      accessToken: "e2e-id-token",
      expirationTime: Date.now() + 3_600_000,
    },
    apiKey,
    appName: "[DEFAULT]",
  };
  return {
    [`firebase:authUser:${apiKey}:[DEFAULT]`]: JSON.stringify(user),
    "graspy.account": JSON.stringify(USER),
  };
}

function withoutFirebaseUsers(): void {
  cy.visit("/");
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        const wiped = win.indexedDB.deleteDatabase("firebaseLocalStorageDb");
        wiped.onsuccess = wiped.onerror = wiped.onblocked = () => resolve();
      }),
  );
}

function accountPlan(): Cypress.Chainable<Record<string, unknown> | null> {
  return cy
    .request({
      url: `${API}/learner/curriculum`,
      headers: { Authorization: `Bearer ${accountToken}` },
    })
    .its("body.plan");
}

beforeEach(() => {
  serverIsUp();
  cy.viewport(402, 860);
  withoutFirebaseUsers();
  const learner = `e2e-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  cy.request("POST", `${API}/session`, { deviceId: learner }).then(
    ({ body }) => {
      accountToken = body.token;
    },
  );
  cy.intercept("POST", `${API}/session`, (request) => {
    if (!request.body.firebaseIdToken) return;
    expect(request.body.firebaseIdToken).to.equal("e2e-id-token");
    request.reply({ token: accountToken, expiresIn: 3600, signedIn: true });
  }).as("session");
  cy.intercept("POST", LOOKUP, {
    users: [
      {
        localId: USER.uid,
        email: USER.email,
        displayName: USER.name,
        emailVerified: true,
      },
    ],
  });
  cy.intercept("POST", `${API}/learner/curriculum/join`).as("join");
  cy.intercept("PUT", `${API}/learner/curriculum`).as("send");
});

describe("signed out", () => {
  beforeEach(() => oldDevice(OLD_PLAN, {}));

  it("offers Google sign-in on the You page and opens Google's popup", () => {
    cy.visit("/app/learn/you", {
      onBeforeLoad: (win) => cy.stub(win, "open").as("popup").returns(null),
    });

    cy.contains("h2", "Your account");
    cy.contains(
      "Sign in with Google to keep your learning on all your devices",
    );
    cy.contains("button", "Sign in with Google").click();

    cy.get("@popup").should("have.been.calledOnce");
    cy.get("@popup")
      .its("firstCall.args.0")
      .should(
        "match",
        /^https:\/\/graspy-f482e\.firebaseapp\.com\/__\/auth\/handler\?/,
      );
    cy.contains('[role="alert"]', "Your browser blocked the sign-in window");
  });

  it("does not ask the server for the account's plan", () => {
    cy.visit("/app/learn/you");
    cy.contains("button", "Sign in with Google");
    cy.get("@join.all").should("have.length", 0);
    cy.get("@send.all").should("have.length", 0);
  });
});

describe("signed in", () => {
  const ACCOUNT_PLAN = {
    id: "current",
    planId: "plan-account",
    country: "Nigeria",
    language: "English",
    gradeLevel: "JSS 1",
    subjects: [
      { name: "Mathematics", slug: "mathematics" },
      { name: "Basic Science", slug: "basic-science" },
    ],
    topics: {
      mathematics: ["Whole Numbers", "Fractions"],
      "basic-science": ["Living Things"],
    },
    createdAt: 1,
    updatedAt: 2,
  };

  beforeEach(() => {
    cy.then(() =>
      cy.request({
        method: "PUT",
        url: `${API}/learner/curriculum`,
        headers: { Authorization: `Bearer ${accountToken}` },
        body: ACCOUNT_PLAN,
      }),
    );
    firebaseApiKey().then((apiKey) =>
      oldDevice(OLD_PLAN, firebaseUser(apiKey)),
    );
  });

  it("joins the device's plan to the account's and shows the one plan", () => {
    cy.visit("/app/learn/subjects");

    cy.wait("@join").its("request.body.planId").should("equal", OLD_PLAN_ID);
    cy.get("main")
      .should("contain", "Basic Science")
      .and("contain", "Mathematics")
      .and("contain", "English Studies");
    stored().its("plan.planId").should("equal", "plan-account");
    accountPlan()
      .its("subjects")
      .should("deep.equal", [
        { name: "Mathematics", slug: "mathematics" },
        { name: "Basic Science", slug: "basic-science" },
        { name: "English Studies", slug: "english-studies" },
      ]);
  });

  it("sends a change to the plan to the account", () => {
    cy.visit("/app/learn/you");
    cy.wait("@join");
    cy.contains("a", "Change").click();
    cy.get("#grade").click().type("JSS 2");
    cy.contains("button", "JSS 2").click();
    cy.contains("button", "Save changes").click();
    cy.contains("button", "Keep my plan").click();

    cy.wait("@send")
      .its("request.body.gradeLevel")
      .should("equal", "JSS 2 (Junior Secondary School), Nigeria, age 13");
    accountPlan()
      .its("gradeLevel")
      .should("equal", "JSS 2 (Junior Secondary School), Nigeria, age 13");
  });

  it("shows the account and signs out, keeping the plan on the device", () => {
    cy.visit("/app/learn/you");
    cy.wait("@join");
    cy.contains("Ada Lovelace");
    cy.contains("ada@example.com");

    cy.contains("button", "Sign out").click();

    cy.contains("button", "Sign in with Google");
    cy.window()
      .its("localStorage")
      .invoke("getItem", "graspy.account")
      .should("be.null");
    stored().its("plan.planId").should("equal", "plan-account");
  });
});
