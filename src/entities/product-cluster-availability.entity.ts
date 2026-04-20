import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ImportBase } from './import-base.entity.js';
import { Product } from './product.entity.js';

export type ClusterAvailability = 'required' | 'optional' | 'forbidden';

@Entity({
  name: 'product_cluster_availability',
  comment:
    'Classificação (0/1/OP) do produto por cluster, com escopo opcional (RJ, SP, IPA E OSCAR…).',
})
@Index('pca_cluster_availability', ['cluster', 'availability'])
@Index('pca_restriction_scope', ['restriction_scope'], {
  where: '"restriction_scope" IS NOT NULL',
})
export class ProductClusterAvailability {
  @PrimaryColumn({ type: 'uuid', comment: 'FK product' })
  product_id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @PrimaryColumn({ type: 'text', comment: 'Cluster técnico (FR_OCS_TOP, SNEAKR_TOP, …)' })
  cluster!: string;

  @Column({ type: 'text', comment: 'required | optional | forbidden' })
  availability!: ClusterAvailability;

  @Column({
    type: 'text',
    nullable: true,
    comment: "Escopo: 'RJ', 'SC', 'BH', 'IPA E OSCAR'… NULL = aplica em todas as lojas do cluster",
  })
  restriction_scope!: string | null;

  @Column({ type: 'text', comment: 'Valor bruto da célula BASE (ex: "1 RJ")' })
  raw_value!: string;

  @Column({ type: 'uuid', comment: 'FK import_base de onde veio' })
  imported_from!: string;

  @ManyToOne(() => ImportBase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'imported_from' })
  import_source?: ImportBase;
}
