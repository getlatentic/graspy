import { describe, expect, it } from "vitest";
import { firebaseConfigOf } from "./env";

const FULL = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "graspy-f482e.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "graspy-f482e",
  VITE_FIREBASE_APP_ID: "1:110976513007:web:6b96ca5d09244f683abc1a",
};

describe("firebaseConfigOf", () => {
  it("offers sign-in when every value is set", () => {
    expect(firebaseConfigOf(FULL)).toEqual({
      apiKey: "key",
      authDomain: "graspy-f482e.firebaseapp.com",
      projectId: "graspy-f482e",
      appId: "1:110976513007:web:6b96ca5d09244f683abc1a",
    });
  });

  it.each(Object.keys(FULL))("hides sign-in without %s", (missing) => {
    expect(firebaseConfigOf({ ...FULL, [missing]: " " })).toBeNull();
    expect(firebaseConfigOf({ ...FULL, [missing]: undefined })).toBeNull();
  });
});
