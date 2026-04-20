import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type AiContextSource = 'sales_history' | 'fw26_portfolio';

@Entity({ name: 'ai_context', comment: 'Contexto carregado pelo tenant para alimentar o LLM.' })
@Index('ai_context_tenant_source_ref', ['tenant_id', 'source', 'collection_ref'])
export class AiContext {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'text', comment: 'sales_history | fw26_portfolio' })
  source!: AiContextSource;

  @Column({ type: 'text', nullable: true, comment: "Coleção de origem (ex: 'FW26')" })
  collection_ref!: string | null;

  @Column({ type: 'jsonb', comment: 'Payload normalizado' })
  payload!: unknown;

  @Column({ type: 'int', comment: 'Contagem de linhas' })
  row_count!: number;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  uploaded_at!: Date;
}
