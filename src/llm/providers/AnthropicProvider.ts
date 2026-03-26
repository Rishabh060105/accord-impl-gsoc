/**
 * Anthropic LLM Provider
 * ----------------------
 * Uses Claude (claude-sonnet-4-20250514) for IR extraction and repair.
 * Relies on the centralised prompt builder so instructions stay consistent
 * across all providers.
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

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens ?? 2048;
  }

  private async callAPI(userPrompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Anthropic API returned no text block");
    }

    return textBlock.text.trim();
  }

  private parseJSON(raw: string): IRFields {
    // Strip markdown fences if the model wraps the JSON
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned) as IRFields;
    } catch (err) {
      throw new Error(`Failed to parse LLM JSON response: ${String(err)}\nRaw: ${raw}`);
    }
  }

  async identifyContractType(
    input: string,
    knownTypes: string[]
  ): Promise<string | null> {
    const prompt = buildIdentificationPrompt(input, knownTypes);
    const raw = await this.callAPI(prompt);
    const trimmed = raw.trim().replace(/^"|"$/g, ""); // strip surrounding quotes if any
    if (trimmed === "null" || !knownTypes.includes(trimmed)) return null;
    return trimmed;
  }

  async extractIR(
    input: string,
    schema: ContractSchema
  ): Promise<IRFields> {
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
