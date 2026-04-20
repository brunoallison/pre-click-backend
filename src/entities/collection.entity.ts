import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CollectionStatus = 'draft' | 'open' | 'closed';

@Entity({
  name: 'collection',
  comment: 'Coleção Adidas (ex: SS27 BR). GLOBAL — todos os tenants compartilham.',
})
@Index('collection_code_country_unique', ['code', 'country'], { unique: true })
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', comment: "Código (ex: 'SS27', 'FW26')" })
  code!: string;

  @Column({ type: 'text', comment: "País (ex: 'BR')" })
  country!: string;

  @Column({ type: 'text', comment: 'Nome completo da coleção' })
  name!: string;

  @Column({ type: 'text', default: 'draft', comment: 'draft | open | closed' })
  status!: CollectionStatus;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Abertura da janela de pedido' })
  order_start_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Fim da janela de pedido' })
  order_end_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Início da janela de entrega' })
  delivery_start_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Fim da janela de entrega' })
  delivery_end_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
