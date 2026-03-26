/**
 * Test Fixtures
 * -------------
 * Covers all five fixture categories per the spec (Step 9):
 *   1. Clean input
 *   2. Paraphrased input
 *   3. Incomplete input
 *   4. Nested condition input
 *   5. Wrong actor input
 *
 * Each fixture pair contains the raw contract text and the expected IR fields,
 * allowing the test runner to assert both semantic correctness and rejection.
 */

import type { IRFields } from "../../ir/types.js";

export interface TestFixture {
  id: string;
  category: "clean" | "paraphrased" | "incomplete" | "nested_condition" | "wrong_actor";
  contractType: string;
  description: string;
  contractText: string;
  /** Expected fields in the extracted IR (null values for missing) */
  expectedFields: Partial<IRFields>;
  /** Whether this fixture should produce a valid IR */
  expectsValid: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DeliveryPayment Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export const DELIVERY_PAYMENT_FIXTURES: TestFixture[] = [
  {
    id: "DP-clean-001",
    category: "clean",
    contractType: "DeliveryPayment",
    description: "Well-structured delivery payment agreement",
    contractText: `DELIVERY AND PAYMENT AGREEMENT

This agreement is entered into between Acme Corp ("Buyer") and Global Supplies Ltd ("Seller").

Seller agrees to deliver 500 units of industrial-grade steel pipe to Warehouse 4, Chicago, IL 
by September 15, 2025.

In consideration of such delivery, Buyer shall pay Seller USD 48,500 within 30 days 
following the confirmed delivery date.`,
    expectedFields: {
      buyer: "Acme Corp",
      seller: "Global Supplies Ltd",
      deliveryItem: "500 units of industrial-grade steel pipe",
      deliveryDate: "2025-09-15T00:00:00.000Z",
      paymentAmount: 48500,
      currency: "USD",
      paymentDueDays: 30,
      deliveryLocation: "Warehouse 4, Chicago, IL",
    },
    expectsValid: true,
  },

  {
    id: "DP-para-001",
    category: "paraphrased",
    contractType: "DeliveryPayment",
    description: "Same deal expressed with non-standard phrasing",
    contractText: `The vendor, TechParts Inc, will ship 200 circuit board assemblies to the purchaser, 
NexGen Electronics, no later than the first of November 2025. NexGen shall remit payment 
of fifteen thousand euros (EUR 15,000) within forty-five (45) days of receipt. Delivery 
will be made to the Frankfurt distribution hub.`,
    expectedFields: {
      buyer: "NexGen Electronics",
      seller: "TechParts Inc",
      deliveryItem: "200 circuit board assemblies",
      paymentAmount: 15000,
      currency: "EUR",
      paymentDueDays: 45,
      deliveryLocation: "Frankfurt distribution hub",
    },
    expectsValid: true,
  },

  {
    id: "DP-incomplete-001",
    category: "incomplete",
    contractType: "DeliveryPayment",
    description: "Missing delivery date and payment due days — should fail validation",
    contractText: `BestBuy Logistics will deliver office furniture to OfficeWorld Ltd.
Payment of USD 8,200 will be made upon receipt of goods.`,
    expectedFields: {
      buyer: "OfficeWorld Ltd",
      seller: "BestBuy Logistics",
      deliveryItem: "office furniture",
      paymentAmount: 8200,
      currency: "USD",
      deliveryDate: null,
      paymentDueDays: null,
    },
    expectsValid: false,
  },

  {
    id: "DP-nested-001",
    category: "nested_condition",
    contractType: "DeliveryPayment",
    description: "Conditional delivery clause with partial shipment terms",
    contractText: `CONDITIONAL DELIVERY AGREEMENT

SteelWorks GmbH ("Seller") shall deliver 1,000 metric tonnes of structural steel to 
BuildRight Construction ("Buyer") at the Hamburg port facility by March 1, 2026.
  
Delivery may be split into two equal shipments. In the event of a split shipment, 
the first payment of EUR 75,000 shall be due 30 days after the first delivery, 
with a second payment of EUR 75,000 due 30 days after the second delivery.

For purposes of this agreement, the primary payment obligation is EUR 75,000 due 
30 days after initial delivery.`,
    expectedFields: {
      buyer: "BuildRight Construction",
      seller: "SteelWorks GmbH",
      deliveryItem: "1,000 metric tonnes of structural steel",
      currency: "EUR",
      paymentDueDays: 30,
    },
    expectsValid: true,
  },

  {
    id: "DP-wrongactor-001",
    category: "wrong_actor",
    contractType: "DeliveryPayment",
    description: "Buyer and seller have the same name — should fail business rule DP-003",
    contractText: `Acme Corp agrees to deliver 100 laptops to Acme Corp for a price of USD 120,000 
to be paid within 15 days of delivery.`,
    expectedFields: {
      buyer: "Acme Corp",
      seller: "Acme Corp",
      paymentAmount: 120000,
      currency: "USD",
      paymentDueDays: 15,
    },
    expectsValid: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ServiceAgreement Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export const SERVICE_AGREEMENT_FIXTURES: TestFixture[] = [
  {
    id: "SA-clean-001",
    category: "clean",
    contractType: "ServiceAgreement",
    description: "Standard software development service agreement",
    contractText: `SOFTWARE DEVELOPMENT SERVICES AGREEMENT

This agreement is between DevCraft Solutions Inc ("Service Provider") and RetailNow Pvt Ltd ("Client").

DevCraft Solutions shall develop a full-stack e-commerce web application for RetailNow.
Services will commence on July 1, 2025 and conclude on December 31, 2025.

The total fixed fee is USD 120,000 payable on a milestone basis.
This agreement is governed by the laws of the State of Delaware.`,
    expectedFields: {
      serviceProvider: "DevCraft Solutions Inc",
      client: "RetailNow Pvt Ltd",
      serviceDescription: "full-stack e-commerce web application development",
      startDate: "2025-07-01T00:00:00.000Z",
      endDate: "2025-12-31T00:00:00.000Z",
      fixedFee: 120000,
      currency: "USD",
      paymentFrequency: "MILESTONE",
      governingLaw: "State of Delaware",
    },
    expectsValid: true,
  },

  {
    id: "SA-para-001",
    category: "paraphrased",
    contractType: "ServiceAgreement",
    description: "Consulting engagement with hourly rate, informal language",
    contractText: `Raj Consulting (the consultant) will provide data science advisory work for 
HealthTech Corp starting August 2025. The engagement is open-ended. Raj will bill 
INR 12,000 per hour, with invoices sent monthly. No specific end date is set.`,
    expectedFields: {
      serviceProvider: "Raj Consulting",
      client: "HealthTech Corp",
      ratePerHour: 12000,
      currency: "INR",
      paymentFrequency: "MONTHLY",
      endDate: null,
    },
    expectsValid: true,
  },

  {
    id: "SA-incomplete-001",
    category: "incomplete",
    contractType: "ServiceAgreement",
    description: "Missing start date and all fee information — should fail validation",
    contractText: `BrandCo will provide marketing consulting services to StartupX. 
Payments will be made in USD on completion.`,
    expectedFields: {
      serviceProvider: "BrandCo",
      client: "StartupX",
      currency: "USD",
      paymentFrequency: "ON_COMPLETION",
      startDate: null,
      ratePerHour: null,
      fixedFee: null,
    },
    expectsValid: false,
  },

  {
    id: "SA-nested-001",
    category: "nested_condition",
    contractType: "ServiceAgreement",
    description: "Service agreement with conditional extension clause",
    contractText: `MANAGED SERVICES AGREEMENT

CloudOps Ltd ("Service Provider") will provide cloud infrastructure management 
to FinanceGroup ("Client") beginning January 1, 2026 through June 30, 2026, 
with an option for a 6-month extension subject to mutual agreement.

Base fee: USD 18,000 per month, billed monthly.
An optional performance bonus of up to USD 5,000 per quarter may apply if SLAs are met.
This agreement is governed by the laws of England and Wales.`,
    expectedFields: {
      serviceProvider: "CloudOps Ltd",
      client: "FinanceGroup",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-06-30T00:00:00.000Z",
      currency: "USD",
      paymentFrequency: "MONTHLY",
      governingLaw: "England and Wales",
    },
    expectsValid: true,
  },

  {
    id: "SA-wrongactor-001",
    category: "wrong_actor",
    contractType: "ServiceAgreement",
    description: "Provider and client are the same — should fail SA-002",
    contractText: `Omega Corp will provide consulting services to Omega Corp starting March 2026 
at a fixed fee of USD 50,000 payable on completion.`,
    expectedFields: {
      serviceProvider: "Omega Corp",
      client: "Omega Corp",
      fixedFee: 50000,
      currency: "USD",
      paymentFrequency: "ON_COMPLETION",
    },
    expectsValid: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LatePenalty Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export const LATE_PENALTY_FIXTURES: TestFixture[] = [
  {
    id: "LP-clean-001",
    category: "clean",
    contractType: "LatePenalty",
    description: "Clear late delivery penalty clause",
    contractText: `LATE DELIVERY PENALTY CLAUSE

This clause applies between FastFreight Logistics ("Obligor") and Nexus Retail Group ("Obligee").

In the event that FastFreight fails to deliver goods on the agreed delivery date, a grace 
period of 3 calendar days shall apply. After the grace period, a late penalty of 1.5% 
per week shall accrue on the invoice value. The total penalty shall not exceed 15% 
of the original invoice amount. All amounts are denominated in USD.`,
    expectedFields: {
      obligorParty: "FastFreight Logistics",
      obligeeParty: "Nexus Retail Group",
      obligationType: "DELIVERY",
      gracePeriodDays: 3,
      penaltyRatePercent: 1.5,
      penaltyPeriod: "WEEKLY",
      maxPenaltyPercent: 15,
      currency: "USD",
    },
    expectsValid: true,
  },

  {
    id: "LP-para-001",
    category: "paraphrased",
    contractType: "LatePenalty",
    description: "Same clause with informal phrasing",
    contractText: `If the contractor (BuildFast Ltd) doesn't finish by the milestone date, 
the project owner (CityWorks Authority) can charge a daily delay fee of 0.5% of the contract 
sum for each day of delay, up to a cap of 10% total. No grace period applies. 
Payment obligations are in GBP.`,
    expectedFields: {
      obligorParty: "BuildFast Ltd",
      obligeeParty: "CityWorks Authority",
      obligationType: "MILESTONE",
      gracePeriodDays: 0,
      penaltyRatePercent: 0.5,
      penaltyPeriod: "DAILY",
      maxPenaltyPercent: 10,
      currency: "GBP",
    },
    expectsValid: true,
  },

  {
    id: "LP-incomplete-001",
    category: "incomplete",
    contractType: "LatePenalty",
    description: "Missing penalty rate — should fail validation",
    contractText: `If payment is not made on time, a late payment penalty will apply after 
a 5-day grace period. The penalty applies per month. Currency: USD.`,
    expectedFields: {
      obligationType: "PAYMENT",
      gracePeriodDays: 5,
      penaltyPeriod: "MONTHLY",
      currency: "USD",
      penaltyRatePercent: null,
      obligorParty: null,
      obligeeParty: null,
    },
    expectsValid: false,
  },

  {
    id: "LP-nested-001",
    category: "nested_condition",
    contractType: "LatePenalty",
    description: "Tiered penalty with escalation — LLM must extract primary rate",
    contractText: `GRADUATED LATE PAYMENT CLAUSE

If CargoLink Ltd ("Obligor") fails to pay SuppliersHub ("Obligee") on time:
- Days 1-7: no penalty (grace period)
- Days 8-30: 1.0% per month on outstanding balance
- Days 31+: 2.0% per month on outstanding balance (escalated rate)

For the purposes of this clause, the standard penalty rate is 1.0% per month.
Maximum aggregate penalty is capped at 20%. All in EUR.`,
    expectedFields: {
      obligorParty: "CargoLink Ltd",
      obligeeParty: "SuppliersHub",
      obligationType: "PAYMENT",
      gracePeriodDays: 7,
      penaltyRatePercent: 1.0,
      penaltyPeriod: "MONTHLY",
      maxPenaltyPercent: 20,
      currency: "EUR",
    },
    expectsValid: true,
  },

  {
    id: "LP-wrongactor-001",
    category: "wrong_actor",
    contractType: "LatePenalty",
    description: "Same party on both sides — should fail LP-004",
    contractText: `PenaltyCo will charge PenaltyCo a 2% weekly penalty for late delivery 
with a 2-day grace period, capped at 20%, in USD.`,
    expectedFields: {
      obligorParty: "PenaltyCo",
      obligeeParty: "PenaltyCo",
      gracePeriodDays: 2,
      penaltyRatePercent: 2.0,
      penaltyPeriod: "WEEKLY",
      maxPenaltyPercent: 20,
      currency: "USD",
    },
    expectsValid: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Combined export
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_FIXTURES: TestFixture[] = [
  ...DELIVERY_PAYMENT_FIXTURES,
  ...SERVICE_AGREEMENT_FIXTURES,
  ...LATE_PENALTY_FIXTURES,
];

export function getFixturesByType(contractType: string): TestFixture[] {
  return ALL_FIXTURES.filter((f) => f.contractType === contractType);
}

export function getFixturesByCategory(
  category: TestFixture["category"]
): TestFixture[] {
  return ALL_FIXTURES.filter((f) => f.category === category);
}
