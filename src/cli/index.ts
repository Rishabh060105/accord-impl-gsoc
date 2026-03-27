import "dotenv/config";

import { GroqProvider } from "../llm/providers/GroqProvider.js";
import { MockProvider } from "../llm/providers/MockProvider.js";
import { OpenAIProvider } from "../llm/providers/OpenAIProvider.js";
import { AnthropicProvider } from "../llm/providers/AnthropicProvider.js";
import type { LLMProvider } from "../llm/interface.js";
import { AgenticWorkflowOrchestrator } from "../workflow/orchestrator.js";
import fs from "node:fs";
import path from "node:path";
import type { GeneratedArtifacts } from "../generation/generator.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

interface ParsedArgs {
  requirements: string;
  provider: string;
  model?: string;
  maxRepairs: number;
  forceContractType?: string;
  verbose: boolean;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  
  let requirements = parsed.requirements;
  if (!requirements) {
    requirements = await promptForRequirements();
  }

  if (!requirements) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const provider = buildProvider(parsed.provider, parsed.model);
  const orchestrator = new AgenticWorkflowOrchestrator(provider, {
    forceContractType: parsed.forceContractType,
    maxRepairPasses: parsed.maxRepairs,
    verbose: parsed.verbose,
  });

  const result = await orchestrator.run(requirements);

  if (!result.success) {
    console.error("Workflow failed.");
    if (result.errorSummary) {
      console.error(result.errorSummary);
    }
    process.exitCode = 1;
    return;
  }

  const { context } = result;
  console.log("Accord Agentic Workflow");
  console.log(`Provider: ${provider.name}`);
  console.log(`Contract type: ${context.selectedContractType ?? "Unknown"}`);
  console.log(`Repair passes: ${context.repairPassesUsed}`);

  if (context.validationResult?.warnings.length) {
    console.log(`Warnings: ${context.validationResult.warnings.join(" | ")}`);
  }

  if (context.reviewNotes) {
    console.log("\nReview");
    console.log(context.reviewNotes);
  }

  if (context.artifacts) {
    console.log("\nGenerated artifacts");
    console.log("- model.cto");
    console.log("- grammar.tem.md");
    console.log("- logic.ergo");
    console.log("- package.json");

    saveArtifacts(context.artifacts);
  }
}

function saveArtifacts(artifacts: GeneratedArtifacts): void {
  const outputDir = path.resolve(process.cwd(), "generated");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, "model.cto"), artifacts.modelCto);
  fs.writeFileSync(path.join(outputDir, "grammar.tem.md"), artifacts.grammarTemMd);
  fs.writeFileSync(path.join(outputDir, "logic.ergo"), artifacts.logicErgo);
  fs.writeFileSync(path.join(outputDir, "package.json"), artifacts.packageJson);

  console.log(`\nArtifacts saved to: ${outputDir}`);
}

async function promptForRequirements(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("\nAccord Agentic CLI — Interactive Mode");
    const answer = await rl.question("Enter your template requirements (natural language):\n> ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    requirements: "",
    provider: process.env.DEFAULT_LLM_PROVIDER || "mock",
    maxRepairs: 3,
    verbose: false,
  };

  const requirementsParts: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    switch (arg) {
      case "--provider":
      case "-p":
        parsed.provider = argv[index + 1] ?? parsed.provider;
        index++;
        break;
      case "--model":
      case "-m":
        parsed.model = argv[index + 1];
        index++;
        break;
      case "--max-repairs":
        parsed.maxRepairs = Number(argv[index + 1] ?? parsed.maxRepairs);
        index++;
        break;
      case "--force-contract-type":
        parsed.forceContractType = argv[index + 1];
        index++;
        break;
      case "--verbose":
      case "-v":
        parsed.verbose = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        requirementsParts.push(arg);
        break;
    }
  }

  parsed.requirements = requirementsParts.join(" ").trim();
  return parsed;
}

function buildProvider(providerName: string, model?: string): LLMProvider {
  switch (providerName.toLowerCase()) {
    case "mock":
      return new MockProvider();
    case "groq":
      return new GroqProvider({
        apiKey: requireEnv("GROQ_API_KEY"),
        model,
      });
    case "openai":
      return new OpenAIProvider({
        apiKey: requireEnv("OPENAI_API_KEY"),
        model,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: requireEnv("ANTHROPIC_API_KEY"),
        model,
      });
    default:
      throw new Error(`Unsupported provider "${providerName}". Use mock, groq, openai, or anthropic.`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required for this provider.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage:
  node --loader ts-node/esm src/cli/index.ts [requirements] [options]

  If [requirements] is omitted, the CLI will enter interactive mode.

Options:
  --provider, -p             mock | groq | openai | anthropic
  --model, -m                provider-specific model override
  --max-repairs              maximum repair loop iterations
  --force-contract-type      skip type detection and use a supported type directly
  --verbose, -v              print stage-level logs
  --help, -h                 show this message
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

