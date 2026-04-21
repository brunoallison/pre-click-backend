import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OrderBatch } from './order-batch.entity.js';
import { Product } from './product.entity.js';

@Entity({
  name: 'batch_hidden_product',
  comment: 'Produtos explicitamente ocultos pelo operador em um pedido específico.',
})
export class BatchHiddenProduct {
  @PrimaryColumn({ type: 'uuid', comment: 'FK order_batch' })
  batch_id!: string;

  @ManyToOne(() => OrderBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: OrderBatch;

  @PrimaryColumn({ type: 'uuid', comment: 'FK product' })
  product_id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({
    type: 'timestamptz',
    default: () => 'now()',
    comment: 'Momento em que o operador ocultou o produto',
  })
  hidden_at!: Date;
}
