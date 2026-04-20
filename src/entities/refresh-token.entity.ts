import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';
import { User } from './user.entity.js';

@Entity({
  name: 'refresh_token',
  comment: 'Refresh tokens persistidos para revogação (source of truth); Redis é fast-path.',
})
@Index('refresh_token_user_active', ['user_id'], {
  where: '"revoked_at" IS NULL',
})
@Index('refresh_token_expires', ['expires_at'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK user' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', nullable: true, comment: 'Denormalizado (NULL para super_admin)' })
  tenant_id!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ type: 'timestamptz', comment: 'Data de expiração (issued_at + refresh TTL)' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Preenchido no logout ou rotação' })
  revoked_at!: Date | null;

  @Column({ type: 'text', nullable: true, comment: 'User-Agent do cliente' })
  user_agent!: string | null;

  @Column({ type: 'inet', nullable: true, comment: 'IP do cliente' })
  ip!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
