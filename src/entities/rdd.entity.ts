import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Collection } from './collection.entity.js';

@Entity({
  name: 'rdd',
  comment: 'Códigos de data de entrega (RDD) por coleção. Serial Excel ↔ date.',
})
@Index('rdd_collection_serial_unique', ['collection_id', 'serial'], { unique: true })
export class Rdd {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'FK collection' })
  collection_id!: string;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection?: Collection;

  @Column({ type: 'int', comment: 'Serial Excel (usado na col P do Click)' })
  serial!: number;

  @Column({ type: 'date', comment: 'Data correspondente ao serial' })
  date!: string;

  @Column({ type: 'text', nullable: true, comment: 'Label amigável (ex: MAY-26)' })
  label!: string | null;
}
