import { readJson } from "@/lib/api/body";
import { ApiError, toApiError, toNetworkError } from "@/lib/api/errors";
import { fetchAsParent } from "@/lib/api/session";
import { API_BASE_URL } from "@/lib/env";
import { call } from "./account-call";

// Signing a TV in from a phone (app/api/tv_sign_in_routes.py, docs/TV_SIGN_IN.md). The TV's
// calls carry no session: the device code is what it holds. The phone's are the parent's: a
// session made from a Google sign-in just now.

const TV_SIGN_IN_URL = `${API_BASE_URL}/tv-sign-in`;

// Signing out must not wait on a server that does not answer.
const SIGN_OUT_MS = 5_000;

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
  /** Renews the session, and is replaced by the one each renewal returns. */
  refreshToken: string;
  account: string;
  learner: { id: string; name: string };
}

/** Who approved, for the person at the TV to recognise or not: the account's address with most
 * of it hidden, and the phone's label and country. */
export interface TvApprover {
  account?: string;
  label?: string;
  country?: string;
}

export type TvPoll =
  | {
      status: "pending" | "slow_down" | "expired" | "denied" | "full";
      interval?: number;
    }
  /** The phone approved: the person at the TV is to confirm whom it is linked to. */
  | {
      status: "linking";
      interval?: number;
      learner: { id: string; name: string };
      approver?: TvApprover;
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

/** The person at the TV confirms the learner: the TV is given its session, once. */
export function continueTvLink(
  deviceCode: string,
  signal?: AbortSignal,
): Promise<TvPoll> {
  return post("/continue", { deviceCode }, signal);
}

/** The TV gives up its request, or the person there declines it. */
export async function cancelTvLink(deviceCode: string): Promise<void> {
  await post("/cancel", { deviceCode }).catch(() => undefined);
}

/** The TV signing itself out: its credential is the proof. Gives up after a few seconds. */
export async function signOutTv(refreshToken: string): Promise<void> {
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), SIGN_OUT_MS);
  try {
    await fetch(`${TV_SIGN_IN_URL}/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      signal: giveUp.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** What the phone shows before the person approves. */
export interface TvAsked {
  label: string;
  /** Two letters, or null when the server could not tell. */
  country: string | null;
  createdAt: number;
  expiresAt: number;
}

// What the phone does is the parent's: the server refuses a learner's session these routes.
const asParent = <T>(path: string, method: string, body?: unknown) =>
  call<T>(`${TV_SIGN_IN_URL}${path}`, method, body, fetchAsParent);

/** Holds the request for this account for two minutes. */
export function lookUpTv(userCode: string): Promise<TvAsked> {
  return asParent("/lookup", "POST", { userCode });
}

/** `confirm` is the last four characters of the code as the TV shows them. */
export function approveTv(
  userCode: string,
  learnerId: string,
  confirm: string,
): Promise<void> {
  return asParent("/approve", "POST", { userCode, learnerId, confirm });
}

export function denyTv(userCode: string): Promise<void> {
  return asParent("/deny", "POST", { userCode });
}

export interface TvDevice {
  id: string;
  label: string;
  learner: { id: string; name: string } | null;
  createdAt: number;
  lastUsedAt: number;
}

export async function listTvs(): Promise<TvDevice[]> {
  return (await asParent<{ devices: TvDevice[] }>("/devices", "GET")).devices;
}

export function removeTv(id: string): Promise<void> {
  return asParent(`/devices/${id}`, "DELETE");
}
