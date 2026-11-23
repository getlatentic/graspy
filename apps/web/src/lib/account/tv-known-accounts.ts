// The accounts this TV has been linked to, as the phone's approval named them (an address with
// most of it hidden). A TV shown a name it does not know asks for more care before it links.

export const TV_KNOWN_ACCOUNTS_KEY = "graspy.tv-known-accounts";
const LIMIT = 10;

function read(): string[] {
  try {
    const kept = JSON.parse(
      window.localStorage.getItem(TV_KNOWN_ACCOUNTS_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(kept)
      ? kept.filter((one): one is string => typeof one === "string")
      : [];
  } catch {
    return [];
  }
}

export const knownAccount = (hint: string): boolean => read().includes(hint);

export function rememberAccount(hint: string): void {
  try {
    const kept = [hint, ...read().filter((one) => one !== hint)].slice(
      0,
      LIMIT,
    );
    window.localStorage.setItem(TV_KNOWN_ACCOUNTS_KEY, JSON.stringify(kept));
  } catch {
    // Storage refused: the next link is asked about again.
  }
}
