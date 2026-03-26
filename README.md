# Accord-Aware LLM Drafting Pipeline

This repository implements a semantics-aware contract drafting pipeline for the Accord Project. Instead of asking an LLM to directly write a contract template, the system uses the model only for interpretation and extraction, then relies on a typed registry, deterministic validation, and code generation to produce Accord-compatible artifacts.

The core design principle is:

> The LLM interprets. The pipeline decides.

That separation keeps the output aligned with Accord's model-driven architecture and reduces hallucinated structure in generated templates.

## Project Goal

The project turns a plain-English contract brief into a draft template package made of:

- `model.cto`
- `grammar.tem.md`
- `logic.ergo`
- `package.json`

The output is shaped by a contract-type registry, not by free-form generation. Today the registry supports:

- `DeliveryPayment`
- `ServiceAgreement`
- `LatePenalty`

The pipeline is provider-agnostic. Groq is one supported backend, but the architecture is compatible with other LLMs as well because extraction, repair, and contract-type identification are all routed through the shared provider interface.

## End-to-End Architecture

The runtime flow in [`src/pipeline/pipeline.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/pipeline/pipeline.ts) is:

```text
Natural-language contract brief
        ↓
Contract type identification
        ↓
Schema lookup from contract registry
        ↓
IR extraction through provider
        ↓
Schema validation + template-aware validation
        ↓
Repair loop for invalid fields
        ↓
Deterministic artifact generation
        ↓
Accord Project template package
```

In concrete terms:

1. The provider identifies the contract type unless one is forced.
2. The registry loads the schema, template rules, and business rules for that type.
3. The provider extracts only the fields defined by that schema into a typed IR.
4. The validator checks required fields, field types, enum constraints, template/model alignment, and business rules.
5. If validation fails, the provider receives targeted repair instructions and returns corrected fields.
6. Once the IR is valid, generators emit the final Accord artifacts deterministically.

## Code Structure

The implementation is intentionally split by responsibility:

- [`src/pipeline/pipeline.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/pipeline/pipeline.ts): orchestration, repair loop, result assembly
- [`src/registry/contractTypes.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/registry/contractTypes.ts): supported contract types, field schemas, TemplateMark bindings, business validation rules
- [`src/ir/types.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/ir/types.ts): typed intermediate representation and ambiguity markers
- [`src/validation/validator.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/validation/validator.ts): schema-layer and template-aware validation
- [`src/generation/generator.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/generation/generator.ts): deterministic generation of `model.cto`, `grammar.tem.md`, `logic.ergo`, and `package.json`
- [`src/llm/interface.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/llm/interface.ts): provider contract
- [`src/llm/providers/MockProvider.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/llm/providers/MockProvider.ts): offline deterministic provider for testing and demos
- [`src/llm/providers/GroqProvider.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/llm/providers/GroqProvider.ts): Groq-backed implementation used for live extraction
- [`src/tests/runner.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/tests/runner.ts): fixture-based end-to-end test runner
- [`src/demo.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/demo.ts): sample execution across all supported contract types

## Intermediate Representation

The IR is the semantic backbone of the system. It is defined in [`src/ir/types.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/ir/types.ts) and carries:

- `contractType`
- `schemaVersion`
- `fields`
- `extractedAt`
- `providerUsed`
- `repairPass`

The important constraint is that the field set must come from the registry schema. The LLM is not supposed to invent arbitrary keys.

The IR also supports ambiguity markers:

```ts
{
  __ambiguous: true,
  value: ...,
  reason: "why the model is uncertain"
}
```

That lets the pipeline preserve uncertainty explicitly instead of silently fabricating certainty.

### Example IR

```json
{
  "contractType": "LatePenalty",
  "schemaVersion": "1.0",
  "fields": {
    "obligorParty": "FastFreight Logistics",
    "obligeeParty": "Nexus Retail Group",
    "obligationType": "DELIVERY",
    "gracePeriodDays": 3,
    "penaltyRatePercent": 1.5,
    "penaltyPeriod": "WEEKLY",
    "maxPenaltyPercent": 15,
    "currency": "USD"
  },
  "providerUsed": "groq",
  "repairPass": 0
}
```

## Contract Registry

The registry in [`src/registry/contractTypes.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/registry/contractTypes.ts) is the system's source of truth. Each contract type defines:

- a `schema` for valid fields and types
- `templateRules` for TemplateMark bindings and labels
- `validationRules` for business constraints

### DeliveryPayment

Fields include:

- `buyer`
- `seller`
- `deliveryItem`
- `deliveryDate`
- `paymentAmount`
- `currency`
- `paymentDueDays`
- `deliveryLocation`

Business rules include positive payment amounts, positive payment due days, and distinct buyer/seller parties.

### ServiceAgreement

Fields include:

- `serviceProvider`
- `client`
- `serviceDescription`
- `startDate`
- `endDate`
- `ratePerHour`
- `fixedFee`
- `currency`
- `paymentFrequency`
- `governingLaw`

Business rules include requiring at least one pricing mode, ensuring provider and client differ, and enforcing `endDate > startDate` when an end date exists.

### LatePenalty

Fields include:

- `obligorParty`
- `obligeeParty`
- `obligationType`
- `gracePeriodDays`
- `penaltyRatePercent`
- `penaltyPeriod`
- `maxPenaltyPercent`
- `currency`

Business rules include valid penalty ranges, non-negative grace periods, valid penalty caps, and distinct obligor/obligee parties.

## Validation Model

Validation happens in two layers inside [`src/validation/validator.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/validation/validator.ts).

### Layer 1: Schema Validation

This rejects:

- unknown fields
- missing required fields
- wrong primitive types
- invalid enum values

### Layer 2: Template-Aware Validation

This checks:

- every template variable maps to a model field
- required fields are not missing from template rules
- registry business rules pass
- ambiguous values are surfaced as warnings

If any hard validation errors remain, the pipeline does not generate artifacts.

## Repair Loop

One of the most important architectural choices is the repair loop in [`src/pipeline/pipeline.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/pipeline/pipeline.ts).

When extraction produces invalid data:

1. validation errors are collected
2. the provider receives the current IR plus the error list
3. only the offending fields are repaired
4. the IR is validated again
5. the loop continues until success or `maxRepairPasses` is exhausted

This makes the system self-correcting while still keeping the final output under deterministic control.

## Generated Artifacts

All artifacts are generated in [`src/generation/generator.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/generation/generator.ts). The LLM does not write this layer.

### 1. TemplateMark grammar

The generated `grammar.tem.md` contains:

- field labels
- TemplateMark bindings
- current resolved values for inspection
- contract-type-specific clause text

Top section of generated TemplateMark:

![TemplateMark details top](assets/ss-templatemark-details-top.png)

Remaining field bindings:

![TemplateMark details bottom](assets/ss-templatemark-details-bottom.png)

Generated clause text:

![TemplateMark clause text](assets/ss-templatemark-clause-text.png)

### 2. Concerto model

The generated `model.cto` is built directly from the registry schema and maps supported field types into Concerto declarations.

Model header and namespace:

![Concerto model top](assets/ss-concerto-model-top.png)

Field declarations:

![Concerto model bottom](assets/ss-concerto-model-bottom.png)

### 3. Ergo logic

The generated `logic.ergo` contains contract-type-specific logic stubs. These are deterministic scaffolded rules, not free-form LLM output.

Top of generated Ergo logic:

![Ergo logic top](assets/ss-ergo-top.png)

Contract clause and validation result:

![Ergo logic bottom](assets/ss-ergo-bottom.png)

### 4. Package metadata

The generator also emits a `package.json` payload with:

- template metadata
- Cicero runtime information
- namespace
- contract name
- package keywords

## Template Playground Integration

The repository is designed to plug into the Accord Project Template Playground workflow.

Full integrated playground view:

![Template Playground integration](assets/playground_full.png)

Engine switching in the drafting UI:

![Drafting engine toggle](assets/ss-engine-toggle.png)

The intended user flow is:

1. paste a plain-English contract brief
2. select the `LLM Drafting (Accord-Impl)` engine
3. generate the draft package
4. inspect `model.cto`, `grammar.tem.md`, and JSON data in the Playground
5. preview the rendered contract

## Providers

The public API in [`src/index.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/index.ts) exposes multiple providers:

- `MockProvider`
- `GroqProvider`
- `AnthropicProvider`
- `OpenAIProvider`

The pipeline is not tied to Groq. Any LLM can be used as long as it implements the `LLMProvider` contract in [`src/llm/interface.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/llm/interface.ts).

That means the same drafting pipeline can run with Groq, OpenAI, Anthropic, mock providers for testing, or any future backend added behind the same interface.

For local development, the demo and tests are easiest to run with `MockProvider`. The current live demo path in [`src/demo.ts`](/Users/rishabhjain/Desktop/gsoc/accord-impl/src/demo.ts) is wired around Groq when `USE_GROQ=true`, but that is an implementation choice rather than an architectural limitation.

## Running the Project

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run the demo

```bash
npm run demo
```

By default this uses the mock provider unless `USE_GROQ=true` is set.

### Run the tests

```bash
npm test
```

### Type-check

```bash
npm run typecheck
```

## Groq Configuration

To enable the Groq-backed provider, create a `.env` file in the repository root:

```bash
USE_GROQ=true
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

The Groq provider uses the OpenAI-compatible chat completions API and requests JSON-formatted responses for extraction and repair.

## Why This Architecture Matters

This repository treats contract drafting as a semantic compilation problem rather than a text-generation problem.

That means:

- the contract type is explicit
- the schema is explicit
- the IR is inspectable
- validation is deterministic
- generation is reproducible
- ambiguity is surfaced instead of hidden

That architecture is a strong fit for the Accord Project because Accord templates are fundamentally structured, typed, and executable artifacts.
