/**
 * Contract-Type Registry
 * ----------------------
 * Each entry defines:
 *   - IR schema        : the fields the LLM must fill
 *   - concertoModel    : type mappings for model.cto generation
 *   - templateRules    : how each field renders in grammar.tem.md
 *   - validationRules  : structural constraints beyond JSON Schema
 */

export type FieldType =
  | "String"
  | "Double"
  | "Integer"
  | "DateTime"
  | "Boolean"
  | "Duration";

export interface FieldSchema {
  type: FieldType;
  required: boolean;
  description: string;
  /** Optional: allowed string values */
  enum?: string[];
  /** Optional: nested object schema (for structured sub-types) */
  nested?: Record<string, FieldSchema>;
}

export interface ContractSchema {
  namespace: string;
  conceptName: string;
  description: string;
  fields: Record<string, FieldSchema>;
}

export interface TemplateRule {
  /** Accord TemplateMark variable binding, e.g. "{{% buyer %}}" */
  binding: string;
  /** Human-readable clause label */
  label: string;
}

export interface ValidationRule {
  id: string;
  description: string;
  /** Returns an error string if rule fails, null if it passes */
  check: (ir: Record<string, unknown>) => string | null;
}

export interface ContractTypeEntry {
  schema: ContractSchema;
  templateRules: Record<string, TemplateRule>;
  validationRules: ValidationRule[];
}

// ─────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────

export const CONTRACT_REGISTRY: Record<string, ContractTypeEntry> = {

  // ── 1. DeliveryPayment ──────────────────────────────────────────────────
  DeliveryPayment: {
    schema: {
      namespace: "org.accordproject.deliverypayment",
      conceptName: "DeliveryPaymentContract",
      description: "A contract for delivery of goods with payment terms",
      fields: {
        buyer: {
          type: "String",
          required: true,
          description: "Full legal name of the buyer party",
        },
        seller: {
          type: "String",
          required: true,
          description: "Full legal name of the seller party",
        },
        deliveryItem: {
          type: "String",
          required: true,
          description: "Description of goods being delivered",
        },
        deliveryDate: {
          type: "DateTime",
          required: true,
          description: "Agreed delivery date (ISO 8601)",
        },
        paymentAmount: {
          type: "Double",
          required: true,
          description: "Total payment amount in numeric form",
        },
        currency: {
          type: "String",
          required: true,
          description: "ISO 4217 currency code (e.g. USD, EUR, INR)",
          enum: ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"],
        },
        paymentDueDays: {
          type: "Integer",
          required: true,
          description: "Number of days after delivery that payment is due",
        },
        deliveryLocation: {
          type: "String",
          required: false,
          description: "Physical delivery address or location name",
        },
      },
    },
    templateRules: {
      buyer: {
        binding: "{{buyer}}",
        label: "Buyer name",
      },
      seller: {
        binding: "{{seller}}",
        label: "Seller name",
      },
      deliveryItem: {
        binding: "{{deliveryItem}}",
        label: "Delivery item",
      },
      deliveryDate: {
        binding: "{{deliveryDate as \"D MMMM YYYY\"}}",
        label: "Delivery date",
      },
      paymentAmount: {
        binding: "{{paymentAmount}}",
        label: "Payment amount",
      },
      currency: {
        binding: "{{currency}}",
        label: "Currency code",
      },
      paymentDueDays: {
        binding: "{{paymentDueDays}}",
        label: "Payment due days",
      },
      deliveryLocation: {
        binding: "{{deliveryLocation}}",
        label: "Delivery location",
      },
    },
    validationRules: [
      {
        id: "DP-001",
        description: "paymentAmount must be greater than zero",
        check: (ir) =>
          (ir.paymentAmount as number) <= 0
            ? "paymentAmount must be > 0"
            : null,
      },
      {
        id: "DP-002",
        description: "paymentDueDays must be a positive integer",
        check: (ir) =>
          (ir.paymentDueDays as number) < 1
            ? "paymentDueDays must be >= 1"
            : null,
      },
      {
        id: "DP-003",
        description: "buyer and seller must be different parties",
        check: (ir) =>
          ir.buyer === ir.seller
            ? "buyer and seller cannot be the same entity"
            : null,
      },
    ],
  },

  // ── 2. ServiceAgreement ─────────────────────────────────────────────────
  ServiceAgreement: {
    schema: {
      namespace: "org.accordproject.serviceagreement",
      conceptName: "ServiceAgreementContract",
      description: "A contract for professional services between a provider and a client",
      fields: {
        serviceProvider: {
          type: "String",
          required: true,
          description: "Full legal name of the service provider",
        },
        client: {
          type: "String",
          required: true,
          description: "Full legal name of the client",
        },
        serviceDescription: {
          type: "String",
          required: true,
          description: "Detailed description of services to be rendered",
        },
        startDate: {
          type: "DateTime",
          required: true,
          description: "Service commencement date (ISO 8601)",
        },
        endDate: {
          type: "DateTime",
          required: false,
          description: "Service end date (ISO 8601), if fixed-term",
        },
        ratePerHour: {
          type: "Double",
          required: false,
          description: "Hourly billing rate in the specified currency",
        },
        fixedFee: {
          type: "Double",
          required: false,
          description: "Fixed total fee if not hourly billing",
        },
        currency: {
          type: "String",
          required: true,
          description: "ISO 4217 currency code",
          enum: ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"],
        },
        paymentFrequency: {
          type: "String",
          required: true,
          description: "How often payments are made",
          enum: ["WEEKLY", "BIWEEKLY", "MONTHLY", "MILESTONE", "ON_COMPLETION"],
        },
        governingLaw: {
          type: "String",
          required: false,
          description: "Jurisdiction / governing law (e.g. 'State of California')",
        },
      },
    },
    templateRules: {
      serviceProvider: {
        binding: "{{serviceProvider}}",
        label: "Service provider name",
      },
      client: {
        binding: "{{client}}",
        label: "Client name",
      },
      serviceDescription: {
        binding: "{{serviceDescription}}",
        label: "Service description",
      },
      startDate: {
        binding: "{{startDate as \"D MMMM YYYY\"}}",
        label: "Start date",
      },
      endDate: {
        binding: "{{endDate as \"D MMMM YYYY\"}}",
        label: "End date",
      },
      ratePerHour: {
        binding: "{{ratePerHour}}",
        label: "Hourly rate",
      },
      fixedFee: {
        binding: "{{fixedFee}}",
        label: "Fixed fee",
      },
      currency: {
        binding: "{{currency}}",
        label: "Currency",
      },
      paymentFrequency: {
        binding: "{{paymentFrequency}}",
        label: "Payment frequency",
      },
      governingLaw: {
        binding: "{{governingLaw}}",
        label: "Governing law",
      },
    },
    validationRules: [
      {
        id: "SA-001",
        description: "Either ratePerHour or fixedFee must be provided (not neither)",
        check: (ir) =>
          !ir.ratePerHour && !ir.fixedFee
            ? "At least one of ratePerHour or fixedFee must be specified"
            : null,
      },
      {
        id: "SA-002",
        description: "serviceProvider and client must be different",
        check: (ir) =>
          ir.serviceProvider === ir.client
            ? "serviceProvider and client cannot be the same entity"
            : null,
      },
      {
        id: "SA-003",
        description: "endDate, if present, must be after startDate",
        check: (ir) => {
          if (!ir.endDate || !ir.startDate) return null;
          return new Date(ir.endDate as string) <= new Date(ir.startDate as string)
            ? "endDate must be after startDate"
            : null;
        },
      },
    ],
  },

  // ── 3. LatePenalty ──────────────────────────────────────────────────────
  LatePenalty: {
    schema: {
      namespace: "org.accordproject.latepenalty",
      conceptName: "LatePenaltyContract",
      description: "A clause defining penalties for late delivery or payment",
      fields: {
        obligorParty: {
          type: "String",
          required: true,
          description: "Party who owes the obligation (and may incur penalty)",
        },
        obligeeParty: {
          type: "String",
          required: true,
          description: "Party who is owed the obligation",
        },
        obligationType: {
          type: "String",
          required: true,
          description: "What the obligation is about",
          enum: ["DELIVERY", "PAYMENT", "MILESTONE"],
        },
        gracePeriodDays: {
          type: "Integer",
          required: true,
          description: "Number of days after due date before penalty starts",
        },
        penaltyRatePercent: {
          type: "Double",
          required: true,
          description: "Penalty rate as a percentage per period (e.g. 1.5 for 1.5%)",
        },
        penaltyPeriod: {
          type: "String",
          required: true,
          description: "Period over which penalty rate applies",
          enum: ["DAILY", "WEEKLY", "MONTHLY"],
        },
        maxPenaltyPercent: {
          type: "Double",
          required: false,
          description: "Cap on total penalty as percentage of original obligation",
        },
        currency: {
          type: "String",
          required: true,
          description: "ISO 4217 currency code",
          enum: ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"],
        },
      },
    },
    templateRules: {
      obligorParty: {
        binding: "{{obligorParty}}",
        label: "Obligor (penalised party)",
      },
      obligeeParty: {
        binding: "{{obligeeParty}}",
        label: "Obligee (receiving party)",
      },
      obligationType: {
        binding: "{{obligationType}}",
        label: "Obligation type",
      },
      gracePeriodDays: {
        binding: "{{gracePeriodDays}}",
        label: "Grace period (days)",
      },
      penaltyRatePercent: {
        binding: "{{penaltyRatePercent}}",
        label: "Penalty rate (%)",
      },
      penaltyPeriod: {
        binding: "{{penaltyPeriod}}",
        label: "Penalty period",
      },
      maxPenaltyPercent: {
        binding: "{{maxPenaltyPercent}}",
        label: "Maximum penalty cap (%)",
      },
      currency: {
        binding: "{{currency}}",
        label: "Currency",
      },
    },
    validationRules: [
      {
        id: "LP-001",
        description: "penaltyRatePercent must be between 0.01 and 100",
        check: (ir) => {
          const r = ir.penaltyRatePercent as number;
          return r <= 0 || r > 100
            ? "penaltyRatePercent must be between 0.01 and 100"
            : null;
        },
      },
      {
        id: "LP-002",
        description: "gracePeriodDays must be >= 0",
        check: (ir) =>
          (ir.gracePeriodDays as number) < 0
            ? "gracePeriodDays must be >= 0"
            : null,
      },
      {
        id: "LP-003",
        description: "maxPenaltyPercent, if set, must be > penaltyRatePercent",
        check: (ir) => {
          if (!ir.maxPenaltyPercent) return null;
          return (ir.maxPenaltyPercent as number) <= (ir.penaltyRatePercent as number)
            ? "maxPenaltyPercent must exceed penaltyRatePercent"
            : null;
        },
      },
      {
        id: "LP-004",
        description: "obligorParty and obligeeParty must be different",
        check: (ir) =>
          ir.obligorParty === ir.obligeeParty
            ? "obligorParty and obligeeParty cannot be the same entity"
            : null,
      },
    ],
  },
};

/** Retrieve a registry entry or throw */
export function getContractType(contractType: string): ContractTypeEntry {
  const entry = CONTRACT_REGISTRY[contractType];
  if (!entry) {
    throw new Error(
      `Unknown contractType "${contractType}". Supported types: ${Object.keys(CONTRACT_REGISTRY).join(", ")}`
    );
  }
  return entry;
}

/** List all registered contract type names */
export function listContractTypes(): string[] {
  return Object.keys(CONTRACT_REGISTRY);
}
