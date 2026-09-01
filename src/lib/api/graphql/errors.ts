import { GraphQLError, type ASTVisitor, type ValidationContext } from "graphql";

import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/errors";

/** Deep, narrow queries cost little; deep, wide ones can fan out into an
 *  unbounded number of relationship batches. A flat depth cap is a cheap
 *  guard against both without needing per-field cost weights. */
const MAX_QUERY_DEPTH = 10;

/**
 * A `graphql-js` validation rule rejecting a query whose field-selection
 * nesting exceeds `MAX_QUERY_DEPTH`, so an adversarial or accidentally
 * pathological query is refused before any resolver — and therefore any
 * database query — runs.
 */
export function depthLimitRule(context: ValidationContext): ASTVisitor {
  let depth = 0;

  return {
    Field: {
      enter() {
        depth += 1;
        if (depth > MAX_QUERY_DEPTH) {
          context.reportError(
            new GraphQLError(
              `Query exceeds the maximum allowed depth of ${MAX_QUERY_DEPTH}.`,
              { extensions: { code: "INVALID_QUERY" } },
            ),
          );
        }
      },
      leave() {
        depth -= 1;
      },
    },
  };
}

function isKnownCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Formats one execution result error for the response body.
 *
 * A `GraphQLError` a resolver or validation rule raised deliberately (with
 * `extensions.code` already one of `API_ERROR_CODES`) is passed through
 * as-is — its message was authored to be shown. Anything else — a parse or
 * validation failure with no field `path`, or an unexpected exception a
 * resolver threw — is logged for diagnostics and replaced with a fixed,
 * generic message, exactly like `apiError` does for REST (never a database
 * error, stack trace, or internal identifier in the response body).
 */
export function formatGraphQLError(error: GraphQLError): {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions: { code: ApiErrorCode };
} {
  const code = error.extensions?.code;
  if (isKnownCode(code)) {
    return { message: error.message, path: error.path, extensions: { code } };
  }

  if (error.path === undefined) {
    // Syntax or validation-time failure (malformed document, an operation
    // type the schema doesn't define — e.g. a mutation — an undefined
    // field): rejected before any resolver ran.
    return {
      message: "The query could not be validated.",
      extensions: { code: "INVALID_QUERY" },
    };
  }

  console.error("GraphQL content API resolver error:", error.originalError ?? error);
  return {
    message: "An unexpected error occurred.",
    extensions: { code: "INTERNAL" },
  };
}
