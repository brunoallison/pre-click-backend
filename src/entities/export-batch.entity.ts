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

export type ExportStrategy = 'by_rdd' | 'by_size' | 'manual';

@Entity({ name: 'export_batch', comment: 'Batch de exportação de um pedido para o Click.' })
@Index('export_batch_tenant_order', ['tenant_id', 'order_id'])
export class ExportBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', comment: 'FK order' })
  order_id!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'uuid', nullable: true, comment: 'Batch pai (re-export de erro)' })
  parent_batch_id!: string | null;

  @ManyToOne(() => ExportBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_batch_id' })
  parent_batch?: ExportBatch | null;

  @Column({ type: 'text', comment: 'by_rdd | by_size | manual' })
  strategy!: ExportStrategy;

  @Column({ type: 'int', default: 400, comment: 'Limite de linhas por arquivo Click' })
  chunk_size_limit!: number;

  @Column({ type: 'int', comment: 'Total de linhas geradas no batch' })
  total_rows!: number;

  @Column({ type: 'int', comment: 'Total de arquivos no batch' })
  total_files!: number;

  @Column({ type: 'uuid', comment: 'User que disparou o export' })
  triggered_by!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'triggered_by' })
  triggered_by_user?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
