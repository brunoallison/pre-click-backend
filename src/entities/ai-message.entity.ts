import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity.js';
import { User } from './user.entity.js';

export type AiMessageRole = 'user' | 'assistant' | 'tool';

/**
 * Bloco de conteúdo de uma mensagem IA.
 * - type='text': mensagem de texto
 * - type='tool_use': chamada de ferramenta (skill)
 * - type='tool_result': resultado da ferramenta
 */
export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: unknown };

@Entity({ name: 'ai_message', comment: 'Mensagem individual dentro de uma conversa IA.' })
@Index('ai_message_conversation_created', ['conversation_id', 'created_at'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK ai_conversation' })
  conversation_id!: string;

  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AiConversation;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'FK user — NULL para mensagens de assistente/tool',
  })
  user_id!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'text', comment: 'user | assistant | tool' })
  role!: AiMessageRole;

  @Column({ type: 'jsonb', comment: 'Array de blocos de conteúdo (text, tool_use, tool_result)' })
  content!: AiContentBlock[];

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Tokens de entrada (só mensagens de assistente)',
  })
  tokens_input!: number | null;

  @Column({ type: 'int', nullable: true, comment: 'Tokens de saída (só mensagens de assistente)' })
  tokens_output!: number | null;

  @Column({ type: 'text', nullable: true, comment: 'Modelo usado (ex: claude-sonnet-4-6)' })
  model!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
