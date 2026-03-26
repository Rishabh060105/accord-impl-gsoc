/**
 * Intermediate Representation (IR)
 * ---------------------------------
 * The IR is the single source of truth between:
 *   LLM extraction  →  validation  →  Concerto model generation  →  template generation
 *
 * The LLM must never invent new fields — it only fills or repairs
 * the schema coming from the contract-type registry.
 */

/** A single field value returned by the LLM */
export type IRFieldValue =
  | string
  | number
  | boolean
  | null               // Explicit null = LLM acknowledges field exists but could not extract
  | IRFieldValue[];    // Array (future: multi-value fields)

/**
 * Ambiguity marker returned by the LLM when a field value is uncertain.
 * The LLM sets `value` to its best guess and explains in `reason`.
 */
export interface IRAmbigu {
  __ambiguous: true;
  value: IRFieldValue;
  reason: string;
}

/** Union of possible values inside an IR fields map */
export type IRValue = IRFieldValue | IRAmbigu;

/** The IR fields payload: keys come strictly from the schema */
export type IRFields = Record<string, IRValue>;

/**
 * Top-level IR object.
 * `contractType` is the entry point; the downstream pipeline uses it to
 * load the matching schema from CONTRACT_REGISTRY.
 */
export interface IR {
  contractType: string;
  /** Schema version for forward compatibility */
  schemaVersion: "1.0";
  /** Fields filled/repaired by the LLM */
  fields: IRFields;
  /** ISO timestamp of when this IR was produced */
  extractedAt: string;
  /** Which LLM provider produced this IR */
  providerUsed: string;
  /** How many repair passes have been applied (0 = initial extraction) */
  repairPass: number;
}

/** Convenience: check if an IRValue is an ambiguity marker */
export function isAmbiguous(v: IRValue): v is IRAmbigu {
  return typeof v === "object" && v !== null && "__ambiguous" in v;
}

/** Resolve an IRValue to its raw value (unwrap ambiguity markers) */
export function resolveValue(v: IRValue): IRFieldValue {
  if (isAmbiguous(v)) return v.value;
  return v as IRFieldValue;
}

/** Create a fresh IR skeleton for a given contract type */
export function createEmptyIR(contractType: string, provider: string): IR {
  return {
    contractType,
    schemaVersion: "1.0",
    fields: {},
    extractedAt: new Date().toISOString(),
    providerUsed: provider,
    repairPass: 0,
  };
}
