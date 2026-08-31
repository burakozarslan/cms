import type { NextRequest } from "next/server";

import { resolveApiKey, touchLastUsed } from "@/lib/api-keys/resolve";
import type { ApiKeyMode } from "@/lib/api-keys/token";

import { apiError } from "./errors";

export type ApiKeyContext<TParams> = {
  tenantId: string;
  projectId: string;
  mode: ApiKeyMode;
  params: TParams;
};

type RouteContext<TParams> = { params: Promise<TParams> };

/**
 * Static, hardcoded — no counting logic exists yet. Present on every
 * `/api/v1/**` response so Phase 2 wiring real limits behind them is a value
 * change, not a new header a client has to learn to expect (design.md,
 * Resolved Questions).
 */
const RATE_LIMIT_HEADERS: Record<string, string> = {
  "X-RateLimit-Limit": "1000",
  "X-RateLimit-Remaining": "1000",
};

function withRateLimitHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(RATE_LIMIT_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function extractToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  if (bearerMatch) return bearerMatch[1];

  return request.headers.get("x-api-key") ?? undefined;
}

/**
 * Wraps a content-API route handler with authentication.
 *
 * Not Next middleware: `src/proxy.ts` runs on the edge runtime, where
 * `better-sqlite3` cannot load (design.md, Context). Key validation is a
 * database read and must run in the Node runtime, so it happens here, inside
 * the route handler, instead.
 *
 * Resolves the token to `{ tenantId, projectId, mode }` and hands those to
 * the handler — the *only* source of scope for a content request. Nothing
 * about a request other than its key ever determines what it can reach.
 */
export function withApiKey<TParams>(
  handler: (
    request: NextRequest,
    context: ApiKeyContext<TParams>,
  ) => Promise<Response>,
) {
  return async (
    request: NextRequest,
    routeContext: RouteContext<TParams>,
  ): Promise<Response> => {
    const token = extractToken(request);
    if (!token) {
      return withRateLimitHeaders(
        apiError("UNAUTHORIZED", "Missing API key.", 401),
      );
    }

    const resolved = await resolveApiKey(token);
    if (!resolved) {
      return withRateLimitHeaders(
        apiError("UNAUTHORIZED", "Invalid, revoked, or expired API key.", 401),
      );
    }

    const params = await routeContext.params;

    try {
      const response = await handler(request, {
        tenantId: resolved.tenantId,
        projectId: resolved.projectId,
        mode: resolved.mode,
        params,
      });

      // Issued after the response is produced (design decision 13) — never
      // blocks or fails the response; failures are already swallowed inside
      // touchLastUsed itself.
      await touchLastUsed(resolved.keyId);

      return withRateLimitHeaders(response);
    } catch (error) {
      // The real error is for server logs only — nothing about it (message,
      // stack, database detail) may reach the response body.
      console.error("Content API handler error:", error);
      return withRateLimitHeaders(
        apiError("INTERNAL", "An unexpected error occurred.", 500),
      );
    }
  };
}
