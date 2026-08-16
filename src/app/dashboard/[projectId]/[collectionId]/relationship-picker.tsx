"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge, Input } from "@frontend/ui";
import { valueInputName } from "@/lib/widgets";

type Option = { id: string; label: string };

/** `undefined`/never-loaded is "loading"; `null` is "target collection gone". */
type Options = Option[] | null | undefined;

function normalize(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

/**
 * The value input for a `relationship` field.
 *
 * Loads the target collection's entries once on mount and filters them
 * client-side as the tenant types — no search endpoint, no debounce (design
 * decision 6). A selected id that isn't among the loaded options (the entry
 * was deleted, or the target collection no longer exists) still renders and
 * is still removable, just visibly marked as unresolvable rather than
 * silently dropped (design decision 3).
 */
export function RelationshipPicker({
  fieldId,
  label,
  targetCollectionId,
  multiple,
  value,
  error,
}: {
  fieldId: string;
  label: string;
  targetCollectionId: string;
  multiple: boolean;
  value: unknown;
  error?: string;
}) {
  const [options, setOptions] = useState<Options>(undefined);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() => normalize(value));

  useEffect(() => {
    let cancelled = false;

    // Imported dynamically, not statically: "./actions" is a "use server"
    // module pulling in server-only dependencies (session resolution,
    // `next/cache`) that a plain module graph walk — which is all Jest does
    // with a client component under test — would otherwise load eagerly
    // just because `value-input.tsx` imports this file, whether or not a
    // `relationship` field is ever rendered.
    import("./actions").then(({ listRelationshipOptionsAction }) =>
      listRelationshipOptionsAction(targetCollectionId).then((result) => {
        if (!cancelled) setOptions(result);
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [targetCollectionId]);

  const loading = options === undefined;
  const unresolvable = options === null;

  const labelFor = (id: string): string =>
    options?.find((option) => option.id === id)?.label ?? "Unresolvable reference";

  const filtered = useMemo(() => {
    if (!options) return [];
    const needle = query.trim().toLowerCase();
    return options
      .filter((option) => !selected.includes(option.id))
      .filter(
        (option) => needle === "" || option.label.toLowerCase().includes(needle),
      );
  }, [options, query, selected]);

  function pick(id: string) {
    setSelected((current) => (multiple ? [...current, id] : [id]));
    setQuery("");
  }

  function remove(id: string) {
    setSelected((current) => current.filter((existing) => existing !== id));
  }

  const name = valueInputName(fieldId);
  const canPickMore = multiple || selected.length === 0;

  return (
    <div className="flex w-full flex-col gap-2">
      <span className="label-text">{label}</span>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const known = options?.some((option) => option.id === id) ?? false;
            return (
              <li key={id}>
                <Badge tone={known ? "neutral" : "error"} className="gap-1.5">
                  {labelFor(id)}
                  <button
                    type="button"
                    aria-label={`Remove ${labelFor(id)}`}
                    onClick={() => remove(id)}
                  >
                    ×
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canPickMore && !unresolvable ? (
        <div className="relative">
          <Input
            type="text"
            placeholder={loading ? "Loading…" : "Search entries…"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={loading}
          />
          {!loading && query !== "" ? (
            <ul className="bg-base-100 border-base-content/10 absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border shadow-lg">
              {filtered.length === 0 ? (
                <li className="text-base-content/60 px-3 py-2 text-sm">
                  No matches
                </li>
              ) : (
                filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => pick(option.id)}
                      className="hover:bg-base-200 block w-full px-3 py-2 text-left text-sm"
                    >
                      {option.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      {unresolvable ? (
        <p className="text-error text-xs">
          This field&rsquo;s target collection no longer exists. Existing
          references are shown but nothing new can be picked.
        </p>
      ) : null}

      {error ? <span className="helper-text text-error">{error}</span> : null}

      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
