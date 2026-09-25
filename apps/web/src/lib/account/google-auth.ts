import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import { FIREBASE_AUTH_EMULATOR, FIREBASE_CONFIG } from "@/lib/env";
import type { Identity } from "./account-store";

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
