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
import { Collection } from './collection.entity.js';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type OrderBatchStatus = 'draft' | 'baixado';

@Entity({
  name: 'order_batch',
  comment:
    'Pedido: container nomeado que agrupa 1+ lojas de uma coleção (1 franqueado × 1 coleção pode ter vários).',
})
@Index('order_batch_tenant_collection_name_unique', ['tenant_id', 'collection_id', 'name'], {
  unique: true,
})
@Index('order_batch_tenant_collection_status', ['tenant_id', 'collection_id', 'status'])
export class OrderBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'text', comment: 'Nome escolhido pelo franqueado (ex: "SS27 rodada julho")' })
  name!: string;

  @Column({
    type: 'text',
    default: 'draft',
    comment: 'draft = nunca exportado | baixado = já gerou pelo menos 1 export',
  })
  status!: OrderBatchStatus;

  @Column({
    type: 'integer',
    default: 0,
    comment: 'Quantas vezes este pedido foi exportado (re-exportações incrementam).',
  })
  export_count!: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp da última exportação bem-sucedida (null enquanto draft).',
  })
  last_exported_at!: Date | null;

  @Column({ type: 'uuid', comment: 'FK user criador' })
  created_by!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  created_by_user?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
