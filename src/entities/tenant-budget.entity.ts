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
import { User } from './user.entity.js';

@Entity({
  name: 'tenant_budget',
  comment: 'Budget consolidado do tenant por coleção (total declarado).',
})
@Index('tenant_budget_unique', ['tenant_id', 'collection_id'], { unique: true })
export class TenantBudget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'numeric', precision: 14, scale: 2, comment: 'Valor em BRL' })
  amount_brl!: string;

  @Column({ type: 'uuid', nullable: true, comment: 'Último user que editou' })
  updated_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updated_by_user?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
