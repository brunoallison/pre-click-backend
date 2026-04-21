import { In, IsNull, type Repository } from 'typeorm';
import { Grade } from '../../../entities/grade.entity.js';
import { GradeSizeQty } from '../../../entities/grade-size-qty.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { ListGradesQuery, type GradeOutput } from '../dto/grades.dto.js';

@Injectable()
export class ListGradesTask extends Task<GradeOutput[]> {
  protected validations = [verifyQuery(ListGradesQuery)];

  constructor(
    @Inject('GradeRepository') private readonly grades: Repository<Grade>,
    @Inject('GradeSizeQtyRepository') private readonly sizes: Repository<GradeSizeQty>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<GradeOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id } = input.query as { collection_id?: string };
    if (!collection_id) {
      throw HttpError.BadRequest('collection_id_required', 'Parâmetro collection_id é obrigatório');
    }

    const rows = await this.grades.find({
      where: [
        { collection_id, tenant_id: IsNull() },
        { collection_id, tenant_id: tenantId },
      ],
      order: { is_system: 'DESC', code: 'ASC' },
    });

    if (rows.length === 0) return [];

    const sizeRows = await this.sizes.find({
      where: { grade_id: In(rows.map((g) => g.id)) },
      order: { size: 'ASC' },
    });

    const sizesByGrade = new Map<string, Array<{ size: string; qty: number }>>();
    for (const s of sizeRows) {
      const list = sizesByGrade.get(s.grade_id);
      const entry = { size: s.size, qty: s.qty };
      if (list) list.push(entry);
      else sizesByGrade.set(s.grade_id, [entry]);
    }

    return rows.map((g) => ({
      id: g.id,
      collection_id: g.collection_id,
      code: g.code,
      tenant_id: g.tenant_id,
      is_system: g.is_system,
      total_pieces: g.total_pieces,
      sizes: sizesByGrade.get(g.id) ?? [],
    }));
  }
}
