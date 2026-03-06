export interface LLMChatParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  text: string;
  usage: LLMTokenUsage;
}

export interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMResponse>;
}
