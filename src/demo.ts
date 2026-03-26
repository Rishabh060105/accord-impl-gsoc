/**
 * Demo — Full Pipeline End-to-End
 * --------------------------------
 * Runs a sample contract through each of the three supported contract types
 * and prints all generated Accord artifacts.
 *
 * Usage:  node --loader ts-node/esm src/demo.ts
 */

import "dotenv/config";
import { AccordPipeline } from "./pipeline/pipeline.js";
import { MockProvider } from "./llm/providers/MockProvider.js";
import { GroqProvider } from "./llm/providers/GroqProvider.js";
import type { LLMProvider } from "./llm/interface.js";

const SAMPLE_CONTRACTS: Record<string, string> = {
  DeliveryPayment: `
DELIVERY AND PAYMENT AGREEMENT

This agreement is between Acme Corp ("Buyer") and Global Supplies Ltd ("Seller").
Seller shall deliver 500 units of industrial-grade steel pipe to Warehouse 4, Chicago, IL 
by September 15, 2025. Buyer shall pay USD 48,500 within 30 days of delivery.
`,

  ServiceAgreement: `
SOFTWARE DEVELOPMENT SERVICES AGREEMENT

DevCraft Solutions Inc ("Service Provider") will develop a full-stack e-commerce platform 
for RetailNow Pvt Ltd ("Client"). Services run from July 1, 2025 to December 31, 2025.
Total fixed fee: USD 120,000, paid by milestones.
Governed by the laws of the State of Delaware.
`,

  LatePenalty: `
LATE DELIVERY PENALTY CLAUSE

FastFreight Logistics ("Obligor") and Nexus Retail Group ("Obligee").
If delivery is late, a 3-day grace period applies. After that, 1.5% per week penalty 
on the invoice value applies, capped at 15%. All amounts in USD.
`,
};

async function runDemo(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       ACCORD PIPELINE — END-TO-END DEMO              ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  for (const [contractType, text] of Object.entries(SAMPLE_CONTRACTS)) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`CONTRACT TYPE: ${contractType}`);
    console.log("═".repeat(60));

    let provider: LLMProvider;

    if (process.env.USE_GROQ === "true") {
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === "your_groq_api_key_here") {
        throw new Error("GROQ_API_KEY must be set in .env when USE_GROQ is true");
      }
      provider = new GroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL,
      });
      console.log(`[Demo] Using GroqProvider (${process.env.GROQ_MODEL || "default model"})`);
    } else {
      provider = new MockProvider();
      console.log("[Demo] Using MockProvider (set USE_GROQ=true in .env to use Groq)");
    }

    const pipeline = new AccordPipeline(provider, {
      forceContractType: contractType,
      verbose: true,
      maxRepairPasses: 3,
    });

    const result = await pipeline.run(text);

    console.log(`\n▶ Pipeline Result: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);
    console.log(`  Repair passes: ${result.repairPassesUsed}`);

    if (!result.success) {
      console.log(`  Error: ${result.errorSummary}`);
      continue;
    }

    if (result.validationResult.warnings.length > 0) {
      console.log(`  Warnings:`);
      result.validationResult.warnings.forEach((w) => console.log(`    ⚠️  ${w}`));
    }

    console.log("\n── Extracted IR Fields ──────────────────────────────────");
    for (const [k, v] of Object.entries(result.ir.fields)) {
      console.log(`  ${k.padEnd(22)}: ${JSON.stringify(v)}`);
    }

    if (result.artifacts) {
      console.log("\n── model.cto ────────────────────────────────────────────");
      console.log(result.artifacts.modelCto);

      console.log("\n── grammar.tem.md (first 40 lines) ─────────────────────");
      const grammarLines = result.artifacts.grammarTemMd.split("\n").slice(0, 40);
      console.log(grammarLines.join("\n"));

      console.log("\n── logic.ergo ───────────────────────────────────────────");
      console.log(result.artifacts.logicErgo);

      console.log("\n── package.json ─────────────────────────────────────────");
      console.log(result.artifacts.packageJson);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("Demo complete.");
  console.log("═".repeat(60) + "\n");
}

runDemo().catch(console.error);
