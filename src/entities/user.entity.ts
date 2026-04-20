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

export type UserRole = 'super_admin' | 'user';

@Entity({ name: 'user', comment: 'Operadores (tenant-scoped) e super_admins (global).' })
@Index('user_email_unique', ['email'], { unique: true })
@Index('user_tenant_role', ['tenant_id', 'role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: "NULL apenas para role='super_admin' (cross-tenant)",
  })
  tenant_id!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ type: 'text', comment: 'Email (identificador de login)' })
  email!: string;

  @Column({ type: 'text', comment: 'Hash Argon2id da senha' })
  password_hash!: string;

  @Column({ type: 'text', comment: 'Nome de exibição' })
  display_name!: string;

  @Column({ type: 'text', default: 'user', comment: 'super_admin | user' })
  role!: UserRole;

  @Column({ type: 'boolean', default: true, comment: 'Usuário ativo?' })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Último login registrado' })
  last_login_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
