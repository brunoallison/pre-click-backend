import { env } from '../../config/env.js';
import type { AiConversation } from '../../entities/ai-conversation.entity.js';
import type { AiContentBlock } from '../../entities/ai-message.entity.js';
import { logger } from '../../utils/logger.js';
import type { ConversationService } from './conversation.service.js';
import type { SkillContext, SkillRegistry } from './skill.types.js';

export interface OrchestratorInput {
  tenantId: string;
  userId: string;
  role: string;
  conversationId?: string;
  message: string;
  uiContext?: {
    collection_id?: string;
    store_id?: string;
    order_id?: string;
  };
}

export interface OrchestratorOutput {
  conversation_id: string;
  reply: string;
  tool_calls: Array<{ name: string; result: unknown }>;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicBlock[];
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

const SYSTEM_PROMPT = `Você é um assistente especializado no sistema PreClick Adidas, usado por operadores de franquias para digitalizar pedidos sazonais e exportar para o sistema Click da Adidas.

Responda em português brasileiro, de forma direta e objetiva. Quando não souber algo com certeza, diga que não sabe em vez de inventar.

Você tem acesso a ferramentas para consultar dados reais do sistema: produtos, pedidos, lojas, insights de dashboard. Use-as quando o usuário perguntar algo que exige dados concretos.

Regras de domínio importantes:
- Qty zero nunca exporta para o Click
- RDD é imutável — vem da BASE Adidas
- Grade × N é a única forma de calcular quantidade por tamanho
- Cluster é atribuído pela Adidas — franqueado não define`;

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: AnthropicMessage[],
  tools: AnthropicToolDefinition[],
  system: string,
): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    system,
    messages,
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API erro ${res.status}: ${err}`);
  }

  return res.json() as Promise<AnthropicResponse>;
}

function extractTextFromResponse(blocks: AnthropicBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function toAnthropicMessages(
  storedMessages: Array<{ role: string; content: AiContentBlock[] }>,
): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of storedMessages) {
    if (msg.role === 'user') {
      const textBlocks = msg.content.filter(
        (b): b is { type: 'text'; text: string } => b.type === 'text',
      );
      const text = textBlocks.map((b) => b.text).join('\n');
      result.push({ role: 'user', content: text });
    } else if (msg.role === 'assistant') {
      const blocks = msg.content as AnthropicBlock[];
      result.push({ role: 'assistant', content: blocks });
    } else if (msg.role === 'tool') {
      // tool_result: agrupa como user message com tool_result blocks
      const toolResultBlocks = msg.content.filter(
        (b): b is { type: 'tool_result'; tool_use_id: string; content: unknown } =>
          b.type === 'tool_result',
      );
      if (toolResultBlocks.length > 0) {
        result.push({
          role: 'user',
          content: toolResultBlocks.map((b) => ({
            type: 'tool_result' as const,
            tool_use_id: b.tool_use_id,
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
          })),
        });
      }
    }
  }

  return result;
}

export class OrchestratorService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly skillRegistry: SkillRegistry,
  ) {}

  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    // 1. Garante conversa
    let conv: AiConversation;
    if (input.conversationId) {
      const existing = await this.conversationService.getConversation(
        input.conversationId,
        input.tenantId,
      );
      if (!existing) {
        conv = await this.conversationService.createConversation(input.tenantId, input.userId);
      } else {
        conv = existing;
      }
    } else {
      conv = await this.conversationService.createConversation(input.tenantId, input.userId);
    }

    // 2. Salva mensagem do usuário
    const userContent: AiContentBlock[] = [{ type: 'text', text: input.message }];
    await this.conversationService.addMessage(conv.id, {
      role: 'user',
      content: userContent,
      userId: input.userId,
    });

    // Define título na primeira mensagem
    if (!conv.title) {
      const title = this.conversationService.generateTitle(input.message);
      await this.conversationService.setTitle(conv.id, title);
    }

    // 3. Sem chave API: resposta de stub
    if (!env.ANTHROPIC_API_KEY) {
      const stubReply =
        'Assistente não configurado: falta a variável ANTHROPIC_API_KEY. Avise o administrador.';
      await this.conversationService.addMessage(conv.id, {
        role: 'assistant',
        content: [{ type: 'text', text: stubReply }],
      });
      return { conversation_id: conv.id, reply: stubReply, tool_calls: [] };
    }

    // 4. Carrega histórico
    const history = await this.conversationService.getMessages(conv.id, 20);
    // Remove a última mensagem (usuário que acabou de adicionar) para não duplicar
    const historyWithoutLast = history.slice(0, -1);

    const anthropicMessages = toAnthropicMessages(historyWithoutLast);
    // Adiciona a mensagem atual
    anthropicMessages.push({ role: 'user', content: input.message });

    // 5. Contexto de UI na system prompt
    const uiCtxLines: string[] = [];
    if (input.uiContext?.collection_id) {
      uiCtxLines.push(`Coleção ativa: ${input.uiContext.collection_id}`);
    }
    if (input.uiContext?.store_id) {
      uiCtxLines.push(`Loja selecionada: ${input.uiContext.store_id}`);
    }
    if (input.uiContext?.order_id) {
      uiCtxLines.push(`Pedido selecionado: ${input.uiContext.order_id}`);
    }
    const system =
      uiCtxLines.length > 0
        ? `${SYSTEM_PROMPT}\n\nContexto atual do usuário:\n${uiCtxLines.join('\n')}`
        : SYSTEM_PROMPT;

    const skillCtx: SkillContext = {
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      activeCollectionId: input.uiContext?.collection_id,
      selectedStoreId: input.uiContext?.store_id,
      selectedOrderId: input.uiContext?.order_id,
    };

    const tools = this.skillRegistry.toTools();
    const toolCallsSummary: Array<{ name: string; result: unknown }> = [];

    // 6. Agentic loop (max 8 iterações)
    let finalReply = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let model = env.ANTHROPIC_MODEL;

    for (let iteration = 0; iteration < 8; iteration++) {
      let apiResponse: AnthropicResponse;
      try {
        apiResponse = await callAnthropic(
          env.ANTHROPIC_API_KEY,
          env.ANTHROPIC_MODEL,
          anthropicMessages,
          tools,
          system,
        );
      } catch (err) {
        logger.error({ err, conversationId: conv.id }, 'OrchestratorService: falha na API Anthropic');
        const errMsg =
          'Desculpe, o assistente está indisponível no momento. Tente novamente em instantes.';
        await this.conversationService.addMessage(conv.id, {
          role: 'assistant',
          content: [{ type: 'text', text: errMsg }],
        });
        return { conversation_id: conv.id, reply: errMsg, tool_calls: toolCallsSummary };
      }

      totalInputTokens += apiResponse.usage.input_tokens;
      totalOutputTokens += apiResponse.usage.output_tokens;
      model = apiResponse.model;

      // Salva resposta do assistente
      const assistantContent = apiResponse.content as AiContentBlock[];
      await this.conversationService.addMessage(conv.id, {
        role: 'assistant',
        content: assistantContent,
        tokens_input: apiResponse.usage.input_tokens,
        tokens_output: apiResponse.usage.output_tokens,
        model: apiResponse.model,
      });

      // Adiciona ao histórico de mensagens para próximas iterações
      anthropicMessages.push({ role: 'assistant', content: apiResponse.content });

      if (apiResponse.stop_reason === 'end_turn') {
        finalReply = extractTextFromResponse(apiResponse.content);
        break;
      }

      if (apiResponse.stop_reason !== 'tool_use') {
        finalReply = extractTextFromResponse(apiResponse.content);
        break;
      }

      // Processa tool_use blocks
      const toolUseBlocks = apiResponse.content.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          b.type === 'tool_use',
      );

      if (!toolUseBlocks.length) {
        finalReply = extractTextFromResponse(apiResponse.content);
        break;
      }

      const toolResultContents: AnthropicBlock[] = [];
      const toolResultStorageBlocks: AiContentBlock[] = [];

      for (const toolCall of toolUseBlocks) {
        const skill = this.skillRegistry.get(toolCall.name);
        let result: unknown;

        if (!skill) {
          result = { error: `Ferramenta '${toolCall.name}' não encontrada` };
        } else {
          try {
            result = await skill.handler(skillCtx, toolCall.input);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.warn({ err: errMsg, skill: toolCall.name }, 'OrchestratorService: skill falhou');
            result = { error: errMsg };
          }
        }

        toolCallsSummary.push({ name: toolCall.name, result });

        const resultStr = JSON.stringify(result);
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: resultStr,
        });
        toolResultStorageBlocks.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      // Salva resultados de tools
      await this.conversationService.addMessage(conv.id, {
        role: 'tool',
        content: toolResultStorageBlocks,
      });

      // Adiciona ao histórico para próxima iteração
      anthropicMessages.push({ role: 'user', content: toolResultContents });
    }

    logger.debug(
      {
        conversationId: conv.id,
        totalInputTokens,
        totalOutputTokens,
        model,
        toolCalls: toolCallsSummary.length,
      },
      'OrchestratorService: concluído',
    );

    return {
      conversation_id: conv.id,
      reply: finalReply || 'Não consegui gerar uma resposta agora.',
      tool_calls: toolCallsSummary,
    };
  }
}
