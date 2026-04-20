import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Store } from './store.entity.js';

@Entity({
  name: 'store_profile',
  comment: 'Camada editável pelo franqueado — dados que ele enriquece além do cadastro Adidas.',
})
export class StoreProfile {
  @PrimaryColumn({ type: 'uuid', comment: 'PK e FK para store' })
  store_id!: string;

  @OneToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'text', nullable: true })
  city!: string | null;

  @Column({ type: 'text', nullable: true })
  state!: string | null;

  @Column({ type: 'text', nullable: true })
  manager_name!: string | null;

  @Column({ type: 'text', nullable: true })
  manager_phone!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'", comment: 'Campos livres da rede' })
  custom_fields!: Record<string, unknown>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
