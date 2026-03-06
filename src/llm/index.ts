export type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import type { LLMProvider } from "./types";

export function createProvider(provider: string, apiKey: string): LLMProvider {
  switch (provider) {
    case "anthropic": {
      const { AnthropicProvider } = require("./providers/anthropic");
      return new AnthropicProvider(apiKey);
    }
    case "openai": {
      const { OpenAIProvider } = require("./providers/openai");
      return new OpenAIProvider(apiKey);
    }
    case "google": {
      const { GoogleProvider } = require("./providers/google");
      return new GoogleProvider(apiKey);
    }
    default:
      throw new Error(
        `Unknown LLM provider: "${provider}". Supported providers: anthropic, openai, google`
      );
  }
}
