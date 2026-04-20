import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExportBatch } from './export-batch.entity.js';
import { Store } from './store.entity.js';

export type ExportFileStatus = 'ready' | 'downloaded' | 'sent' | 'errored' | 'corrected';

@Entity({ name: 'export_batch_file', comment: 'Arquivo .xlsx individual gerado no batch.' })
@Index('export_batch_file_batch_seq_unique', ['batch_id', 'sequence'], { unique: true })
export class ExportBatchFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK export_batch' })
  batch_id!: string;

  @ManyToOne(() => ExportBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ExportBatch;

  @Column({ type: 'int', comment: 'Sequência do arquivo dentro do batch (1..N)' })
  sequence!: number;

  @Column({ type: 'text', comment: 'Nome do arquivo (CLICK_SS27_loja12_RDD46357_p1.xlsx)' })
  file_name!: string;

  @Column({ type: 'text', comment: 'Chave GCS do arquivo (bucket configurado em GCS_BUCKET_NAME)' })
  gcs_key!: string;

  @Column({ type: 'int', comment: 'Linhas no arquivo' })
  row_count!: number;

  @Column({ type: 'int', nullable: true, comment: 'RDD serial (se strategy=by_rdd)' })
  rdd!: number | null;

  @Column({ type: 'uuid', nullable: true, comment: 'Loja do arquivo' })
  store_id!: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'store_id' })
  store?: Store | null;

  @Column({
    type: 'text',
    default: 'ready',
    comment: 'ready | downloaded | sent | errored | corrected',
  })
  status!: ExportFileStatus;

  @Column({ type: 'timestamptz', nullable: true })
  downloaded_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at!: Date | null;

  @Column({ type: 'uuid', nullable: true, comment: 'FK click_error_file' })
  error_file_id!: string | null;
}
