import type { LLMClient } from "./types";
import { AnthropicClient } from "./anthropic";
import { OpenAIClient } from "./openai";

export type LLMProvider = "anthropic" | "openai";

export function createLLMClient(
  provider: LLMProvider,
  apiKey: string,
  baseURL?: string
): LLMClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(apiKey);
    case "openai":
      return new OpenAIClient(apiKey, baseURL);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
