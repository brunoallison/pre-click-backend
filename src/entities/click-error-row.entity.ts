import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClickErrorFile } from './click-error-file.entity.js';
import { OrderItem } from './order-item.entity.js';

export type ClickErrorResolution = 'open' | 'corrected' | 'accepted_loss';

@Entity({ name: 'click_error_row', comment: 'Linha individual de erro retornada pelo Click.' })
@Index('click_error_row_file_resolution', ['click_error_file_id', 'resolution'])
export class ClickErrorRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK click_error_file' })
  click_error_file_id!: string;

  @ManyToOne(() => ClickErrorFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'click_error_file_id' })
  click_error_file?: ClickErrorFile;

  @Column({ type: 'text', comment: 'SKU afetado' })
  article_sku!: string;

  @Column({ type: 'text', comment: 'Tamanho afetado' })
  size!: string;

  @Column({ type: 'text', nullable: true, comment: 'Código de erro do Click' })
  error_code!: string | null;

  @Column({ type: 'text', comment: 'Mensagem de erro do Click' })
  error_message!: string;

  @Column({ type: 'jsonb', comment: 'Linha bruta da planilha' })
  raw_row!: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true, comment: 'order_item vinculado (se resolvido)' })
  linked_order_item_id!: string | null;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_order_item_id' })
  linked_order_item?: OrderItem | null;

  @Column({ type: 'text', default: 'open', comment: 'open | corrected | accepted_loss' })
  resolution!: ClickErrorResolution;
}
