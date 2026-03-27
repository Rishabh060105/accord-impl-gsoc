/**
 * Prompt Builder
 * --------------
 * Centralised prompt construction. All LLM providers call these helpers
 * so extraction and repair instructions are always consistent.
 */

import type { ContractSchema } from "../registry/contractTypes.js";
import type { IR } from "../ir/types.js";
import type { ValidationError } from "./interface.js";

/** Build the system prompt used for all contract-IR extractions */
export function buildSystemPrompt(): string {
  return `You are a contract analysis engine that extracts structured data from legal contract text.

RULES (non-negotiable):
1. You only populate fields defined in the provided JSON schema. Never invent new fields.
2. If a required field cannot be found in the text, set its value to null.
3. If you are uncertain about a value, mark it with this structure:
   { "__ambiguous": true, "value": <your best guess>, "reason": "<why uncertain>" }
4. All DateTime values must be ISO 8601 strings (e.g. "2025-06-01T00:00:00.000Z").
5. All numeric fields (Double, Integer) must be JSON numbers, not strings.
6. Enum fields must use one of the allowed values exactly as spelled.
7. Return ONLY a valid JSON object. No preamble, no markdown fences, no explanation.`;
}

/** Build the user prompt for initial IR extraction */
export function buildExtractionPrompt(
  input: string,
  schema: ContractSchema
): string {
  const fieldDescriptions = Object.entries(schema.fields)
    .map(([name, f]) => {
      const req = f.required ? "REQUIRED" : "optional";
      const enumClause = f.enum ? ` Allowed values: ${f.enum.join(", ")}.` : "";
      return `  "${name}" (${f.type}, ${req}): ${f.description}${enumClause}`;
    })
    .join("\n");

  return `CONTRACT TEXT:
"""
${input}
"""

Extract a JSON object with EXACTLY these fields:
${fieldDescriptions}

Return the JSON object now.`;
}

/** Build the user prompt for a repair pass */
export function buildRepairPrompt(
  input: string,
  errors: ValidationError[],
  currentIR: IR
): string {
  const errorList = errors
    .map((e) => `  - Field "${e.field}": [${e.code}] ${e.message}`)
    .join("\n");

  return `The following fields in the extracted IR failed validation:
${errorList}

Current IR (full):
${JSON.stringify(currentIR.fields, null, 2)}

CONTRACT TEXT (original):
"""
${input}
"""

REPAIR POLICY (strict):
1. Return a corrected JSON object containing ALL fields (not just the fixed ones).
2. Fix only the failing fields. Do not change fields that passed validation.
3. You may ONLY perform non-substantive repairs:
   - normalize enum casing and spelling when clearly implied by the text (e.g. "usd" -> "USD")
   - normalize date formatting into ISO 8601 when a date is explicitly present
   - trim whitespace and preserve existing values
4. You must NOT invent or guess missing business values.
   - Do NOT invent prices, fees, rates, quantities, dates, durations, payment terms, parties, governing law, or contract obligations.
   - If a required business field is absent in the original contract text, keep it null.
5. If the original text is contradictory, preserve the conflicting values and let validation fail rather than silently changing legal meaning.
6. Ambiguity markers may explain uncertainty, but must not inject new business content.

Examples of disallowed repairs:
- paymentAmount: null -> 1000
- paymentDueDays: null -> 30
- fixedFee: null -> 1
- governingLaw: null -> "State of Delaware"

Examples of allowed repairs:
- currency: "usd" -> "USD"
- deliveryDate: "March 1, 2026" -> "2026-03-01T00:00:00.000Z"
- client: "  Acme Corp  " -> "Acme Corp"

Return the corrected JSON object now.`;
}

/** Build the contract-type identification prompt */
export function buildIdentificationPrompt(
  input: string,
  knownTypes: string[]
): string {
  return `Identify the type of the following legal contract.
Choose exactly one from this list: ${knownTypes.join(", ")}
If none match, respond with: null

CONTRACT TEXT:
"""
${input}
"""

Respond with ONLY the contract type name (or null). No explanation.`;
}
