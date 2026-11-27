import type { Learner } from "@/lib/account/account-store";
import { API_BASE_URL } from "@/lib/env";
import { readJson } from "./body";
import {
  ApiError,
  SignInUnchecked,
  toApiError,
  toNetworkError,
} from "./errors";

export interface Issued {
  token: string;
  expiresIn: number;
  learner?: Learner | null;
}

export async function post(body: Record<string, string>): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
}

// graspy answers 503 sign_in_unchecked when it could not reach Google to check the sign-in.
async function notIssued(response: Response): Promise<ApiError> {
  const refused = await toApiError(response);
  const { detail } = (refused.data ?? {}) as {
    detail?: { error?: unknown; code?: unknown };
  };
  if (detail?.code !== "sign_in_unchecked") return refused;
  return new SignInUnchecked(
    String(detail.error),
    refused.status,
    refused.data,
  );
}

export async function issued(response: Response): Promise<Issued> {
  if (!response.ok) throw await notIssued(response);
  const body = await readJson<Issued | null>(response);
  if (!body?.token) {
    throw new ApiError("The server issued an empty session", response.status);
  }
  return {
    token: body.token,
    expiresIn: body.expiresIn,
    learner: body.learner,
  };
}
