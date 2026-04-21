import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { env } from '../../../config/env.js';
import { AiCall } from '../../../entities/ai-call.entity.js';
import { AiContext } from '../../../entities/ai-context.entity.js';
import { AnthropicProvider } from '../../../providers/anthropic/anthropic.provider.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { logger } from '../../../utils/logger.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { ChatInput, type ChatOutput } from '../dto/ai.dto.js';

const SYSTEM_PROMPT = `Você é um assistente especializado no sistema Pedido Adidas, usado por operadores de lojas franquias para digitar pedidos sazonais. Responda em português brasileiro, de forma direta e objetiva. Quando não souber algo com certeza, diga que não sabe em vez de inventar.`;

@Injectable()
export class ChatTask extends Task<ChatOutput> {
  protected validations = [verifyBody(ChatInput, true)];

  constructor(
    @Inject(AnthropicProvider) private readonly anthropic: AnthropicProvider,
    @Inject('AiCallRepository') private readonly calls: Repository<AiCall>,
    @Inject('AiContextRepository') private readonly contexts: Repository<AiContext>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<ChatOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const dto = input.body as ChatInput;

    const contextRows = await this.contexts.find({
      where: { tenant_id: tenantId },
      order: { uploaded_at: 'DESC' },
      take: 4,
    });

    const systemWithContext = contextRows.length
      ? `${SYSTEM_PROMPT}\n\nContexto carregado pelo tenant:\n${contextRows
          .map(
            (c) =>
              `- ${c.source}${c.collection_ref ? ` (${c.collection_ref})` : ''}: ${c.row_count} linhas`,
          )
          .join('\n')}`
      : SYSTEM_PROMPT;

    let reply = '';
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let latencyMs: number | null = null;
    let errorMsg: string | null = null;

    if (!env.ANTHROPIC_API_KEY) {
      reply =
        'Assistente não configurado: falta a variável ANTHROPIC_API_KEY no backend. Avise o administrador.';
    } else {
      try {
        const res = await this.anthropic.complete({
          system: systemWithContext,
          messages: [{ role: 'user', content: dto.message }],
        });
        inputTokens = res.input_tokens;
        outputTokens = res.output_tokens;
        latencyMs = res.latency_ms;
        reply = res.text?.trim() || 'Não consegui gerar uma resposta agora.';
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errorMsg, tenantId }, 'ChatTask: falha ao chamar Anthropic');
        reply =
          'Desculpe, o assistente está indisponível no momento. Tente novamente em alguns instantes.';
      }
    }

    await this.calls.save({
      tenant_id: tenantId,
      user_id: userId ?? null,
      kind: 'chat',
      order_id: dto.order_id ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      cached: false,
      error: errorMsg,
    });

    return {
      session_id: dto.session_id ?? randomUUID(),
      reply,
    };
  }
}
