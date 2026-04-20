import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { ImportBase } from '../../../entities/import-base.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { GcsProvider } from '../../../providers/gcs/gcs.provider.js';
import type { ImportBaseOutput } from '../dto/import-base.dto.js';

@Injectable()
export class ImportBaseTask extends Task<ImportBaseOutput> {
  constructor(
    @Inject('ImportBaseRepository') private readonly imports: Repository<ImportBase>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject(GcsProvider) private readonly gcs: GcsProvider,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<ImportBaseOutput> {
    const file = input.file;
    if (!file) throw HttpError.BadRequest('validation_failed', 'Arquivo ausente');
    const body = input.body as { season_code: string; country: string };
    if (!body.season_code || !body.country) {
      throw HttpError.BadRequest('validation_failed', 'season_code e country obrigatórios');
    }

    const collection = await this.collections.findOne({
      where: { code: body.season_code, country: body.country },
    });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    const versionTag = this.extractVersion(file.originalname);
    const s3Key = `imports/${collection.id}/${versionTag}/${Date.now()}.xlsx`;
    await this.gcs.upload(
      s3Key,
      file.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const importRow = await this.imports.save({
      collection_id: collection.id,
      country: body.country,
      version_tag: versionTag,
      is_initial: false,
      file_name: file.originalname,
      gcs_key: s3Key,
      status: 'pending',
      uploaded_by: input.headers.userId as string,
    });

    // TODO: enfileirar no BullMQ ('import-base' queue).
    const jobId = randomUUID();
    return { import_id: importRow.id, job_id: jobId, status: 'queued' };
  }

  private extractVersion(name: string): string {
    const match = name.match(/V(\d{3,4})/i);
    return match ? `V${match[1]}` : `V${Date.now()}`;
  }
}
