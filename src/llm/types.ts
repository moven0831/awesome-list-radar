export interface LLMRequest {
  model: string;
  maxTokens: number;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface LLMResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  chat(request: LLMRequest): Promise<LLMResponse>;
}
