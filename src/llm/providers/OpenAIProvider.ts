/**
 * OpenAI LLM Provider
 * -------------------
 * Uses GPT-4o (or any OpenAI-compatible model) via the chat completions API.
 * Requests JSON mode for reliable structured output.
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

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseURL?: string; // Allows OpenAI-compatible proxies
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseURL: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-4o";
    this.maxTokens = config.maxTokens ?? 2048;
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
  }

  private async callAPI(userPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI API returned no content");
    }

    return content.trim();
  }

  private parseJSON(raw: string): IRFields {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned) as IRFields;
    } catch (err) {
      throw new Error(`Failed to parse OpenAI JSON response: ${String(err)}\nRaw: ${raw}`);
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
