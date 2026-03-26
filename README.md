# Accord-Aware LLM Drafting System

## Overview

This project implements a **semantics-aware contract drafting system** that combines:

* **LLM-based natural language understanding (Groq)**
* **Typed Intermediate Representation (IR)**
* **Deterministic contract generation**
* **Accord Project-compatible artifacts**

![Initial Requirements Spec](file:///Users/rishabhjain/.gemini/antigravity/brain/1d7d12d5-1a8a-44f4-b6ff-2cc254a80d7e/read_pdf_requirements_1774509126677.webp)

The system converts a plain-English contract brief into:

* `model.cto` (Concerto data model)
* `grammar.tem.md` (TemplateMark contract text)
* `logic.ergo` (Executable contract logic)
* `package.json` (Accord template package)

---

## Core Idea

Instead of generating contracts directly using an LLM, this system enforces a strict pipeline:

```
Natural Language → LLM (Groq) → Typed IR → Deterministic Generator → Accord Template
```

### Key Principle

> **LLM interprets. The system decides.**

This ensures:

* No hallucinated contract structures
* Strong alignment with Accord’s model-driven design
* Deterministic and verifiable outputs

---

## Alignment with Accord Project

This system follows the architecture of Accord Project:

| Accord Concept         | This System                |
| ---------------------- | -------------------------- |
| Model (Concerto)       | IR → `model.cto`           |
| Grammar (TemplateMark) | Generated `grammar.tem.md` |
| Logic (Ergo)           | Generated `logic.ergo`     |
| Template Package       | Generated `package.json`   |

### Important Design Constraint

* The **model defines the contract semantics**
* The **template binds to the model**
* The **LLM never defines schema**

---

## Architecture

```
User Input (Natural Language)
        ↓
LLM Provider (Groq)
        ↓
Typed IR (Contract-Type Aware)
        ↓
Schema Validation
        ↓
Deterministic Generators
   ├── model.cto
   ├── grammar.tem.md
   ├── logic.ergo
   └── package.json
        ↓
Validator + Repair Loop
```

---

## Intermediate Representation (IR)

The IR is the **semantic core** of the system.

### Properties

* Contract-type aware
* Strictly schema-bound
* Supports nested conditions (AST)
* Includes confidence and ambiguity markers

### Example (LatePenalty)

```json
{
  "contractType": "LatePenalty",
  "obligorParty": "FastFreight Logistics",
  "obligeeParty": "Nexus Retail Group",
  "gracePeriodDays": 3,
  "penaltyRatePercent": 1.5,
  "penaltyPeriod": "WEEKLY",
  "maxPenaltyPercent": 15,
  "currency": "USD"
}
```

---

## Contract Types Supported

### 1. DeliveryPayment

* Buyer–seller contracts
* Delivery-triggered payment obligations

### 2. ServiceAgreement

* Client–provider relationships
* Fixed fee / hourly hybrid models

### 3. LatePenalty

* Penalty computation for late obligations
* Includes executable Ergo logic

---

## LLM Integration (Groq)

The system uses Groq for:

* Contract type classification
* IR field extraction
* IR repair (if validation fails)

### Why Groq

* Fast inference
* OpenAI-compatible API
* Structured output support

### Important Constraint

LLM is only allowed to:

* Fill known schema fields
* Return structured JSON

LLM is NOT allowed to:

* Create new fields
* Generate contract text directly

---

## Validation System

The validator ensures:

### Structural Checks

* Required fields exist
* No unknown fields
* Correct data types

### Semantic Checks

* Missing obligation parties
* Logical inconsistencies
* Invalid condition structures

### Output

```json
{
  "isValid": true,
  "verdict": "valid",
  "issues": []
}
```

---

## Repair Loop

If validation fails:

1. Errors are sent back to LLM
2. LLM updates IR only
3. Pipeline re-runs

This creates a **self-correcting drafting system**

---

## Code Structure

```
src/
  contract-types/   → Schema definitions
  ir/               → IR types and normalization
  llm/              → Groq + provider abstraction
  generator/        → Template + model + logic generation
  validator/        → Semantic validation engine
  parser/           → Classification + extraction helpers
  accord-impl/      → Accord-specific integrations
```

---

## Accord Implementation Layer (`accord-impl`)

This module bridges IR → Accord artifacts.

### Responsibilities

* Generate Concerto models
* Generate TemplateMark grammar
* Generate Ergo logic
* Build template package

This ensures strict compatibility with Accord tooling.

---

## Template Playground Integration

This system is fully integrated with the **Accord Project Template Playground**.

![Playground Integration](file:///Users/rishabhjain/.gemini/antigravity/brain/1d7d12d5-1a8a-44f4-b6ff-2cc254a80d7e/drafting_panel_integration_1774516031125.png)

### Integration Flow

1. Generate template package:
   - `model.cto`
   - `grammar.tem.md`
   - `logic.ergo`
   - `package.json`

2. Import into Playground:

   * Upload files
   * Or paste into editor

3. Test:

   * Clause parsing
   * Data binding
   * Logic execution

---

## How to Run

```bash
npm install
npm run demo
```

To enable Groq:

```bash
# .env file
USE_GROQ=true
GROQ_API_KEY=your_key_here
```

---

## Example Output

```
▶ Pipeline Result: SUCCESS
Contract Type: LatePenalty
Repair passes: 0
```

Generated:

* `model.cto`
* `grammar.tem.md`
* `logic.ergo`
* `package.json`

---

## Limitations

* Limited contract types (currently 3)
* No multi-clause composition yet
* Runtime inputs (e.g. baseAmount) not fully modeled
* Logic is template-based, not fully inferred

---

## Future Work

* Multi-clause contracts
* Nested condition support (full AST)
* Better financial modeling
* Clause composition engine
* Full Accord execution lifecycle integration

---

## Key Takeaway

This system transforms contract drafting from:

> Text generation problem

into:

> **Structured semantic compilation problem**

Which is exactly how Accord Project models legal contracts.

---
