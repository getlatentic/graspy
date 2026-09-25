import { withAppClosed } from "./devices";

// Google accounts in Firebase's Auth emulator, and a device signed in to one.

export const EMULATOR = "http://127.0.0.1:9099";
// As .env.development sets it: Firebase keeps a sign-in under the app's key.
const API_KEY = "demo-graspy-key";
const IDENTITY = `${EMULATOR}/identitytoolkit.googleapis.com/v1`;

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

export interface Learner {
  id: string;
  name: string;
}

/** The device as Google's popup leaves it: Firebase holding the sign-in, and the app
 * knowing who it is, with no learner chosen yet; or, given one, as a device that chose
 * that learner before. Firebase moves the user into its IndexedDB on the next start. */
export function signInOnThisDevice(
  signIn: GoogleSignIn,
  {
    expirationTime = Date.now() + signIn.expiresIn * 1000,
    learner = null as Learner | null,
  } = {},
): void {
  const { name, email } = signIn.account;
  const account = {
    uid: signIn.uid,
    name,
    email,
    learner,
    deviceJoins: !learner,
  };
  withAppClosed(async (win) => {
    await deleted(win, "firebaseLocalStorageDb");
    win.localStorage.setItem(
      FIREBASE_USER_KEY,
      JSON.stringify(firebaseUser(signIn, expirationTime)),
    );
    win.localStorage.setItem("graspy.account", JSON.stringify(account));
  });
}
