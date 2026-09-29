import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { I18nContext } from "@/lib/i18n-context";

// Each message is its key, followed by the values it was given, so a test reads which
// message a page chose and what it filled in.
const KEYS = {
  locale: "en",
  setLocale: () => undefined,
  t: (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
};

function Elsewhere() {
  return <p data-testid="elsewhere">{useLocation().pathname}</p>;
}

/** What a page of the account sits in: the interface's messages, and a router in which any
 * other path shows where it is (`elsewhere`). */
export function KeysApp({
  at = "/",
  path = "/",
  children,
}: {
  at?: string;
  path?: string;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={KEYS}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path={path} element={children} />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </MemoryRouter>
    </I18nContext.Provider>
  );
}
