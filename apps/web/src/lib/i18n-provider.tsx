import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nContext } from "./i18n-context";
import {
  getUserProfile,
  onProfileSaved,
  saveUserProfile,
} from "./user-storage";

type Messages = Record<string, unknown>;
type Loaded = { locale: string; messages: Messages };

const RTL_LANGUAGES = ["ar", "he", "fa", "ur", "ps", "ku"];
// Read before React mounts by the pre-paint script in index.html.
const LOCALE_COOKIE = "graspy_locale";
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

function setLocaleCookie(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`;
}

function getLocaleCookie(): string | null {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`));
  return cookie ? cookie.split("=")[1] : null;
}

// Must match the pre-paint script in index.html, which sets lang/dir before
// React mounts. If they disagree the page keeps RTL while rendering English.
function initialLocale(): string {
  const browserLocale = (navigator.language || "en")
    .split("-")[0]
    .toLowerCase();
  return getLocaleCookie() || getUserProfile()?.language || browserLocale;
}

/** Falls back to English when the app has no translation for the locale. */
async function loadMessages(locale: string): Promise<Loaded> {
  try {
    const messages = await import(`@/locales/${locale}.json`);
    return { locale, messages: messages.default };
  } catch {
    const english = await import(`@/locales/en.json`);
    return { locale: "en", messages: english.default };
  }
}

/** The key itself when there is no message for it. */
function translate(
  messages: Messages,
  key: string,
  values?: Record<string, string | number>,
): string {
  const found = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Messages)[part] : undefined,
      messages,
    );
  if (typeof found !== "string") return key;
  if (!values) return found;
  return found.replace(
    /\{(\w+)\}/g,
    (match, name: string) => values[name]?.toString() || match,
  );
}

function applyDocumentLocale(locale: string): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = RTL_LANGUAGES.includes(locale) ? "rtl" : "ltr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback(async (locale: string) => {
    const next = await loadMessages(locale);
    setLoaded((shown) =>
      shown?.locale === next.locale && shown.messages === next.messages
        ? shown
        : next,
    );
    applyDocumentLocale(next.locale);
    return next.locale;
  }, []);

  useEffect(() => {
    void load(initialLocale());
  }, [load]);

  const followed = useRef(getUserProfile()?.language);

  const setLocale = useCallback(
    async (locale: string) => {
      followed.current = locale;
      const shown = await load(locale);
      // The cookie keeps the interface language shown; the profile keeps the
      // language learned in, which may have no translation.
      setLocaleCookie(shown);
      saveUserProfile({ language: locale });
    },
    [load],
  );

  // The interface follows the learner's language wherever it changes: on the
  // details page, or with a plan from their account.
  useEffect(
    () =>
      onProfileSaved(() => {
        const language = getUserProfile()?.language;
        if (language && language !== followed.current) void setLocale(language);
      }),
    [setLocale],
  );

  const value = useMemo(
    () => ({
      locale: loaded?.locale ?? "en",
      setLocale,
      t: (key: string, values?: Record<string, string | number>) =>
        translate(loaded?.messages ?? {}, key, values),
    }),
    [loaded, setLocale],
  );

  return (
    <I18nContext.Provider value={value}>
      {loaded ? children : null}
    </I18nContext.Provider>
  );
}
