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
import { Store } from './store.entity.js';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type OrderStatus = 'draft' | 'submitted' | 'exported' | 'partial' | 'closed';

@Entity({ name: 'order', comment: 'Pedido de 1 loja × 1 coleção.' })
@Index('order_collection_store_unique', ['collection_id', 'store_id'], { unique: true })
@Index('order_tenant_collection_status', ['tenant_id', 'collection_id', 'status'])
export class Order {
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

  @Column({ type: 'uuid', comment: 'FK store' })
  store_id!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({
    type: 'text',
    default: 'draft',
    comment: 'draft | submitted | exported | partial | closed',
  })
  status!: OrderStatus;

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
