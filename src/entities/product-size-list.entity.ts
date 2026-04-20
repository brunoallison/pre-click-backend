import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Product } from './product.entity.js';

@Entity({
  name: 'product_size_list',
  comment: 'Lista de tamanhos do produto (derivada de AMD.SIZE).',
})
export class ProductSizeList {
  @PrimaryColumn({ type: 'uuid', comment: 'PK e FK para product' })
  product_id!: string;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'text', array: true, comment: "Tamanhos (ex: ['XS','S','M','L','XL'])" })
  sizes!: string[];
}
