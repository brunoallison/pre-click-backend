import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity.js';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

export type ImageSource = 'adidas_feed' | 'tenant_upload' | 'manual_url';

@Entity({
  name: 'product_image',
  comment: 'Imagens do produto. tenant_id NULL = feed oficial Adidas; preenchido = upload tenant.',
})
@Index('product_image_product_tenant', ['product_id', 'tenant_id'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK product' })
  product_id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'uuid', nullable: true, comment: 'NULL = global; preenchido = tenant' })
  tenant_id!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ type: 'text', comment: 'URL pública da imagem' })
  url!: string;

  @Column({ type: 'int', default: 0, comment: 'Ordem de exibição' })
  position!: number;

  @Column({ type: 'boolean', default: false, comment: 'Imagem primária do produto' })
  is_primary!: boolean;

  @Column({ type: 'text', comment: 'adidas_feed | tenant_upload | manual_url' })
  source!: ImageSource;

  @Column({ type: 'uuid', nullable: true, comment: 'Upload manual: user que subiu' })
  uploaded_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
