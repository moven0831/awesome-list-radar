import { describe, it, expect, vi } from "vitest";
import { createLLMClient } from "../../src/llm/factory";
import { AnthropicClient } from "../../src/llm/anthropic";
import { OpenAIClient } from "../../src/llm/openai";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

describe("createLLMClient", () => {
  it("returns AnthropicClient for 'anthropic' provider", () => {
    const client = createLLMClient("anthropic", "test-key");
    expect(client).toBeInstanceOf(AnthropicClient);
  });

  it("returns OpenAIClient for 'openai' provider", () => {
    const client = createLLMClient("openai", "test-key");
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it("returns OpenAIClient with baseURL for 'openai' provider", () => {
    const client = createLLMClient("openai", "test-key", "https://api.groq.com/openai/v1");
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it("throws on unsupported provider", () => {
    expect(() => createLLMClient("gemini" as any, "test-key")).toThrow(
      "Unsupported LLM provider: gemini"
    );
  });
});
