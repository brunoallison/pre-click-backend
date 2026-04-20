import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AliasMatchKind = 'exact' | 'like';

@Entity({
  name: 'cluster_restriction_alias',
  comment: "Aliases de restriction_scope (ex: 'IPA' → %IPANEMA%). Mantido por super_admin.",
})
@Index('cluster_restriction_alias_unique', ['alias'], { unique: true })
export class ClusterRestrictionAlias {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', comment: "Alias como aparece na BASE (ex: 'IPA', 'OSCAR')" })
  alias!: string;

  @Column({ type: 'text', comment: 'exact | like' })
  match_kind!: AliasMatchKind;

  @Column({ type: 'jsonb', comment: "Padrões: ['%IPANEMA%'] para like ou nomes exatos" })
  patterns!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
