/**
 * Accord Pipeline
 * ---------------
 * Orchestrates all steps from the spec:
 *
 *   1. Identify contract type (LLM)
 *   2. Load schema from registry
 *   3. Extract IR (LLM)
 *   4. Validate IR (schema + template-aware)
 *   5. Repair loop (LLM, max N passes)
 *   6. Generate artifacts (deterministic)
 *
 * The pipeline is provider-agnostic — it accepts any LLMProvider.
 */

import { getContractType, listContractTypes } from "../registry/contractTypes.js";
import { createEmptyIR, type IR } from "../ir/types.js";
import type { LLMProvider } from "../llm/interface.js";
import { validateIR, type ValidationResult } from "../validation/validator.js";
import { generateArtifacts, type GeneratedArtifacts } from "../generation/generator.js";

export interface PipelineOptions {
  /** Maximum number of repair passes before giving up */
  maxRepairPasses?: number;
  /** If provided, skip LLM type detection and use this type directly */
  forceContractType?: string;
  /** Emit progress logs */
  verbose?: boolean;
}

export interface PipelineResult {
  success: boolean;
  ir: IR;
  validationResult: ValidationResult;
  artifacts: GeneratedArtifacts | null;
  repairPassesUsed: number;
  errorSummary: string | null;
}

export class AccordPipeline {
  private provider: LLMProvider;
  private options: Required<PipelineOptions>;

  constructor(provider: LLMProvider, options: PipelineOptions = {}) {
    this.provider = provider;
    this.options = {
      maxRepairPasses: options.maxRepairPasses ?? 3,
      forceContractType: options.forceContractType ?? "",
      verbose: options.verbose ?? false,
    };
  }

  private log(msg: string): void {
    if (this.options.verbose) {
      console.log(`[AccordPipeline] ${msg}`);
    }
  }

  async run(contractText: string): Promise<PipelineResult> {
    // ── Step 1: Identify contract type ────────────────────────────────────
    let contractType: string;

    if (this.options.forceContractType) {
      contractType = this.options.forceContractType;
      this.log(`Using forced contract type: ${contractType}`);
    } else {
      this.log("Identifying contract type...");
      const knownTypes = listContractTypes();
      const detected = await this.provider.identifyContractType(contractText, knownTypes);

      if (!detected) {
        const ir = createEmptyIR("Unknown", this.provider.name);
        return {
          success: false,
          ir,
          validationResult: { valid: false, errors: [], warnings: [] },
          artifacts: null,
          repairPassesUsed: 0,
          errorSummary: `Could not identify contract type. Known types: ${knownTypes.join(", ")}`,
        };
      }

      contractType = detected;
      this.log(`Detected contract type: ${contractType}`);
    }

    // ── Step 2: Load schema from registry ────────────────────────────────
    const { schema } = getContractType(contractType);

    // ── Step 3: Extract IR via LLM ────────────────────────────────────────
    this.log("Extracting IR...");
    const rawFields = await this.provider.extractIR(contractText, schema);

    let ir: IR = {
      contractType,
      schemaVersion: "1.0",
      fields: rawFields,
      extractedAt: new Date().toISOString(),
      providerUsed: this.provider.name,
      repairPass: 0,
    };

    // ── Steps 4 + 6: Validate then repair loop ─────────────────────────────
    let validation = validateIR(ir);
    this.log(`Validation pass 0: ${validation.valid ? "PASS" : `FAIL (${validation.errors.length} errors)`}`);

    let repairPass = 0;

    while (!validation.valid && repairPass < this.options.maxRepairPasses) {
      repairPass++;
      this.log(`Starting repair pass ${repairPass}...`);

      const repairedFields = await this.provider.repairIR(
        contractText,
        validation.errors,
        ir
      );

      ir = {
        ...ir,
        fields: repairedFields,
        repairPass,
      };

      validation = validateIR(ir);
      this.log(
        `Validation after repair ${repairPass}: ${
          validation.valid ? "PASS" : `FAIL (${validation.errors.length} errors)`
        }`
      );
    }

    // ── Step 5: Generate artifacts (only if valid) ─────────────────────────
    if (!validation.valid) {
      return {
        success: false,
        ir,
        validationResult: validation,
        artifacts: null,
        repairPassesUsed: repairPass,
        errorSummary: [
          `IR failed validation after ${repairPass} repair pass(es).`,
          `Remaining errors:`,
          ...validation.errors.map((e) => `  [${e.code}] ${e.field}: ${e.message}`),
        ].join("\n"),
      };
    }

    if (validation.warnings.length > 0) {
      this.log(`Warnings: ${validation.warnings.join(", ")}`);
    }

    this.log("Generating artifacts...");
    const artifacts = generateArtifacts(ir);

    this.log("Pipeline complete.");
    return {
      success: true,
      ir,
      validationResult: validation,
      artifacts,
      repairPassesUsed: repairPass,
      errorSummary: null,
    };
  }
}
