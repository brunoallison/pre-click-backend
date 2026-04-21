import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type AiConversationVisibility = 'tenant' | 'private';

@Entity({ name: 'ai_conversation', comment: 'Conversa persistente com o assistente IA.' })
@Index('ai_conversation_tenant_created', ['tenant_id', 'created_at'])
@Index('ai_conversation_tenant_user', ['tenant_id', 'created_by'])
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', comment: 'FK user criador' })
  created_by!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  created_by_user?: User;

  @Column({
    type: 'text',
    default: 'tenant',
    comment: 'tenant = visível a todos do tenant | private = só o criador',
  })
  visibility!: AiConversationVisibility;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Título auto-gerado da primeira mensagem (primeiros 60 chars)',
  })
  title!: string | null;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Preenchido quando arquivada' })
  archived_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
