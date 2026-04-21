import type { Repository } from 'typeorm';
import type { AiConversation } from '../../../entities/ai-conversation.entity.js';
import type { AiMessage } from '../../../entities/ai-message.entity.js';
import { ConversationService } from '../../../services/ai/conversation.service.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

@Injectable()
export class ArchiveConversationTask extends Task<void> {
  constructor(
    @Inject('AiConversationRepository') private readonly conversations: Repository<AiConversation>,
    @Inject('AiMessageRepository') private readonly messages: Repository<AiMessage>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<void> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const svc = new ConversationService(this.conversations, this.messages);
    await svc.archiveConversation(id, tenantId);
  }
}
