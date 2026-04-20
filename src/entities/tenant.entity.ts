import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TenantStatus = 'active' | 'suspended';

@Entity({ name: 'tenant', comment: 'Grupo de franqueados (rede). Unidade de isolamento e venda.' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true, comment: "Slug único (ex: 'franquia-afranio')" })
  slug!: string;

  @Column({ type: 'text', comment: 'Nome de exibição do tenant' })
  display_name!: string;

  @Column({ type: 'text', default: 'active', comment: 'active | suspended' })
  status!: TenantStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
