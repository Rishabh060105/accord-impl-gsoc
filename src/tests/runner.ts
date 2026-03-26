/**
 * Test Runner
 * -----------
 * Runs all test fixtures through the AccordPipeline with the MockProvider.
 * Reports pass/fail per fixture with clear output.
 *
 * Usage: npx ts-node src/tests/runner.ts
 */

import { AccordPipeline } from "../pipeline/pipeline.js";
import { MockProvider } from "../llm/providers/MockProvider.js";
import { ALL_FIXTURES, type TestFixture } from "./fixtures/fixtures.js";

interface TestResult {
  fixtureId: string;
  category: string;
  contractType: string;
  passed: boolean;
  notes: string[];
}

async function runFixture(
  fixture: TestFixture,
  pipeline: AccordPipeline
): Promise<TestResult> {
  const notes: string[] = [];

  try {
    const result = await pipeline.run(fixture.contractText);

    // Check: did validity match expectation?
    const validityMatch = result.success === fixture.expectsValid;
    if (!validityMatch) {
      notes.push(
        `Expected success=${fixture.expectsValid}, got success=${result.success}`
      );
      if (!result.success && result.errorSummary) {
        notes.push(`Errors: ${result.errorSummary}`);
      }
    }

    // Check: do expected fields match extracted IR (only if valid)?
    if (result.success && fixture.expectsValid) {
      for (const [key, expectedVal] of Object.entries(fixture.expectedFields)) {
        const actualVal = result.ir.fields[key];
        const resolvedActual =
          actualVal !== undefined
            ? typeof actualVal === "object" &&
              actualVal !== null &&
              "__ambiguous" in actualVal
              ? (actualVal as { value: unknown }).value
              : actualVal
            : undefined;

        if (expectedVal !== null && resolvedActual !== expectedVal) {
          notes.push(
            `Field "${key}": expected "${String(expectedVal)}", got "${String(resolvedActual)}"`
          );
        }
      }
    }

    // Warnings are non-fatal but logged
    if (result.validationResult.warnings.length > 0) {
      for (const w of result.validationResult.warnings) {
        notes.push(`WARN: ${w}`);
      }
    }

    return {
      fixtureId: fixture.id,
      category: fixture.category,
      contractType: fixture.contractType,
      passed: validityMatch && notes.filter((n) => !n.startsWith("WARN")).length === 0,
      notes,
    };
  } catch (err) {
    return {
      fixtureId: fixture.id,
      category: fixture.category,
      contractType: fixture.contractType,
      passed: false,
      notes: [`Exception: ${String(err)}`],
    };
  }
}

function printSummary(results: TestResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ACCORD PIPELINE TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════");

  // Group by contract type
  const byType: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!byType[r.contractType]) byType[r.contractType] = [];
    byType[r.contractType].push(r);
  }

  for (const [type, typeResults] of Object.entries(byType)) {
    console.log(`\n  ┌─ ${type}`);
    for (const r of typeResults) {
      const icon = r.passed ? "✅" : "❌";
      const cat = r.category.padEnd(18);
      console.log(`  │  ${icon} [${cat}] ${r.fixtureId}`);
      for (const note of r.notes) {
        const prefix = note.startsWith("WARN") ? "  ⚠️ " : "       ";
        console.log(`  │       ${prefix}${note}`);
      }
    }
    const typePassed = typeResults.filter((r) => r.passed).length;
    console.log(`  └─ ${typePassed}/${typeResults.length} passed`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  TOTAL: ${passed}/${total} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════\n");
}

async function main(): Promise<void> {
  console.log("\nAccord Pipeline — Test Run");
  console.log("Provider: MockProvider");
  console.log(`Fixtures : ${ALL_FIXTURES.length}`);
  console.log("─────────────────────────────────────────────────────");

  const provider = new MockProvider();
  const pipeline = new AccordPipeline(provider, { verbose: false, maxRepairPasses: 2 });

  const results: TestResult[] = [];

  for (const fixture of ALL_FIXTURES) {
    // For incomplete/wrong_actor fixtures, use mock that knows the contract type
    const fixturePipeline = new AccordPipeline(
      new MockProvider(),
      {
        forceContractType: fixture.contractType,
        maxRepairPasses: 2,
        verbose: false,
      }
    );

    const result = await runFixture(fixture, fixturePipeline);
    results.push(result);
    process.stdout.write(result.passed ? "." : "F");
  }

  console.log("");
  printSummary(results);
}

main().catch(console.error);
