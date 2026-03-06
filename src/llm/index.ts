export type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import type { LLMProvider } from "./types";
import { OpenAICompatibleProvider } from "./providers/openai";

const PROVIDER_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  anthropic: "https://api.anthropic.com/v1/",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
};

export function createProvider(options: {
  provider?: string;
  baseUrl?: string;
  apiKey: string;
}): LLMProvider {
  const baseURL =
    options.baseUrl ?? PROVIDER_BASE_URLS[options.provider ?? "openai"];
  return new OpenAICompatibleProvider(options.apiKey, baseURL);
}
