/// <reference types="vite/client" />

// No defaults: a bundle that lost its .env.<mode> must not ship pointing at a developer's machine.
interface Env {
  readonly VITE_API_URL: string;
  readonly VITE_A2A_BASE: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR?: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const env = import.meta.env as unknown as Env;

export const API_BASE_URL = env.VITE_API_URL;

export const A2A_BASE_URL = env.VITE_A2A_BASE;

/** Sign-in is offered only when every value is set. */
export function firebaseConfigOf(values: Partial<Env>): FirebaseConfig | null {
  const config = {
    apiKey: values.VITE_FIREBASE_API_KEY?.trim() ?? "",
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? "",
    projectId: values.VITE_FIREBASE_PROJECT_ID?.trim() ?? "",
    appId: values.VITE_FIREBASE_APP_ID?.trim() ?? "",
  };
  return Object.values(config).every(Boolean) ? config : null;
}

export const FIREBASE_CONFIG = firebaseConfigOf(env);

/** Firebase's Auth emulator, which development and the end-to-end tests sign in with.
 * A production build never uses it: the emulator vouches for any sign-in. */
export function authEmulatorOf(
  address: string | undefined,
  production: boolean,
): string | null {
  return production ? null : address?.trim() || null;
}

export const FIREBASE_AUTH_EMULATOR = authEmulatorOf(
  env.VITE_FIREBASE_AUTH_EMULATOR,
  import.meta.env.PROD,
);
