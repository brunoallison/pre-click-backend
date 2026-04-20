import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Grade } from './grade.entity.js';

@Entity({ name: 'grade_size_qty', comment: 'Qty por tamanho dentro de uma grade.' })
export class GradeSizeQty {
  @PrimaryColumn({ type: 'uuid', comment: 'FK grade' })
  grade_id!: string;

  @ManyToOne(() => Grade, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grade_id' })
  grade?: Grade;

  @PrimaryColumn({ type: 'text', comment: 'Tamanho (ex: S, M, 39, XS2")' })
  size!: string;

  @Column({ type: 'int', comment: 'Quantidade para este tamanho (> 0)' })
  qty!: number;
}
