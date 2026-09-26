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

/** The main system first. */
export async function schoolSystems(country: string): Promise<SchoolSystem[]> {
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
