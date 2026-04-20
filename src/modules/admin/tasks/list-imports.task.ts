import type { Repository } from 'typeorm';
import { ImportBase } from '../../../entities/import-base.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task } from '../../../utils/task.js';

interface ImportOut {
  id: string;
  collection_id: string;
  version_tag: string;
  file_name: string;
  status: string;
  uploaded_at: string;
  rows_new: number | null;
  rows_updated: number | null;
  rows_removed: number | null;
}

@Injectable()
export class ListImportsTask extends Task<ImportOut[]> {
  constructor(@Inject('ImportBaseRepository') private readonly imports: Repository<ImportBase>) {
    super();
  }
  async execute(): Promise<ImportOut[]> {
    const rows = await this.imports.find({ order: { uploaded_at: 'DESC' }, take: 100 });
    return rows.map((r) => ({
      id: r.id,
      collection_id: r.collection_id,
      version_tag: r.version_tag,
      file_name: r.file_name,
      status: r.status,
      uploaded_at: r.uploaded_at.toISOString(),
      rows_new: r.rows_new,
      rows_updated: r.rows_updated,
      rows_removed: r.rows_removed,
    }));
  }
}
