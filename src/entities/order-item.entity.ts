import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Grade } from './grade.entity.js';
import { Order } from './order.entity.js';
import { Product } from './product.entity.js';
import { Tenant } from './tenant.entity.js';

@Entity({
  name: 'order_item',
  comment: 'Linha do pedido (produto × grade × multiplier × RDD opcional).',
})
@Index('order_item_tenant_order', ['tenant_id', 'order_id'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant (denormalizado para performance)' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', comment: 'FK order' })
  order_id!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'uuid', comment: 'FK product' })
  product_id!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'uuid', comment: 'FK grade' })
  grade_id!: string;

  @ManyToOne(() => Grade, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'grade_id' })
  grade?: Grade;

  @Column({ type: 'int', default: 1, comment: 'Multiplicador da grade (qty = grade × multiplier)' })
  multiplier!: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'RDD override serial (NULL = usa product.local_rid)',
  })
  rdd_override_serial!: number | null;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Override forbidden: operador justificou pedido em SKU proibido',
  })
  override_forbidden!: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Justificativa do override' })
  override_reason!: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
