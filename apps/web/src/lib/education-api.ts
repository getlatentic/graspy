import { API_BASE_URL } from "@/lib/env";
import { toApiError, toNetworkError } from "@/lib/api/errors";

/** English, plus local names keyed by language tag. */
export interface Names {
  en: string;
  local?: Record<string, string>;
}

interface SchoolStage {
  id: string;
  name: Names;
}

export interface SchoolLevel {
  id: string;
  stage: string;
  /** Counted from the first year of primary. */
  year: number;
  name: Names;
  aliases: string[];
  age: number;
  /** The server's rule: its children learn by voice alone, with no slide subjects. */
  voiceOnly?: boolean;
}

export interface SchoolSystem {
  id: string;
  country: string;
  name: Names;
  main: boolean;
  stages: SchoolStage[];
  levels: SchoolLevel[];
}

export const nameIn = (names: Names, language: string): string =>
  names.local?.[language] ?? names.en;

/** The country's school systems as the web app serves them itself, or null when they are not there. */
async function servedHere(country: string): Promise<SchoolSystem[] | null> {
  try {
    const response = await fetch(`/education/countries/${encodeURIComponent(country)}.json`);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("json")) return null;
    const systems: unknown = await response.json();
    return Array.isArray(systems) ? (systems as SchoolSystem[]) : null;
  } catch {
    return null;
  }
}

async function fromApi(country: string): Promise<SchoolSystem[]> {
  const url = `${API_BASE_URL}/education/countries/${encodeURIComponent(country)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw toNetworkError(cause);
  }
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as SchoolSystem[];
}

/**
 * The main system first. The classes are the same for everyone, so the app reads them from its own host, where
 * nothing waits for the API to wake up; the API answers when the file is not there.
 */
export async function schoolSystems(country: string): Promise<SchoolSystem[]> {
  return (await servedHere(country)) ?? fromApi(country);
}
