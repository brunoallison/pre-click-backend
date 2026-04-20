import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportBase } from './import-base.entity.js';

export type ChangeType = 'new' | 'updated' | 'removed';

@Entity({
  name: 'import_base_diff',
  comment: 'Diff linha-a-linha de um import vs versão anterior.',
})
@Index('import_base_diff_import_change', ['import_base_id', 'change_type'])
export class ImportBaseDiff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK import_base' })
  import_base_id!: string;

  @ManyToOne(() => ImportBase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'import_base_id' })
  import_base?: ImportBase;

  @Column({ type: 'text', comment: 'SKU afetado' })
  article_sku!: string;

  @Column({ type: 'text', comment: 'new | updated | removed' })
  change_type!: ChangeType;

  @Column({ type: 'jsonb', nullable: true, comment: '{field: {old, new}} — NULL para new/removed' })
  fields_changed!: Record<string, { old: unknown; new: unknown }> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
