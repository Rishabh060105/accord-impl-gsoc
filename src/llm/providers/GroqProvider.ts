/**
 * Groq LLM Provider
 * -----------------
 * Groq is the first production backend per the implementation spec.
 * Uses the OpenAI-compatible Groq chat completions endpoint with
 * the llama-3.3-70b-versatile model by default.
 */

import type { LLMProvider, ValidationError } from "../interface.js";
import type { IR, IRFields } from "../../ir/types.js";
import type { ContractSchema } from "../../registry/contractTypes.js";
import {
  buildSystemPrompt,
  buildExtractionPrompt,
  buildRepairPrompt,
  buildIdentificationPrompt,
} from "../prompts.js";

interface GroqConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: GroqConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "llama-3.3-70b-versatile";
    this.maxTokens = config.maxTokens ?? 2048;
  }

  private async callAPI(userPrompt: string): Promise<string> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
        // Groq supports response_format for reliable JSON output
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq API returned no content");
    }

    return content.trim();
  }

  private parseJSON(raw: string): IRFields {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned) as IRFields;
    } catch (err) {
      throw new Error(`Failed to parse Groq JSON response: ${String(err)}\nRaw: ${raw}`);
    }
  }

  async identifyContractType(
    input: string,
    knownTypes: string[]
  ): Promise<string | null> {
    const prompt = buildIdentificationPrompt(input, knownTypes);
    const raw = await this.callAPI(prompt);
    const trimmed = raw.trim().replace(/^"|"$/g, "");
    if (trimmed === "null" || !knownTypes.includes(trimmed)) return null;
    return trimmed;
  }

  async extractIR(input: string, schema: ContractSchema): Promise<IRFields> {
    const prompt = buildExtractionPrompt(input, schema);
    const raw = await this.callAPI(prompt);
    return this.parseJSON(raw);
  }

  async repairIR(
    input: string,
    errors: ValidationError[],
    currentIR: IR
  ): Promise<IRFields> {
    const prompt = buildRepairPrompt(input, errors, currentIR);
    const raw = await this.callAPI(prompt);
    return this.parseJSON(raw);
  }
}
