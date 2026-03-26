/**
 * LLM Provider Interface
 * ----------------------
 * The pipeline depends only on this interface, never on concrete providers.
 * Concrete providers implement extractIR and repairIR.
 *
 * The LLM does exactly three things (from the spec):
 *   1. identify the contract type
 *   2. fill fields from the chosen schema
 *   3. flag uncertainty where information is missing
 */

import type { IR, IRFields } from "../ir/types.js";
import type { ContractSchema } from "../registry/contractTypes.js";

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface LLMProvider {
  /** Provider identifier (e.g. "anthropic", "groq", "mock") */
  readonly name: string;

  /**
   * Given raw contract text and a schema, extract an IR.
   * The LLM must not invent fields outside the schema.
   */
  extractIR(input: string, schema: ContractSchema): Promise<IRFields>;

  /**
   * Given an IR that failed validation, repair only the offending fields.
   * Must return the full fields map with corrections applied.
   */
  repairIR(
    input: string,
    errors: ValidationError[],
    currentIR: IR
  ): Promise<IRFields>;

  /**
   * Identify the contract type from raw text.
   * Returns one of the keys in CONTRACT_REGISTRY, or null if uncertain.
   */
  identifyContractType(input: string, knownTypes: string[]): Promise<string | null>;
}
