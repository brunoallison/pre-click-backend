import type { Repository } from 'typeorm';
import type { AiConversation } from '../../entities/ai-conversation.entity.js';
import type { AiContentBlock, AiMessage, AiMessageRole } from '../../entities/ai-message.entity.js';

export interface AddMessageInput {
  role: AiMessageRole;
  content: AiContentBlock[];
  userId?: string;
  tokens_input?: number;
  tokens_output?: number;
  model?: string;
}

export class ConversationService {
  constructor(
    private readonly conversations: Repository<AiConversation>,
    private readonly messages: Repository<AiMessage>,
  ) {}

  async createConversation(
    tenantId: string,
    userId: string,
    visibility: 'tenant' | 'private' = 'tenant',
  ): Promise<AiConversation> {
    const conv = this.conversations.create({
      tenant_id: tenantId,
      created_by: userId,
      visibility,
      title: null,
      archived_at: null,
    });
    return this.conversations.save(conv);
  }

  async getConversation(id: string, tenantId: string): Promise<AiConversation | null> {
    return this.conversations.findOne({ where: { id, tenant_id: tenantId } });
  }

  async listConversations(
    tenantId: string,
    userId: string,
    includePrivate = true,
  ): Promise<AiConversation[]> {
    const qb = this.conversations
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.archived_at IS NULL')
      .orderBy('c.updated_at', 'DESC');

    if (!includePrivate) {
      qb.andWhere("(c.visibility = 'tenant' OR c.created_by = :userId)", { userId });
    }

    return qb.getMany();
  }

  async addMessage(conversationId: string, input: AddMessageInput): Promise<AiMessage> {
    const msg = this.messages.create({
      conversation_id: conversationId,
      user_id: input.userId ?? null,
      role: input.role,
      content: input.content,
      tokens_input: input.tokens_input ?? null,
      tokens_output: input.tokens_output ?? null,
      model: input.model ?? null,
    });
    const saved = await this.messages.save(msg);

    // Atualiza updated_at da conversa
    await this.conversations.update({ id: conversationId }, { updated_at: new Date() });

    return saved;
  }

  async getMessages(conversationId: string, limit = 20): Promise<AiMessage[]> {
    return this.messages.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
      take: limit,
    });
  }

  async archiveConversation(id: string, tenantId: string): Promise<void> {
    await this.conversations.update({ id, tenant_id: tenantId }, { archived_at: new Date() });
  }

  generateTitle(firstMessage: string): string {
    return firstMessage.trim().slice(0, 60);
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.conversations.update({ id }, { title });
  }
}
