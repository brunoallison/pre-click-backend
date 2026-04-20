import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entity.js';
import { User } from './user.entity.js';

export type ImportStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity({ name: 'import_base', comment: 'Histórico de importações de BASE da Adidas. GLOBAL.' })
@Index('import_base_collection_version_unique', ['collection_id', 'version_tag'], { unique: true })
@Index('import_base_collection_created', ['collection_id', 'uploaded_at'])
export class ImportBase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'text', comment: "País (ex: 'BR')" })
  country!: string;

  @Column({ type: 'text', comment: "Tag da versão (ex: 'V1704')" })
  version_tag!: string;

  @Column({ type: 'boolean', default: false, comment: 'true no primeiro import da coleção' })
  is_initial!: boolean;

  @Column({ type: 'text', comment: 'Nome original do arquivo .xlsx' })
  file_name!: string;

  @Column({ type: 'text', comment: 'Chave GCS do arquivo (bucket configurado em GCS_BUCKET_NAME)' })
  gcs_key!: string;

  @Column({
    type: 'text',
    default: 'pending',
    comment: 'pending | running | completed | failed',
  })
  status!: ImportStatus;

  @Column({ type: 'int', nullable: true })
  rows_total!: number | null;

  @Column({ type: 'int', nullable: true })
  rows_new!: number | null;

  @Column({ type: 'int', nullable: true })
  rows_updated!: number | null;

  @Column({ type: 'int', nullable: true })
  rows_removed!: number | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'uuid', comment: 'User que subiu (super_admin)' })
  uploaded_by!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  uploaded_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;
}
