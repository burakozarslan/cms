import { NextResponse } from "next/server";

export const API_ERROR_CODES = [
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INVALID_QUERY",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * The standard error envelope: `{ error: { code, message } }`.
 *
 * `message` must always be a fixed, human-written string — never one derived
 * from a caught exception. That is what keeps a database error, stack trace,
 * or validator internal from ever reaching a response body (design.md,
 * "Errors are standardized and leak nothing").
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
