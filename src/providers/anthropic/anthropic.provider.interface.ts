export interface AnthropicCompletionInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
}

export interface AnthropicCompletionOutput {
  text: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface IAnthropicProvider {
  complete(input: AnthropicCompletionInput): Promise<AnthropicCompletionOutput>;
}
