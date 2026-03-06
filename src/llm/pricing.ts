import * as core from "@actions/core";

export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Anthropic
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4.0 },
  "claude-opus-4-6": { inputPer1M: 15.0, outputPer1M: 75.0 },
  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
};

const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-6"];

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    core.warning(`No pricing found for model "${model}"; cost estimates may be inaccurate.`);
  }
  const effectivePricing = pricing ?? DEFAULT_PRICING;
  return (inputTokens * effectivePricing.inputPer1M + outputTokens * effectivePricing.outputPer1M) / 1_000_000;
}
