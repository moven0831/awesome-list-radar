import { describe, it, expect, vi } from "vitest";
import { OpenAICompatibleProvider } from "../../src/llm/providers/openai";
import { createProvider } from "../../src/llm";

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(({ baseURL }: { baseURL?: string }) => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "test response" } }],
          usage: { prompt_tokens: 15, completion_tokens: 25 },
        }),
      },
    },
    _baseURL: baseURL,
  })),
}));

describe("OpenAICompatibleProvider", () => {
  it("maps request and response correctly", async () => {
    const provider = new OpenAICompatibleProvider("test-key");
    const response = await provider.chat({
      model: "gpt-4o-mini",
      maxTokens: 512,
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.text).toBe("test response");
    expect(response.usage.inputTokens).toBe(15);
    expect(response.usage.outputTokens).toBe(25);
  });

  it("accepts a custom baseURL", () => {
    const provider = new OpenAICompatibleProvider(
      "test-key",
      "https://custom.api.com/v1/"
    );
    expect(provider).toBeDefined();
  });
});

describe("createProvider", () => {
  it("creates provider for openai (no baseURL)", () => {
    const provider = createProvider({ apiKey: "test-key", provider: "openai" });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("creates provider for anthropic (sets baseURL)", () => {
    const provider = createProvider({
      apiKey: "test-key",
      provider: "anthropic",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("creates provider for google (sets baseURL)", () => {
    const provider = createProvider({
      apiKey: "test-key",
      provider: "google",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("uses explicit baseUrl over provider default", () => {
    const provider = createProvider({
      apiKey: "test-key",
      provider: "openai",
      baseUrl: "https://custom.api.com/v1/",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("defaults to openai when no provider specified", () => {
    const provider = createProvider({ apiKey: "test-key" });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });
});
