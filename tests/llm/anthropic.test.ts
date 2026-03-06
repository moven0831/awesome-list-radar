import { describe, it, expect, vi } from "vitest";
import { AnthropicClient } from "../../src/llm/anthropic";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

describe("AnthropicClient", () => {
  it("translates chat params to Anthropic messages.create call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hello" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const client = new AnthropicClient("test-key");
    const response = await client.chat({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(response.text).toBe("Hello");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("handles missing usage gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Response" }],
      usage: undefined,
    });

    const client = new AnthropicClient("test-key");
    const response = await client.chat({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "System",
      messages: [{ role: "user", content: "Test" }],
    });

    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
  });

  it("returns empty string for non-text content", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "123" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const client = new AnthropicClient("test-key");
    const response = await client.chat({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "System",
      messages: [{ role: "user", content: "Test" }],
    });

    expect(response.text).toBe("");
  });
});
