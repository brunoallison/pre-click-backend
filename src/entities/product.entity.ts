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

export type Division = 'APP' | 'FTW' | 'ACC';

@Entity({ name: 'product', comment: 'SKU da coleção — GLOBAL, vem da BASE Adidas.' })
@Index('product_collection_sku_unique', ['collection_id', 'article_sku'], { unique: true })
@Index('product_collection_category', ['collection_id', 'category'])
@Index('product_collection_division', ['collection_id', 'division'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'text', comment: "SKU da Adidas (ex: 'KG7276')" })
  article_sku!: string;

  @Column({ type: 'text', nullable: true, comment: 'AMD.MODEL' })
  model!: string | null;

  @Column({ type: 'text', comment: 'AMD.LOCAL DESCRIPTION' })
  local_description!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment:
      'AMD.KEY CATEGORY (ORIGINALS | FOOTBALL | KIDS | RUNNING | SPECIALIST SPORTS | TRAINING | SPORTSWEAR)',
  })
  key_category!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.CATEGORY' })
  category!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.BUSINESS SEGMENT' })
  business_segment!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.SALES LINE' })
  sales_line!: string | null;

  @Column({ type: 'text', comment: 'AMD.DIVISION (APP | FTW | ACC)' })
  division!: Division;

  @Column({ type: 'text', nullable: true, comment: 'AMD.PROD GROUP' })
  prod_group!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.PROD TYPE' })
  prod_type!: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'AMD.GENDER (MALE | FEMALE | UNISEX | KIDS)',
  })
  gender!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.AGE GROUP (ADULT | KIDS)' })
  age_group!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.COLOR' })
  color!: string | null;

  @Column({ type: 'date', comment: 'AMD.LOCAL RID — início da janela de entrega' })
  local_rid!: string;

  @Column({ type: 'date', nullable: true, comment: 'AMD.LOCAL RED — fim da janela de entrega' })
  local_red!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.CAMPAIGN' })
  campaign!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.HERO & HALO' })
  hero_halo!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.PACK' })
  pack!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.BUILDING BLOCKS' })
  building_blocks!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.DEVELOP TYPE' })
  develop_type!: string | null;

  @Column({ type: 'boolean', default: false, comment: "AMD.EXCLUSIVE ('Yes' → true)" })
  exclusive!: boolean;

  @Column({ type: 'text', nullable: true, comment: 'AMD.CLIENTS' })
  clients!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.SOURCING TYPE (SAP | LOCAL | RMA)' })
  sourcing_type!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'AMD.ORIGIN / VENDOR / CURRENCY' })
  origin_vendor!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, comment: 'RRP em BRL' })
  rrp!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true, comment: 'AMD.MARKUP' })
  markup!: string | null;

  @Column({
    type: 'int',
    comment: 'AMD.VOL MÍNIMO — piso de qty: ACC=4, APP=6, FTW=12',
  })
  vol_minimo!: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Preenchido quando reimport não traz mais o SKU',
  })
  removed_at!: Date | null;

  @Column({ type: 'jsonb', comment: 'Linha original da BASE para debug' })
  raw!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
