import type { GoogleSignIn, Learner } from "./accounts";
import { SERVER } from "./learner-db";

// The server as another device of the account sees it: its learners, and each one's plan
// and record. The server checks every sign-in with the Auth emulator.

const API = `${SERVER}/api`;

// Its own device id, which has no record, so reading takes nothing into a learner.
const reader = () =>
  `e2e-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** A session for the account, with no learner chosen. */
export function accountSession(
  signIn: GoogleSignIn,
): Cypress.Chainable<string> {
  return cy
    .request("POST", `${API}/session`, {
      deviceId: reader(),
      firebaseIdToken: signIn.idToken,
    })
    .then(({ body }) => {
      expect(body.signedIn, "the server took the sign-in").to.equal(true);
      return body.token as string;
    });
}

export function learnersOf(signIn: GoogleSignIn): Cypress.Chainable<Learner[]> {
  return accountSession(signIn).then((token) =>
    cy
      .request({ url: `${API}/account/learners`, headers: bearer(token) })
      .its("body.learners"),
  );
}

export function addLearnerTo(
  signIn: GoogleSignIn,
  name: string,
): Cypress.Chainable<Learner> {
  return accountSession(signIn).then((token) =>
    cy
      .request({
        method: "POST",
        url: `${API}/account/learners`,
        headers: bearer(token),
        body: { name, guardian: true },
      })
      .its("body"),
  );
}

function chosen(signIn: GoogleSignIn, learner: Learner) {
  return accountSession(signIn).then((token) =>
    cy.request<{ token: string }>({
      method: "POST",
      url: `${API}/account/learners/${learner.id}/session`,
      headers: bearer(token),
      body: {},
      failOnStatusCode: false,
    }),
  );
}

function learnerSession(
  signIn: GoogleSignIn,
  learner: Learner,
): Cypress.Chainable<string> {
  return chosen(signIn, learner).then(({ status, body }) => {
    expect(status, `a session for ${learner.name}`).to.equal(200);
    return body.token;
  });
}

/** Whether the account still holds the learner. */
export function learnerKept(
  signIn: GoogleSignIn,
  learner: Learner,
): Cypress.Chainable<boolean> {
  return chosen(signIn, learner).then(({ status }) => status === 200);
}

export type Plan = Record<string, unknown> & {
  planId: string;
  updatedAt: number;
};

export function learnerPlan(
  signIn: GoogleSignIn,
  learner: Learner,
): Cypress.Chainable<Plan | null> {
  return learnerSession(signIn, learner).then((token) =>
    cy
      .request({ url: `${API}/learner/curriculum`, headers: bearer(token) })
      .then(({ body }) => cy.wrap<Plan | null>(body.plan, { log: false })),
  );
}

/** The learner's plan as another of their devices saved it. */
export function saveLearnerPlan(
  signIn: GoogleSignIn,
  learner: Learner,
  plan: object,
): void {
  learnerSession(signIn, learner).then((token) =>
    cy.request({
      method: "PUT",
      url: `${API}/learner/curriculum`,
      headers: bearer(token),
      body: plan,
    }),
  );
}

export type TopicKey = [string, string, number, string];

/** A topic the learner learnt, as their record keeps one learnt on another device. */
export function learntBy(
  signIn: GoogleSignIn,
  learner: Learner,
  [planId, subjectSlug, topicIndex, topic]: TopicKey,
): void {
  learnerSession(signIn, learner).then((token) =>
    cy.request({
      method: "POST",
      url: `${API}/learner/import`,
      headers: bearer(token),
      body: {
        topics: [
          { planId, subjectSlug, topicIndex, topic, learntAt: Date.now() },
        ],
      },
    }),
  );
}

interface Mark {
  planId: string;
  subjectSlug: string;
  topicIndex: number;
  topic: string;
  learntAt?: number | null;
}

const keyOf = (mark: Mark): TopicKey => [
  mark.planId,
  mark.subjectSlug,
  mark.topicIndex,
  mark.topic,
];

/** The topics the learner has learnt in a plan. */
export function learnerLearnt(
  signIn: GoogleSignIn,
  learner: Learner,
  planId: string,
): Cypress.Chainable<TopicKey[]> {
  return learnerSession(signIn, learner).then((token) =>
    cy
      .request({
        url: `${API}/learner`,
        qs: { planId },
        headers: bearer(token),
      })
      .its("body.topics")
      .then((topics: Mark[]) =>
        topics.filter((mark) => mark.learntAt).map(keyOf),
      ),
  );
}

/** The learner's conversations as another of their devices, the Android app, sends them. */
export function sendLearnerThreads(
  signIn: GoogleSignIn,
  learner: Learner,
  threads: object[],
): void {
  learnerSession(signIn, learner).then((token) =>
    cy.request({
      method: "POST",
      url: `${API}/learner/threads`,
      headers: bearer(token),
      body: { threads },
    }),
  );
}

export interface KeptMessage {
  id: string;
  type: string;
  content: string;
}

/** Every message of the learner's conversations, as another of their devices reads them. */
export function learnerMessages(
  signIn: GoogleSignIn,
  learner: Learner,
): Cypress.Chainable<KeptMessage[]> {
  return learnerSession(signIn, learner).then((token) =>
    cy
      .request({
        url: `${API}/learner/threads`,
        qs: { since: 0 },
        headers: bearer(token),
      })
      .its("body.threads")
      .then((threads: { messages: KeptMessage[] }[]) =>
        threads.flatMap((thread) => thread.messages),
      ),
  );
}
