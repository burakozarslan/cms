import {
  AliasNode,
  BinaryOperationNode,
  ColumnNode,
  DeleteQueryNode,
  IdentifierNode,
  InsertQueryNode,
  JoinNode,
  OnNode,
  OperationNodeTransformer,
  OperatorNode,
  PrimitiveValueListNode,
  ReferenceNode,
  SelectQueryNode,
  TableNode,
  UpdateQueryNode,
  ValueListNode,
  ValueNode,
  ValuesNode,
  WhereNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValuesItemNode,
} from "kysely";

import { TENANT_COLUMN, isTenantScopedTable } from "./tables";

/**
 * Resolve the table name a `from` / `into` / join entry refers to, plus the
 * name it must be referenced by in SQL (its alias when aliased).
 */
function resolveTable(
  node: OperationNode,
): { table: string; referenceAs: string } | undefined {
  if (TableNode.is(node)) {
    const name = node.table.identifier.name;
    return { table: name, referenceAs: name };
  }

  if (AliasNode.is(node) && TableNode.is(node.node)) {
    const name = node.node.table.identifier.name;
    const alias = IdentifierNode.is(node.alias)
      ? node.alias.name
      : undefined;
    return { table: name, referenceAs: alias ?? name };
  }

  return undefined;
}

/**
 * `<referenceAs>.tenant_id = <tenantId>` as a parameterized predicate.
 */
function tenantPredicate(referenceAs: string, tenantId: string): OperationNode {
  return BinaryOperationNode.create(
    ReferenceNode.create(
      ColumnNode.create(TENANT_COLUMN),
      TableNode.create(referenceAs),
    ),
    OperatorNode.create("="),
    ValueNode.create(tenantId),
  );
}

function andWhere(
  where: WhereNode | undefined,
  predicate: OperationNode,
): WhereNode {
  return where
    ? WhereNode.cloneWithOperation(where, "And", predicate)
    : WhereNode.create(predicate);
}

/**
 * Kysely plugin that binds every query to a single tenant.
 *
 * For tables in `TENANT_SCOPED_TABLES` it:
 *   - appends `tenant_id = ?` to select / update / delete,
 *   - appends `tenant_id = ?` to the ON clause of joins (correct for outer
 *     joins too, where a WHERE predicate would silently drop rows),
 *   - injects `tenant_id` into inserts, overriding any caller-supplied value.
 *
 * Subqueries are covered because OperationNodeTransformer recurses.
 */
export class TenantScopePlugin
  extends OperationNodeTransformer
  implements KyselyPlugin
{
  readonly #tenantId: string;

  constructor(tenantId: string) {
    super();

    if (!tenantId) {
      throw new Error(
        "TenantScopePlugin requires a tenantId. Derive it from the session, never from client input.",
      );
    }

    this.#tenantId = tenantId;
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.transformNode(args.node);
  }

  async transformResult(
    args: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }

  #scopeJoins(
    joins: ReadonlyArray<JoinNode> | undefined,
  ): ReadonlyArray<JoinNode> | undefined {
    if (!joins) return joins;

    return joins.map((join) => {
      const resolved = resolveTable(join.table);
      if (!resolved || !isTenantScopedTable(resolved.table)) return join;

      const predicate = tenantPredicate(resolved.referenceAs, this.#tenantId);
      return join.on
        ? JoinNode.cloneWithOn(join, predicate)
        : { ...join, on: OnNode.create(predicate) };
    });
  }

  #scopedFroms(froms: ReadonlyArray<OperationNode>): OperationNode[] {
    return froms
      .map(resolveTable)
      .filter(
        (resolved): resolved is { table: string; referenceAs: string } =>
          resolved !== undefined && isTenantScopedTable(resolved.table),
      )
      .map((resolved) => tenantPredicate(resolved.referenceAs, this.#tenantId));
  }

  protected transformSelectQuery(node: SelectQueryNode): SelectQueryNode {
    const transformed = super.transformSelectQuery(node);

    let where = transformed.where;
    for (const predicate of this.#scopedFroms(transformed.from?.froms ?? [])) {
      where = andWhere(where, predicate);
    }

    return {
      ...transformed,
      where,
      joins: this.#scopeJoins(transformed.joins),
    };
  }

  protected transformDeleteQuery(node: DeleteQueryNode): DeleteQueryNode {
    const transformed = super.transformDeleteQuery(node);

    let where = transformed.where;
    for (const predicate of this.#scopedFroms(transformed.from?.froms ?? [])) {
      where = andWhere(where, predicate);
    }

    return {
      ...transformed,
      where,
      joins: this.#scopeJoins(transformed.joins),
    };
  }

  protected transformUpdateQuery(node: UpdateQueryNode): UpdateQueryNode {
    const transformed = super.transformUpdateQuery(node);

    let where = transformed.where;

    if (transformed.table) {
      for (const predicate of this.#scopedFroms([transformed.table])) {
        where = andWhere(where, predicate);
      }
    }
    for (const predicate of this.#scopedFroms(transformed.from?.froms ?? [])) {
      where = andWhere(where, predicate);
    }

    return {
      ...transformed,
      where,
      joins: this.#scopeJoins(transformed.joins),
    };
  }

  protected transformInsertQuery(node: InsertQueryNode): InsertQueryNode {
    const transformed = super.transformInsertQuery(node);

    const resolved = transformed.into ? resolveTable(transformed.into) : undefined;
    if (!resolved || !isTenantScopedTable(resolved.table)) return transformed;

    if (!transformed.values || !ValuesNode.is(transformed.values)) {
      // `insert into ... select ...`, `defaultValues`, or a raw values source.
      // Injecting a column without a matching value would corrupt the query, so
      // refuse rather than emit an unscoped insert.
      throw new Error(
        `Cannot tenant-scope this insert into "${resolved.table}". Use an explicit values() insert so tenant_id can be injected.`,
      );
    }

    const columns = transformed.columns ?? [];
    const existingIndex = columns.findIndex(
      (column) => column.column.name === TENANT_COLUMN,
    );

    const setPrimitive = (values: ReadonlyArray<unknown>): unknown[] => {
      const next = [...values];
      if (existingIndex >= 0) next[existingIndex] = this.#tenantId;
      else next.push(this.#tenantId);
      return next;
    };

    const setNodes = (
      values: ReadonlyArray<OperationNode>,
    ): OperationNode[] => {
      const next = [...values];
      const valueNode = ValueNode.create(this.#tenantId);
      if (existingIndex >= 0) next[existingIndex] = valueNode;
      else next.push(valueNode);
      return next;
    };

    const values: ValuesItemNode[] = transformed.values.values.map((row) =>
      PrimitiveValueListNode.is(row)
        ? PrimitiveValueListNode.create(setPrimitive(row.values))
        : ValueListNode.create(setNodes(row.values)),
    );

    return InsertQueryNode.cloneWith(transformed, {
      columns:
        existingIndex >= 0
          ? columns
          : [...columns, ColumnNode.create(TENANT_COLUMN)],
      values: ValuesNode.create(values),
    });
  }
}
