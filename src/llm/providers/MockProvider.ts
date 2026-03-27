/**
 * Mock LLM Provider
 * -----------------
 * Deterministic fake provider used for unit tests and offline development.
 * Returns fixture data keyed by contract type so the pipeline can be
 * exercised end-to-end without a real API call.
 */

import type { LLMProvider, ValidationError } from "../interface.js";
import type { IR, IRFields } from "../../ir/types.js";
import type { ContractSchema } from "../../registry/contractTypes.js";

const MOCK_FIXTURES: Record<string, IRFields> = {
  DeliveryPayment: {
    buyer: "Acme Corp",
    seller: "Global Supplies Ltd",
    deliveryItem: "500 units of industrial-grade steel pipe",
    deliveryDate: "2025-09-15T00:00:00.000Z",
    paymentAmount: 48500,
    currency: "USD",
    paymentDueDays: 30,
    deliveryLocation: "Warehouse 4, Chicago, IL",
  },
  ServiceAgreement: {
    serviceProvider: "DevCraft Solutions Inc",
    client: "RetailNow Pvt Ltd",
    serviceDescription: "Full-stack web application development for e-commerce platform",
    startDate: "2025-07-01T00:00:00.000Z",
    endDate: "2025-12-31T00:00:00.000Z",
    ratePerHour: null,
    fixedFee: 120000,
    currency: "USD",
    paymentFrequency: "MILESTONE",
    governingLaw: "State of Delaware",
  },
  LatePenalty: {
    obligorParty: "FastFreight Logistics",
    obligeeParty: "Nexus Retail Group",
    obligationType: "DELIVERY",
    gracePeriodDays: 3,
    penaltyRatePercent: 1.5,
    penaltyPeriod: "WEEKLY",
    maxPenaltyPercent: 15,
    currency: "USD",
  },
};

const MOCK_AMBIGUOUS_FIXTURE: IRFields = {
  buyer: "Acme Corp",
  seller: "Global Supplies Ltd",
  deliveryItem: "steel pipes",
  deliveryDate: { __ambiguous: true, value: null, reason: "No date found in text" },
  paymentAmount: { __ambiguous: true, value: 10000, reason: "Amount mentioned but currency context unclear" },
  currency: "USD",
  paymentDueDays: null,
  deliveryLocation: null,
} as unknown as IRFields;

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  private useAmbiguous: boolean;

  constructor(options: { useAmbiguous?: boolean } = {}) {
    this.useAmbiguous = options.useAmbiguous ?? false;
  }

  async identifyContractType(
    _input: string,
    knownTypes: string[]
  ): Promise<string | null> {
    // Look for keywords in input
    const lower = _input.toLowerCase();
    if (lower.includes("deliver") && lower.includes("payment")) return "DeliveryPayment";
    if (lower.includes("service") && lower.includes("agreement")) return "ServiceAgreement";
    if (lower.includes("penalt") || lower.includes("late")) return "LatePenalty";
    return knownTypes[0] ?? null;
  }

  async extractIR(
    _input: string,
    schema: ContractSchema
  ): Promise<IRFields> {
    const contractType = schema.conceptName
      .replace("Contract", "")
      .replace("Clause", "");

    if (this.useAmbiguous && contractType === "DeliveryPayment") {
      return MOCK_AMBIGUOUS_FIXTURE;
    }

    const fixture = MOCK_FIXTURES[contractType];
    if (!fixture) {
      throw new Error(`MockProvider: no fixture for contract type "${contractType}"`);
    }

    return { ...fixture };
  }

  async repairIR(
    _input: string,
    errors: ValidationError[],
    currentIR: IR
  ): Promise<IRFields> {
    // Simulate only allowed repairs: normalization and format cleanup.
    const repaired: IRFields = { ...currentIR.fields };

    for (const err of errors) {
      switch (err.code) {
        case "ENUM_VIOLATION": {
          const value = repaired[err.field];
          if (typeof value === "string") {
            repaired[err.field] = value.trim().toUpperCase();
          }
          break;
        }
        case "WRONG_TYPE": {
          const value = repaired[err.field];
          if (typeof value === "string") {
            const normalized = value.trim();
            const parsedDate = new Date(normalized);
            if (!Number.isNaN(parsedDate.getTime())) {
              repaired[err.field] = parsedDate.toISOString();
            } else {
              repaired[err.field] = normalized;
            }
          }
          break;
        }
        default:
          // Leave substantive missing or contradictory values untouched.
          break;
      }
    }

    return repaired;
  }
}
