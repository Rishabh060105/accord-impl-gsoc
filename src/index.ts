/**
 * Accord Pipeline — Public API
 */

// Pipeline
export { AccordPipeline } from "./pipeline/pipeline.js";
export type { PipelineOptions, PipelineResult } from "./pipeline/pipeline.js";

// Registry
export {
  CONTRACT_REGISTRY,
  getContractType,
  listContractTypes,
} from "./registry/contractTypes.js";
export type {
  ContractSchema,
  ContractTypeEntry,
  FieldSchema,
  FieldType,
  ValidationRule,
  TemplateRule,
} from "./registry/contractTypes.js";

// IR types
export { createEmptyIR, isAmbiguous, resolveValue } from "./ir/types.js";
export type { IR, IRFields, IRValue, IRAmbigu, IRFieldValue } from "./ir/types.js";

// LLM interface
export type { LLMProvider, ValidationError } from "./llm/interface.js";

// Providers
export { MockProvider } from "./llm/providers/MockProvider.js";
export { AnthropicProvider } from "./llm/providers/AnthropicProvider.js";
export { GroqProvider } from "./llm/providers/GroqProvider.js";
export { OpenAIProvider } from "./llm/providers/OpenAIProvider.js";

// Validation
export { validateIR, validateSchemaLayer, validateTemplateLayer } from "./validation/validator.js";
export type { ValidationResult } from "./validation/validator.js";

// Generation
export { generateArtifacts, generateModelCto, generateGrammarTemMd, generateLogicErgo } from "./generation/generator.js";
export type { GeneratedArtifacts } from "./generation/generator.js";
