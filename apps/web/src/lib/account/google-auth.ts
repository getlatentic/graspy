import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import { FIREBASE_AUTH_EMULATOR, FIREBASE_CONFIG } from "@/lib/env";
import type { Identity } from "./account-store";
import { NOT_SIGNED_IN } from "./google-auth-codes";

// The only module that imports Firebase. It is imported on demand, so the app's
// first download does not carry the SDK.

let auth: Auth | null = null;

function started(): Auth | null {
  if (!FIREBASE_CONFIG) return null;
  const created = initializeAuth(initializeApp(FIREBASE_CONFIG), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  if (FIREBASE_AUTH_EMULATOR) {
    connectAuthEmulator(created, FIREBASE_AUTH_EMULATOR, {
      disableWarnings: true,
    });
  }
  return created;
}

function googleAuth(): Auth | null {
  auth ??= started();
  return auth;
}

function configuredAuth(): Auth {
  const configured = googleAuth();
  if (!configured) throw new Error("Sign-in is not configured");
  return configured;
}

/** On Safari and phones this also loads the popup's helper frame, so a tap can open the
 * popup at once: those browsers block a popup opened after the tap's moment has passed. */
export async function prepareGoogle(): Promise<void> {
  await configuredAuth().authStateReady();
}

export interface GoogleSignIn {
  account: Identity;
  idToken: string;
}

/** Call from the tap itself, with nothing awaited before it. */
export async function signInWithGoogle(): Promise<GoogleSignIn> {
  const { user } = await signInWithPopup(
    configuredAuth(),
    new GoogleAuthProvider(),
  );
  return {
    account: { uid: user.uid, name: user.displayName, email: user.email },
    idToken: await user.getIdToken(),
  };
}

/** The parent signs in with Google again, which the server takes as proof that it was them
 * and not whoever left the device signed in. Call from the tap itself, with nothing awaited
 * before it. A different Google account than the one signed in is refused by Firebase. */
export async function reauthenticateWithGoogle(): Promise<string> {
  const { currentUser } = configuredAuth();
  if (!currentUser) {
    throw Object.assign(new Error("Not signed in"), { code: NOT_SIGNED_IN });
  }
  await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
  return currentUser.getIdToken(true);
}

/** Null once Firebase no longer has the learner signed in. */
export async function googleIdToken(fresh: boolean): Promise<string | null> {
  const signedIn = googleAuth();
  if (!signedIn) return null;
  await signedIn.authStateReady();
  return signedIn.currentUser ? signedIn.currentUser.getIdToken(fresh) : null;
}

export async function signOutOfGoogle(): Promise<void> {
  const signedIn = googleAuth();
  if (signedIn) await signOut(signedIn);
}
