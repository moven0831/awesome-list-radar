import OpenAI from "openai";
import type { LLMClient, LLMChatParams, LLMResponse } from "./types";

export class OpenAIClient implements LLMClient {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.max_tokens,
      messages: [
        { role: "system" as const, content: params.system },
        ...params.messages,
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
