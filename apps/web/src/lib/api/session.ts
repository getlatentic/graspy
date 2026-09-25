import { deviceId, fingerprint } from "@/lib/device-id";
import { API_BASE_URL } from "@/lib/env";
import { ApiError, toApiError, toNetworkError } from "./errors";

// An anonymous token naming this device: nobody signs in.

interface Session {
  token: string;
  expiresAt: number;
  // Absent from tokens stored before tokens named a device: those re-mint.
  device?: string;
}

const STORAGE_KEY = "graspy.session";

// So a token cannot lapse during a minutes-long stream.
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let cached: Session | null = readStored();
let pending: Promise<string> | null = null;

function readStored(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStored(session: Session | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage denied: the in-memory copy still serves the tab.
  }
}

function usable(session: Session | null): session is Session {
  return !!session?.device && session.expiresAt - RENEW_MARGIN_MS > Date.now();
}

async function mint(): Promise<string> {
  const device = deviceId();
  const hint = await fingerprint();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: device,
        ...(hint ? { fingerprint: hint } : {}),
      }),
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }

  if (!response.ok) throw await toApiError(response);

  const { token, expiresIn } = (await response.json()) as {
    token: string;
    expiresIn: number;
  };

  if (!token) throw new ApiError("The server issued an empty session", 0);

  cached = { token, expiresAt: Date.now() + expiresIn * 1000, device };
  writeStored(cached);
  return token;
}

// A cold load fires several requests at once; they share one handshake.
export function getSessionToken(): Promise<string> {
  if (usable(cached)) return Promise.resolve(cached.token);

  pending ??= mint().finally(() => {
    pending = null;
  });
  return pending;
}

export async function refreshSessionToken(): Promise<string> {
  cached = null;
  writeStored(null);
  return getSessionToken();
}

export async function fetchWithSession(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  // A Headers instance spreads to nothing.
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const response = await send(await getSessionToken());
  if (response.status !== 401) return response;
  return send(await refreshSessionToken());
}
