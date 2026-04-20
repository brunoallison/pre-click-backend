import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExportBatchFile } from './export-batch-file.entity.js';
import { User } from './user.entity.js';

@Entity({
  name: 'click_error_file',
  comment: 'Planilha de erros devolvida pelo Click após upload.',
})
export class ClickErrorFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK export_batch_file que gerou o erro' })
  export_batch_file_id!: string;

  @ManyToOne(() => ExportBatchFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'export_batch_file_id' })
  export_batch_file?: ExportBatchFile;

  @Column({
    type: 'text',
    comment: 'Chave GCS do arquivo de erro (bucket configurado em GCS_BUCKET_NAME)',
  })
  gcs_key!: string;

  @Column({ type: 'uuid', comment: 'User que subiu' })
  uploaded_by!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user?: User;

  @Column({ type: 'int', comment: 'Total de linhas com erro' })
  total_errors!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  uploaded_at!: Date;
}
