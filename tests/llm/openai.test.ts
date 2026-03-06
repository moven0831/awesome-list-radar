import { describe, it, expect, vi } from "vitest";
import { OpenAIClient } from "../../src/llm/openai";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe("OpenAIClient", () => {
  it("translates system param to system message and calls completions.create", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const client = new OpenAIClient("test-key");
    const response = await client.chat({
      model: "gpt-4o",
      max_tokens: 512,
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ],
    });

    expect(response.text).toBe("Hello");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("handles missing usage gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Response" } }],
      usage: undefined,
    });

    const client = new OpenAIClient("test-key");
    const response = await client.chat({
      model: "gpt-4o",
      max_tokens: 512,
      system: "System",
      messages: [{ role: "user", content: "Test" }],
    });

    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
  });

  it("handles empty choices", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });

    const client = new OpenAIClient("test-key");
    const response = await client.chat({
      model: "gpt-4o",
      max_tokens: 512,
      system: "System",
      messages: [{ role: "user", content: "Test" }],
    });

    expect(response.text).toBe("");
  });

  it("passes baseURL to OpenAI constructor", async () => {
    const openaiModule = await import("openai");
    const OpenAIMock = openaiModule.default as unknown as ReturnType<typeof vi.fn>;
    OpenAIMock.mockClear();

    new OpenAIClient("test-key", "https://api.groq.com/openai/v1");

    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://api.groq.com/openai/v1",
    });
  });
});
