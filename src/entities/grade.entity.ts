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
import { Tenant } from './tenant.entity.js';

@Entity({
  name: 'grade',
  comment: 'Grade (distribuição por tamanho). tenant_id NULL = global Adidas; preenchido = custom.',
})
@Index('grade_collection_tenant_code_unique', ['collection_id', 'tenant_id', 'code'], {
  unique: true,
})
export class Grade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'uuid', nullable: true, comment: 'NULL = Adidas; preenchido = custom do tenant' })
  tenant_id!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ type: 'text', comment: "Código da grade (ex: '12INF2936')" })
  code!: string;

  @Column({ type: 'int', comment: 'Soma das qty da grade' })
  total_pieces!: number;

  @Column({ type: 'boolean', default: false, comment: 'Grade da Adidas (não editável)' })
  is_system!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
