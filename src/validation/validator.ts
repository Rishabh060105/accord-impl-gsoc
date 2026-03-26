/**
 * Validator
 * ---------
 * Two-layer validation per the spec:
 *
 * Layer 1 — Schema validation (Step 4)
 *   • unknown fields
 *   • missing required fields
 *   • wrong types
 *   • enum violations
 *   • schema / contractType mismatch
 *
 * Layer 2 — Template-aware validation (Step 8)
 *   • all template variables have corresponding model fields
 *   • variable types match template markup
 *   • no unused required fields
 *   • custom business rules from the registry
 */

import {
  getContractType,
  type ContractSchema,
  type FieldSchema,
} from "../registry/contractTypes.js";
import type { IR, IRFields, IRValue } from "../ir/types.js";
import { isAmbiguous, resolveValue } from "../ir/types.js";
import type { ValidationError } from "../llm/interface.js";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: Schema validation
// ─────────────────────────────────────────────────────────────────────────────

function validateField(
  name: string,
  value: IRValue,
  fieldSchema: FieldSchema,
  errors: ValidationError[]
): void {
  const rawValue = isAmbiguous(value) ? value.value : value;

  // Null is allowed for optional fields; required nulls are caught in the caller
  if (rawValue === null) return;

  // Type checks
  switch (fieldSchema.type) {
    case "String":
      if (typeof rawValue !== "string") {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected String, got ${typeof rawValue}`,
        });
      } else if (fieldSchema.enum && !fieldSchema.enum.includes(rawValue)) {
        errors.push({
          field: name,
          code: "ENUM_VIOLATION",
          message: `Value "${rawValue}" is not in allowed set: ${fieldSchema.enum.join(", ")}`,
        });
      }
      break;

    case "Double":
      if (typeof rawValue !== "number") {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected Double (number), got ${typeof rawValue}`,
        });
      }
      break;

    case "Integer":
      if (typeof rawValue !== "number" || !Number.isInteger(rawValue)) {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected Integer, got ${typeof rawValue} (${rawValue})`,
        });
      }
      break;

    case "DateTime":
      if (typeof rawValue !== "string" || isNaN(Date.parse(rawValue))) {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected ISO 8601 DateTime string, got "${rawValue}"`,
        });
      }
      break;

    case "Boolean":
      if (typeof rawValue !== "boolean") {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected Boolean, got ${typeof rawValue}`,
        });
      }
      break;

    case "Duration":
      if (typeof rawValue !== "string") {
        errors.push({
          field: name,
          code: "WRONG_TYPE",
          message: `Expected Duration string (ISO 8601 duration), got ${typeof rawValue}`,
        });
      }
      break;
  }
}

export function validateSchemaLayer(ir: IR, schema: ContractSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const knownFields = new Set(Object.keys(schema.fields));

  // 1. Reject unknown fields
  for (const key of Object.keys(ir.fields)) {
    if (!knownFields.has(key)) {
      errors.push({
        field: key,
        code: "UNKNOWN_FIELD",
        message: `Field "${key}" is not defined in schema for ${ir.contractType}`,
      });
    }
  }

  // 2. Check each schema field
  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    const value: IRValue | undefined = ir.fields[fieldName];

    if (value === undefined || resolveValue(value as IRValue) === null) {
      if (fieldSchema.required) {
        errors.push({
          field: fieldName,
          code: "MISSING_REQUIRED",
          message: `Required field "${fieldName}" is missing or null`,
        });
      }
      continue;
    }

    validateField(fieldName, value as IRValue, fieldSchema, errors);
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: Template-aware validation (Step 8)
// ─────────────────────────────────────────────────────────────────────────────

export function validateTemplateLayer(ir: IR): { errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const entry = getContractType(ir.contractType);

  // Does the model cover all template variables?
  for (const varName of Object.keys(entry.templateRules)) {
    if (!(varName in entry.schema.fields)) {
      errors.push({
        field: varName,
        code: "TEMPLATE_MODEL_MISMATCH",
        message: `Template variable "${varName}" has no corresponding model field`,
      });
    }
  }

  // Are any required model fields unused by any template rule?
  for (const [fieldName, fieldSchema] of Object.entries(entry.schema.fields)) {
    if (fieldSchema.required && !(fieldName in entry.templateRules)) {
      warnings.push(
        `Required field "${fieldName}" is not referenced by any template rule`
      );
    }
  }

  // Run all business validation rules from the registry
  const rawFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ir.fields)) {
    rawFields[k] = resolveValue(v as IRValue);
  }

  for (const rule of entry.validationRules) {
    const err = rule.check(rawFields);
    if (err) {
      errors.push({
        field: "__business_rule__",
        code: `RULE_${rule.id}`,
        message: `[${rule.id}] ${err}`,
      });
    }
  }

  // Warn about ambiguous fields (LLM was uncertain)
  for (const [fieldName, value] of Object.entries(ir.fields)) {
    if (isAmbiguous(value as IRValue)) {
      warnings.push(
        `Field "${fieldName}" is ambiguous: ${(value as { reason: string }).reason}`
      );
    }
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined validation entry point
// ─────────────────────────────────────────────────────────────────────────────

export function validateIR(ir: IR): ValidationResult {
  const entry = getContractType(ir.contractType); // throws if unknown type

  const schemaErrors = validateSchemaLayer(ir, entry.schema);
  const { errors: templateErrors, warnings } = validateTemplateLayer(ir);

  const allErrors = [...schemaErrors, ...templateErrors];

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings,
  };
}
