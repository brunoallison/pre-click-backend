import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity.js';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type AiCallKind = 'suggest_grade' | 'chat' | 'explain_insight' | 'apply_suggestions';

@Entity({ name: 'ai_call', comment: 'Observabilidade/custo de chamadas ao LLM por tenant.' })
@Index('ai_call_tenant_created', ['tenant_id', 'created_at'])
export class AiCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', nullable: true, comment: 'User que disparou' })
  user_id!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'text', comment: 'suggest_grade | chat | explain_insight | apply_suggestions' })
  kind!: AiCallKind;

  @Column({ type: 'uuid', nullable: true, comment: 'Order relacionado (se aplicável)' })
  order_id!: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order?: Order | null;

  @Column({ type: 'int', nullable: true })
  input_tokens!: number | null;

  @Column({ type: 'int', nullable: true })
  output_tokens!: number | null;

  @Column({ type: 'int', nullable: true })
  latency_ms!: number | null;

  @Column({ type: 'boolean', default: false, comment: 'Hit no cache Redis?' })
  cached!: boolean;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
