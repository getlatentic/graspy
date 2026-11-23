import { readJson } from "@/lib/api/body";
import { ApiError, toApiError, toNetworkError } from "@/lib/api/errors";
import { API_BASE_URL } from "@/lib/env";
import { call } from "./account-call";

// Signing a TV in from a phone (app/api/tv_sign_in_routes.py, docs/TV_SIGN_IN.md). The TV's
// calls carry no session: the device code is what it holds. The phone's carry its account's.

const TV_SIGN_IN_URL = `${API_BASE_URL}/tv-sign-in`;

export interface TvLinkRequest {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** The link the QR code holds: the address and the code. */
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface TvApproval {
  token: string;
  expiresIn: number;
  /** Renews the session; the TV keeps it until signed out. */
  refreshToken: string;
  account: string;
  learner: { id: string; name: string };
}

export type TvPoll =
  | {
      status: "pending" | "slow_down" | "expired" | "denied";
      interval?: number;
    }
  | ({ status: "approved" } & TvApproval);

async function post<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${TV_SIGN_IN_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw toNetworkError(cause);
  }
  if (!response.ok) throw await toApiError(response);
  const answered = await readJson<T | null>(response);
  if (answered === null) throw new ApiError("Empty answer", response.status);
  return answered;
}

export function startTvLink(signal?: AbortSignal): Promise<TvLinkRequest> {
  return post("", undefined, signal);
}

export function pollTvLink(
  deviceCode: string,
  signal?: AbortSignal,
): Promise<TvPoll> {
  return post("/token", { deviceCode }, signal);
}

/** The TV signing itself out: its credential is the proof. */
export async function signOutTv(refreshToken: string): Promise<void> {
  await fetch(`${TV_SIGN_IN_URL}/sign-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}

/** What the phone shows before the person approves. */
export interface TvAsked {
  label: string;
  /** Two letters, or null when the server could not tell. */
  country: string | null;
  createdAt: number;
  expiresAt: number;
}

export function lookUpTv(userCode: string): Promise<TvAsked> {
  return call(`${TV_SIGN_IN_URL}/lookup`, "POST", { userCode });
}

export function approveTv(userCode: string, learnerId: string): Promise<void> {
  return call(`${TV_SIGN_IN_URL}/approve`, "POST", { userCode, learnerId });
}

export function denyTv(userCode: string): Promise<void> {
  return call(`${TV_SIGN_IN_URL}/deny`, "POST", { userCode });
}

export interface TvDevice {
  id: string;
  label: string;
  learner: { id: string; name: string } | null;
  createdAt: number;
  lastUsedAt: number;
}

export async function listTvs(): Promise<TvDevice[]> {
  return (
    await call<{ devices: TvDevice[] }>(`${TV_SIGN_IN_URL}/devices`, "GET")
  ).devices;
}

export function removeTv(id: string): Promise<void> {
  return call(`${TV_SIGN_IN_URL}/devices/${id}`, "DELETE");
}
