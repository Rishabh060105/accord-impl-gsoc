import { isAmbiguous, type IR, type IRFields, type IRValue } from "../ir/types.js";
import type { LLMProvider } from "../llm/interface.js";
import {
  extractIRWithProvider,
  identifyContractTypeWithProvider,
  repairIRWithProvider,
} from "../tools/providerTool.js";
import { generateAccordArtifacts } from "../tools/generationTool.js";
import { loadContractType, loadKnownContractTypes } from "../tools/registryTool.js";
import { validateIntermediateRepresentation } from "../tools/validationTool.js";
import {
  addRepairRecord,
  addStageTrace,
  createWorkflowContext,
  getActiveIR,
  type WorkflowContext,
  type WorkflowStage,
} from "./context.js";
import type { FieldSchema } from "../registry/contractTypes.js";

export interface AgenticWorkflowOptions {
  forceContractType?: string;
  maxRepairPasses?: number;
  verbose?: boolean;
}

export interface AgenticWorkflowResult {
  success: boolean;
  context: WorkflowContext;
  errorSummary: string | null;
}

export class AgenticWorkflowOrchestrator {
  private readonly provider: LLMProvider;
  private readonly options: Required<AgenticWorkflowOptions>;

  constructor(provider: LLMProvider, options: AgenticWorkflowOptions = {}) {
    this.provider = provider;
    this.options = {
      forceContractType: options.forceContractType ?? "",
      maxRepairPasses: options.maxRepairPasses ?? 3,
      verbose: options.verbose ?? false,
    };
  }

  async run(rawRequirements: string): Promise<AgenticWorkflowResult> {
    const context = createWorkflowContext(rawRequirements, {
      maxRepairPasses: this.options.maxRepairPasses,
    });

    context.status = "running";

    try {
      await this.runRequirementsAnalysis(context);
      await this.runContractTypeClassification(context);
      await this.runSchemaAlignment(context);
      await this.runIRComposition(context);
      await this.runValidationAndRepair(context);
      await this.runArtifactGeneration(context);
      await this.runReview(context);

      context.status = "completed";

      return {
        success: true,
        context,
        errorSummary: null,
      };
    } catch (error) {
      context.status = "failed";
      context.errors.push(String(error));

      return {
        success: false,
        context,
        errorSummary: context.errors.join("\n"),
      };
    }
  }

  private async runRequirementsAnalysis(context: WorkflowContext): Promise<void> {
    this.startStage(context, "requirements_analysis", "Normalizing natural-language requirements");
    context.normalizedBrief = context.rawRequirements.trim();
    this.finishStage(context, "requirements_analysis", "Normalized drafting brief prepared");
  }

  private async runContractTypeClassification(context: WorkflowContext): Promise<void> {
    this.startStage(context, "contract_type_classification", "Selecting supported contract type");

    if (this.options.forceContractType) {
      context.selectedContractType = this.options.forceContractType;
    } else {
      const contractType = await identifyContractTypeWithProvider(
        this.provider,
        context.normalizedBrief ?? context.rawRequirements,
        loadKnownContractTypes()
      );

      context.selectedContractType =
        contractType ?? detectContractTypeHeuristically(context.normalizedBrief ?? context.rawRequirements);

      if (!context.selectedContractType) {
        throw new Error("Could not identify a supported contract type.");
      }
    }

    this.finishStage(
      context,
      "contract_type_classification",
      `Selected contract type: ${context.selectedContractType}`
    );
  }

  private async runSchemaAlignment(context: WorkflowContext): Promise<void> {
    this.startStage(context, "schema_alignment", "Loading schema and template rules from registry");

    if (!context.selectedContractType) {
      throw new Error("Schema alignment requires a selected contract type.");
    }

    const entry = loadContractType(context.selectedContractType);
    context.schemaNamespace = entry.schema.namespace;

    this.finishStage(
      context,
      "schema_alignment",
      `Loaded schema namespace: ${context.schemaNamespace}`
    );
  }

  private async runIRComposition(context: WorkflowContext): Promise<void> {
    this.startStage(context, "ir_composition", "Extracting typed intermediate representation");

    if (!context.selectedContractType) {
      throw new Error("IR composition requires a selected contract type.");
    }

    const { schema } = loadContractType(context.selectedContractType);
    const fields = await extractIRWithProvider(
      this.provider,
      context.normalizedBrief ?? context.rawRequirements,
      schema
    );

    context.extractedIR = {
      contractType: context.selectedContractType,
      schemaVersion: "1.0",
      fields,
      extractedAt: new Date().toISOString(),
      providerUsed: this.provider.name,
      repairPass: 0,
    };

    this.finishStage(
      context,
      "ir_composition",
      `IR extracted with ${Object.keys(fields).length} field(s)`
    );
  }

  private async runValidationAndRepair(context: WorkflowContext): Promise<void> {
    this.startStage(context, "validation", "Validating extracted IR");

    const extracted = context.extractedIR;
    if (!extracted) {
      throw new Error("Validation requires an extracted IR.");
    }

    let currentIR: IR = extracted;
    let validation = validateIntermediateRepresentation(currentIR);
    context.validationResult = validation;

    while (!validation.valid && context.repairPassesUsed < context.maxRepairPasses) {
      this.finishStage(
        context,
        "validation",
        `Validation failed with ${validation.errors.length} error(s)`
      );

      this.startStage(context, "repair", `Repair pass ${context.repairPassesUsed + 1}`);
      context.status = "repairing";

      const repairedFields = await repairIRWithProvider(
        this.provider,
        context.normalizedBrief ?? context.rawRequirements,
        validation.errors,
        currentIR
      );

      const repairedIR: IR = {
        ...currentIR,
        fields: repairedFields,
        repairPass: context.repairPassesUsed + 1,
      };

      const postRepairValidation = validateIntermediateRepresentation(repairedIR);
      addRepairRecord(context, {
        iteration: repairedIR.repairPass,
        errorsBefore: validation.errors,
        errorsAfter: postRepairValidation.errors,
      });

      context.repairedIR = repairedIR;
      currentIR = repairedIR;
      validation = postRepairValidation;
      context.validationResult = validation;
      context.status = "running";

      this.finishStage(
        context,
        "repair",
        `Repair pass ${repairedIR.repairPass} completed`
      );
      this.startStage(context, "validation", "Re-validating repaired IR");
    }

    this.finishStage(
      context,
      "validation",
      validation.valid
        ? `Validation passed${validation.warnings.length ? ` with ${validation.warnings.length} warning(s)` : ""}`
        : `Validation failed after ${context.repairPassesUsed} repair pass(es)`
    );

    if (!validation.valid) {
      const fallbackIR = applyDeterministicNormalization(
        currentIR,
        context.normalizedBrief ?? context.rawRequirements
      );
      const fallbackValidation = validateIntermediateRepresentation(fallbackIR);

      if (fallbackValidation.valid) {
        context.repairedIR = fallbackIR;
        context.validationResult = fallbackValidation;
        this.finishStage(
          context,
          "validation",
          "Validation passed after deterministic completion fallback"
        );
        return;
      }
    }

    if (!validation.valid) {
      this.finishStage(
        context,
        "validation",
        `Proceeding with invalid IR to allow [MISSING] field detection. Errors: ${validation.errors.length}`
      );
    }
  }

  private async runArtifactGeneration(context: WorkflowContext): Promise<void> {
    this.startStage(context, "artifact_generation", "Generating Accord artifacts");

    const ir = getActiveIR(context);
    if (!ir) {
      throw new Error("Artifact generation requires a valid IR.");
    }

    context.artifacts = generateAccordArtifacts(ir);

    this.finishStage(
      context,
      "artifact_generation",
      "Generated model, grammar, logic, and metadata"
    );
  }

  private async runReview(context: WorkflowContext): Promise<void> {
    this.startStage(context, "review", "Preparing workflow review summary");

    const warnings = context.validationResult?.warnings ?? [];
    const repairPasses = context.repairPassesUsed;
    const contractType = context.selectedContractType ?? "Unknown";

    context.reviewNotes = [
      `Contract type: ${contractType}`,
      `Provider: ${this.provider.name}`,
      `Repair passes used: ${repairPasses}`,
      warnings.length > 0
        ? `Warnings: ${warnings.join(" | ")}`
        : "Warnings: none",
      "Outputs: model.cto, grammar.tem.md, logic.ergo, package.json",
    ].join("\n");

    this.finishStage(context, "review", "Review summary prepared");
  }

  private startStage(
    context: WorkflowContext,
    stage: WorkflowStage,
    summary: string
  ): void {
    if (this.options.verbose) {
      console.log(`[AgenticWorkflow] ${summary}`);
    }

    addStageTrace(context, {
      stage,
      summary,
      startedAt: new Date().toISOString(),
    });
  }

  private finishStage(
    context: WorkflowContext,
    stage: WorkflowStage,
    summary: string
  ): void {
    const trace = [...context.traces].reverse().find((entry) => entry.stage === stage && !entry.finishedAt);

    if (trace) {
      trace.finishedAt = new Date().toISOString();
      trace.summary = summary;
    } else {
      addStageTrace(context, {
        stage,
        summary,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });
    }

    if (this.options.verbose) {
      console.log(`[AgenticWorkflow] ${summary}`);
    }
  }
}

export function createFailedWorkflowResult(
  rawRequirements: string,
  error: string
): AgenticWorkflowResult {
  const context = createWorkflowContext(rawRequirements);
  context.status = "failed";
  context.errors.push(error);

  return {
    success: false,
    context,
    errorSummary: error,
  };
}

function detectContractTypeHeuristically(input: string): string | null {
  const lower = input.toLowerCase();

  if (lower.includes("service") && (lower.includes("agreement") || lower.includes("client") || lower.includes("milestone"))) {
    return "ServiceAgreement";
  }

  if (
    (lower.includes("delivery") || lower.includes("buyer") || lower.includes("seller")) &&
    (lower.includes("payment") || lower.includes("goods"))
  ) {
    return "DeliveryPayment";
  }

  if (lower.includes("penalty") || lower.includes("late") || lower.includes("grace period")) {
    return "LatePenalty";
  }

  return null;
}

function applyDeterministicNormalization(ir: IR, contractText: string): IR {
  const { schema } = loadContractType(ir.contractType);
  const normalizedFields: IRFields = { ...ir.fields };

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    const currentValue = normalizedFields[fieldName];
    if (currentValue === undefined || currentValue === null) {
      continue;
    }

    const normalizedValue = normalizeExistingValue(currentValue, fieldSchema, contractText);
    if (normalizedValue !== undefined) {
      normalizedFields[fieldName] = normalizedValue;
    }
  }

  return {
    ...ir,
    fields: normalizedFields,
  };
}

function normalizeExistingValue(
  value: IRValue,
  fieldSchema: FieldSchema,
  contractText: string
): IRValue | undefined {
  if (isAmbiguous(value)) {
    const normalizedAmbiguous = normalizeRawValue(value.value, fieldSchema, contractText);
    if (normalizedAmbiguous === undefined) {
      return undefined;
    }
    return {
      ...value,
      value: normalizedAmbiguous as string | number | boolean | null | Array<string | number | boolean | null>,
    };
  }

  return normalizeRawValue(value, fieldSchema, contractText);
}

function normalizeRawValue(
  rawValue: IRValue | string | number | boolean | null | Array<string | number | boolean | null>,
  fieldSchema: FieldSchema,
  _contractText: string
): IRValue | undefined {
  if (rawValue === null) {
    return undefined;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim().replace(/\s+/g, " ");

    if (fieldSchema.enum && fieldSchema.enum.length > 0) {
      const matched = fieldSchema.enum.find((allowed) => allowed.toLowerCase() === trimmed.toLowerCase());
      if (matched && matched !== rawValue) {
        return matched;
      }
    }

    if (fieldSchema.type === "DateTime") {
      const date = new Date(trimmed);
      if (!Number.isNaN(date.getTime())) {
        const iso = date.toISOString();
        if (iso !== rawValue) {
          return iso;
        }
      }
    }

    if (trimmed !== rawValue) {
      return trimmed;
    }
  }

  return undefined;
}
