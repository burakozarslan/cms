import { execute, parse, specifiedRules, validate, type GraphQLError } from "graphql";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { depthLimitRule, formatGraphQLError } from "@/lib/api/graphql/errors";
import { createRequestContext } from "@/lib/api/graphql/reference-loader";
import { getProjectSchema } from "@/lib/api/graphql/schema-builder";
import { withApiKey } from "@/lib/api/with-api-key";

export const runtime = "nodejs";

type Params = Record<string, never>;

type GraphQLRequestBody = {
  query?: unknown;
  variables?: unknown;
  operationName?: unknown;
};

/**
 * `POST /api/v1/graphql` — the GraphQL counterpart of the REST Content
 * Delivery API, reusing the same `withApiKey` authentication/scoping and
 * the standard GraphQL-over-HTTP request contract (`{ query, variables,
 * operationName }` in, `{ data, errors }` out).
 *
 * Query, validate, and execute are run manually rather than through the
 * `graphql()` convenience function so a custom depth-limit validation rule
 * can be injected alongside `specifiedRules` (`4.3`).
 */
export const POST = withApiKey<Params>(
  async (request: NextRequest, { tenantId, projectId }) => {
    let body: GraphQLRequestBody;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_QUERY", "Request body must be valid JSON.", 400);
    }

    if (typeof body?.query !== "string") {
      return apiError("INVALID_QUERY", 'Request body must include a "query" string.', 400);
    }

    const variables =
      body.variables !== null && typeof body.variables === "object"
        ? (body.variables as Record<string, unknown>)
        : undefined;
    const operationName = typeof body.operationName === "string" ? body.operationName : undefined;

    let document;
    try {
      document = parse(body.query);
    } catch (error) {
      return NextResponse.json({
        data: null,
        errors: [formatGraphQLError(error as GraphQLError)],
      });
    }

    const schema = await getProjectSchema(tenantId, projectId);

    const validationErrors = validate(schema, document, [...specifiedRules, depthLimitRule]);
    if (validationErrors.length > 0) {
      return NextResponse.json({
        data: null,
        errors: validationErrors.map(formatGraphQLError),
      });
    }

    const contextValue = createRequestContext(tenantId, projectId);

    const result = await execute({
      schema,
      document,
      variableValues: variables,
      operationName,
      contextValue,
    });

    return NextResponse.json({
      data: result.data ?? null,
      ...(result.errors ? { errors: result.errors.map(formatGraphQLError) } : {}),
    });
  },
);
