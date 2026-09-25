import { withAppClosed } from "./devices";
import { SERVER } from "./learner-db";

// Google accounts in Firebase's Auth emulator, and the signed-in session the server
// issues for one. The server checks every sign-in with the emulator.

export const EMULATOR = "http://127.0.0.1:9099";
// As .env.development sets it: Firebase keeps a sign-in under the app's key.
const API_KEY = "demo-graspy-key";
const IDENTITY = `${EMULATOR}/identitytoolkit.googleapis.com/v1`;
const API = `${SERVER}/api`;

export interface GoogleAccount {
  sub: string;
  name: string;
  email: string;
}

/** One device's sign-in to an account, with the tokens the emulator issued it. */
export interface GoogleSignIn {
  account: GoogleAccount;
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function emulatorIsUp(): void {
  cy.request({ url: `${EMULATOR}/`, failOnStatusCode: false }).then(
    (response) => {
      expect(
        response.body?.authEmulator?.ready,
        `the Auth emulator at ${EMULATOR} (docs/DEVELOPMENT.md starts it)`,
      ).to.equal(true);
    },
  );
}

/** A Google account of its own for each test: the same sub is the same account. */
export function googleAccount(name: string): GoogleAccount {
  const sub = `e2e${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return { sub, name, email: `${sub}@example.com` };
}

/** What Google's popup ends with: the emulator signs the account in. */
export function signInToGoogle(
  account: GoogleAccount,
): Cypress.Chainable<GoogleSignIn> {
  const claims = JSON.stringify({
    sub: account.sub,
    email: account.email,
    name: account.name,
    email_verified: true,
  });
  return cy
    .request("POST", `${IDENTITY}/accounts:signInWithIdp?key=${API_KEY}`, {
      postBody: `id_token=${claims}&providerId=google.com`,
      requestUri: "http://localhost",
      returnSecureToken: true,
    })
    .its("body")
    .then((body) => ({
      account,
      uid: body.localId,
      idToken: body.idToken,
      refreshToken: body.refreshToken,
      expiresIn: Number(body.expiresIn),
    }));
}

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function claimsOf(idToken: string): Record<string, unknown> & {
  exp: number;
} {
  const payload = idToken.split(".")[1];
  return JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
}

/** The sign-in with its ID token expired an hour ago. The emulator's tokens are
 * unsigned, so the claims can be moved back. */
export function expiredSignIn(signIn: GoogleSignIn): GoogleSignIn {
  const [header, , signature] = signIn.idToken.split(".");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...claimsOf(signIn.idToken),
    auth_time: now - 7200,
    iat: now - 7200,
    exp: now - 3600,
  };
  return { ...signIn, idToken: `${header}.${base64url(claims)}.${signature}` };
}

export function deleteGoogleAccount(signIn: GoogleSignIn): void {
  cy.request("POST", `${IDENTITY}/accounts:delete?key=${API_KEY}`, {
    idToken: signIn.idToken,
  });
}

export const FIREBASE_USER_KEY = `firebase:authUser:${API_KEY}:[DEFAULT]`;

// As Firebase's persistence saves a signed-in user (UserImpl.toJSON).
function firebaseUser(signIn: GoogleSignIn, expirationTime: number) {
  const { sub, name, email } = signIn.account;
  return {
    uid: signIn.uid,
    email,
    emailVerified: true,
    displayName: name,
    isAnonymous: false,
    providerData: [
      {
        providerId: "google.com",
        uid: sub,
        displayName: name,
        email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    stsTokenManager: {
      refreshToken: signIn.refreshToken,
      accessToken: signIn.idToken,
      expirationTime,
    },
    createdAt: `${Date.now()}`,
    lastLoginAt: `${Date.now()}`,
    apiKey: API_KEY,
    appName: "[DEFAULT]",
  };
}

function deleted(win: Window, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error(`A page still holds ${name} open`));
  });
}

/** The device as Google's popup leaves it: Firebase holding the sign-in, and the app
 * knowing who it is. Firebase moves the user into its IndexedDB on the next start. */
export function signInOnThisDevice(
  signIn: GoogleSignIn,
  { expirationTime = Date.now() + signIn.expiresIn * 1000 } = {},
): void {
  const { name, email } = signIn.account;
  withAppClosed(async (win) => {
    await deleted(win, "firebaseLocalStorageDb");
    win.localStorage.setItem(
      FIREBASE_USER_KEY,
      JSON.stringify(firebaseUser(signIn, expirationTime)),
    );
    win.localStorage.setItem(
      "graspy.account",
      JSON.stringify({ uid: signIn.uid, name, email }),
    );
  });
}

/** A session naming the account, as the server issues one for a sign-in. Its own device
 * id, which has no record, so reading takes nothing into the account. */
function accountSession(signIn: GoogleSignIn): Cypress.Chainable<string> {
  const reader = `e2e-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return cy
    .request("POST", `${API}/session`, {
      deviceId: reader,
      firebaseIdToken: signIn.idToken,
    })
    .then(({ body }) => {
      expect(body.signedIn, "the server took the sign-in").to.equal(true);
      return body.token as string;
    });
}

export type Plan = Record<string, unknown> & {
  planId: string;
  updatedAt: number;
};

export function accountPlan(
  signIn: GoogleSignIn,
): Cypress.Chainable<Plan | null> {
  return accountSession(signIn).then((token) =>
    cy
      .request({
        url: `${API}/learner/curriculum`,
        headers: { Authorization: `Bearer ${token}` },
      })
      .its("body.plan"),
  );
}

/** The account's plan as another device of it saved it. */
export function saveAccountPlan(signIn: GoogleSignIn, plan: object): void {
  accountSession(signIn).then((token) =>
    cy.request({
      method: "PUT",
      url: `${API}/learner/curriculum`,
      headers: { Authorization: `Bearer ${token}` },
      body: plan,
    }),
  );
}

export type TopicKey = [string, string, number, string];

/** A topic learnt in the account, as its record keeps one learnt on another device. */
export function learntInAccount(
  signIn: GoogleSignIn,
  [planId, subjectSlug, topicIndex, topic]: TopicKey,
): void {
  accountSession(signIn).then((token) =>
    cy.request({
      method: "POST",
      url: `${API}/learner/import`,
      headers: { Authorization: `Bearer ${token}` },
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

/** The topics the account has learnt in a plan. */
export function accountLearnt(
  signIn: GoogleSignIn,
  planId: string,
): Cypress.Chainable<TopicKey[]> {
  return accountSession(signIn).then((token) =>
    cy
      .request({
        url: `${API}/learner`,
        qs: { planId },
        headers: { Authorization: `Bearer ${token}` },
      })
      .its("body.topics")
      .then((topics: Mark[]) =>
        topics
          .filter((mark) => mark.learntAt)
          .map((mark): TopicKey => [
            mark.planId,
            mark.subjectSlug,
            mark.topicIndex,
            mark.topic,
          ]),
      ),
  );
}
