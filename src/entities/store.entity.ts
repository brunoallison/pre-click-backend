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
import { Tenant } from './tenant.entity.js';

export type StoreConcept = 'BCS' | 'OCS' | 'YACS' | 'FTWS';
export type StatusComp = 'COMP' | 'NEW_2026' | 'NEW_2025' | 'NON_COMP';

export const CLUSTERS = [
  'FR_BCS_BC',
  'FR_BCS_TOP',
  'FR_BCS_TS',
  'FR_BCS_MID',
  'FR_BCS_MS',
  'FR_BCS_VAL',
  'FR_YACS_MID',
  'FR_OCS_TOP',
  'FR_OCS_TS',
  'FR_OCS_MID',
  'FR_OCS_VAL',
  'SNEAKR_TOP',
] as const;
export type Cluster = (typeof CLUSTERS)[number];

@Entity({ name: 'store', comment: 'Loja física de um tenant (franqueado).' })
@Index('store_tenant_active_dummy', ['tenant_id', 'is_active', 'is_dummy'])
@Index('store_tenant_customer_unique', ['tenant_id', 'customer_id_sap'], {
  unique: true,
  where: '"customer_id_sap" IS NOT NULL',
})
@Index('store_tenant_status', ['tenant_id', 'status_comp'])
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK tenant' })
  tenant_id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Customer ID SAP (NULL em lojas NEW_2026 ainda sem cadastro)',
  })
  customer_id_sap!: string | null;

  @Column({ type: 'text', comment: 'Razão social — usada no Click (case-sensitive)' })
  legal_name!: string;

  @Column({ type: 'text', comment: 'Nome curto para UI' })
  display_name!: string;

  @Column({ type: 'int', nullable: true, comment: 'Numeração usada na planilha antiga' })
  store_number!: number | null;

  @Column({ type: 'text', default: 'BR', comment: 'País (MVP: BR)' })
  country!: string;

  @Column({ type: 'text', comment: 'BCS | OCS | YACS | FTWS' })
  store_concept!: StoreConcept;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Cluster técnico da Adidas (12 valores). NULL em NEW_2026.',
  })
  cluster!: Cluster | null;

  @Column({ type: 'text', nullable: true, comment: 'Cidade (parseada do STORE NAME)' })
  city!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'UF (derivada de city)' })
  state!: string | null;

  @Column({
    type: 'text',
    default: 'COMP',
    comment: 'COMP | NEW_2026 | NEW_2025 | NON_COMP',
  })
  status_comp!: StatusComp;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'DUMMY da BASE — placeholder, não entra em pedido',
  })
  is_dummy!: boolean;

  @Column({ type: 'boolean', default: true, comment: 'Loja ativa?' })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
