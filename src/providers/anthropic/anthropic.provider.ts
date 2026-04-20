import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { Injectable } from '../../utils/di.js';
import type {
  AnthropicCompletionInput,
  AnthropicCompletionOutput,
  IAnthropicProvider,
} from './anthropic.provider.interface.js';

@Injectable()
export class AnthropicProvider implements IAnthropicProvider {
  async complete(input: AnthropicCompletionInput): Promise<AnthropicCompletionOutput> {
    if (!env.ANTHROPIC_API_KEY) {
      logger.warn('AnthropicProvider: ANTHROPIC_API_KEY ausente — retornando stub');
      return { text: '{}', input_tokens: 0, output_tokens: 0, latency_ms: 0 };
    }
    const start = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: input.maxTokens ?? 800,
        system: input.system,
        messages: input.messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API erro ${res.status}: ${err}`);
    }
    const json = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: json.content.find((c) => c.type === 'text')?.text ?? '',
      input_tokens: json.usage.input_tokens,
      output_tokens: json.usage.output_tokens,
      latency_ms: Date.now() - start,
    };
  }
}
