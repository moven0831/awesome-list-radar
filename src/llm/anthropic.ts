import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient, LLMChatParams, LLMResponse } from "./types";

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const message = await this.client.messages.create({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages,
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    return {
      text,
      usage: {
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
      },
    };
  }
}
