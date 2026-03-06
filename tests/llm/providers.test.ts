import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../../src/llm/providers/anthropic";
import { OpenAIProvider } from "../../src/llm/providers/openai";
import { GoogleProvider } from "../../src/llm/providers/google";
import { createProvider } from "../../src/llm";

// Mock the SDKs
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "anthropic response" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  })),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "openai response" } }],
          usage: { prompt_tokens: 15, completion_tokens: 25 },
        }),
      },
    },
  })),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => "google response",
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 22 },
        },
      }),
    }),
  })),
}));

describe("AnthropicProvider", () => {
  it("maps request and response correctly", async () => {
    const provider = new AnthropicProvider("test-key");
    const response = await provider.chat({
      model: "claude-sonnet-4-6",
      maxTokens: 512,
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.text).toBe("anthropic response");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(20);
  });
});

describe("OpenAIProvider", () => {
  it("maps request and response correctly", async () => {
    const provider = new OpenAIProvider("test-key");
    const response = await provider.chat({
      model: "gpt-4o-mini",
      maxTokens: 512,
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.text).toBe("openai response");
    expect(response.usage.inputTokens).toBe(15);
    expect(response.usage.outputTokens).toBe(25);
  });
});

describe("GoogleProvider", () => {
  it("maps request and response correctly", async () => {
    const provider = new GoogleProvider("test-key");
    const response = await provider.chat({
      model: "gemini-2.0-flash",
      maxTokens: 512,
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.text).toBe("google response");
    expect(response.usage.inputTokens).toBe(12);
    expect(response.usage.outputTokens).toBe(22);
  });
});

describe("createProvider", () => {
  it("creates AnthropicProvider for 'anthropic'", () => {
    const provider = createProvider("anthropic", "test-key");
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("creates OpenAIProvider for 'openai'", () => {
    const provider = createProvider("openai", "test-key");
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("creates GoogleProvider for 'google'", () => {
    const provider = createProvider("google", "test-key");
    expect(provider).toBeInstanceOf(GoogleProvider);
  });

  it("throws for unknown provider", () => {
    expect(() => createProvider("unknown", "test-key")).toThrow(
      'Unknown LLM provider: "unknown"'
    );
  });
});
