import { IsNull, type DataSource, type Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Grade } from '../../../entities/grade.entity.js';
import { GradeSizeQty } from '../../../entities/grade-size-qty.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateGradeInput, type GradeOutput } from '../dto/grades.dto.js';

@Injectable()
export class CreateGradeTask extends Task<GradeOutput> {
  protected validations = [verifyBody(CreateGradeInput, true)];

  constructor(
    @Inject('DataSource') private readonly ds: DataSource,
    @Inject('GradeRepository') private readonly grades: Repository<Grade>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<GradeOutput> {
    const tenantId = input.headers.tenantId as string;
    const dto = input.body as CreateGradeInput;

    const collection = await this.collections.findOne({ where: { id: dto.collection_id } });
    if (!collection) {
      throw HttpError.NotFound('collection_not_found', 'Coleção não encontrada');
    }

    const code = dto.code.trim();
    if (!code) {
      throw HttpError.BadRequest('code_required', 'code não pode ser vazio');
    }

    const seen = new Set<string>();
    for (const s of dto.sizes) {
      const key = s.size.trim();
      if (!key) throw HttpError.BadRequest('size_required', 'size não pode ser vazio');
      if (seen.has(key)) {
        throw HttpError.BadRequest('size_duplicated', `Tamanho duplicado: ${key}`);
      }
      seen.add(key);
    }

    const duplicated = await this.grades.findOne({
      where: [
        { collection_id: dto.collection_id, tenant_id: tenantId, code },
        { collection_id: dto.collection_id, tenant_id: IsNull(), code },
      ],
    });
    if (duplicated) {
      throw HttpError.Conflict(
        'grade_code_conflict',
        `Já existe grade com code=${code} nesta coleção`,
      );
    }

    const totalPieces = dto.sizes.reduce((acc, s) => acc + s.qty, 0);

    return this.ds.transaction(async (manager) => {
      const gradeRepo = manager.getRepository(Grade);
      const sizeRepo = manager.getRepository(GradeSizeQty);

      const grade = gradeRepo.create({
        collection_id: dto.collection_id,
        tenant_id: tenantId,
        code,
        total_pieces: totalPieces,
        is_system: false,
      });
      const saved = await gradeRepo.save(grade);

      const sizeEntities = dto.sizes.map((s) =>
        sizeRepo.create({ grade_id: saved.id, size: s.size.trim(), qty: s.qty }),
      );
      await sizeRepo.save(sizeEntities);

      return {
        id: saved.id,
        collection_id: saved.collection_id,
        code: saved.code,
        tenant_id: saved.tenant_id,
        is_system: saved.is_system,
        total_pieces: saved.total_pieces,
        sizes: sizeEntities.map((s) => ({ size: s.size, qty: s.qty })),
      };
    });
  }
}
