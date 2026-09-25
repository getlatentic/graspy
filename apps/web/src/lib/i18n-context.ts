import { createContext, useContext } from "react";

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

interface I18nContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: Translate;
}

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
